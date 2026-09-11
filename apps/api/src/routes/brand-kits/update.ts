/**
 * PATCH /v1/brand-kits/:id (docs/16 §5.4).
 * الدور: admin+.
 * المدخل: JSON Merge Patch (RFC 7396).
 *
 * المسارات المحجوبة (لا تُعدَّل عبر هذا endpoint):
 *   - id, createdAt, updatedAt, tenantId, version (محسوبة/auto-managed)
 *   - assets.version (عبر §5.7 فقط)
 *   - fonts.primary.licenseAck (عبر §5.5)
 *   - attribution.logoAcks[*].licenseAck (عبر §5.6)
 * أيّ محاولة → 400 IMMUTABLE_FIELD مع field يشير للمسار.
 *
 * BK-NUMERALS (2026-09-08): مفتاح top-level خارج ALLOWED_TOP_LEVEL ⇒
 * 400 VALIDATION_FAILED. سابقاً كان mergePatch يبتلعه بلا فحص، فيدخل
 * config jsonb صامتاً (مثال: `numerals: 'arabic'` في الجذر بدل
 * `typography.bidi.numerals`). قاعدة: نمط A27 plan_overrides — كل
 * مفتاح مصرَّح أو مرفوض، لا وسط.
 *
 * الحارس `check:brand-kit-patch-coverage` يقارن BrandKit type بـALLOWED
 * — أيّ حقل جديد في النوع بلا support يفشل البناء.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { mergePatch, findBlockedPath, type JsonObject, type JsonValue } from '../../shared/json-merge-patch.js';
import { toFull, type DbBrandKitRow } from '../../shared/brand-kit-mapper.js';
import { ImmutableField, NotFound, ValidationFailed, InvalidFontMetrics } from '../../errors.js';
import type { PoolClient } from 'pg';

const paramsSchema = z.object({ id: z.string().uuid() });

// dot-notation، `*` = wildcard على أيّ مفتاح مستوى.
const BLOCKED_PATHS = [
  'id',
  'createdAt',
  'updatedAt',
  'tenantId',
  'version',                      // BrandKit.version — auto-managed
  'assets.version',
  'fonts.primary.licenseAck',
  'attribution.logoAcks.*.licenseAck',
];

/**
 * مفاتيح top-level المسموحة في PATCH — مستمدّة من BrandKit في
 * packages/shared/src/brand-kit.ts (readonly). أيّ مفتاح خارج هذه
 * القائمة ⇒ 400 VALIDATION_FAILED. `name` مُعالَج منفصلاً (عمود DB).
 *
 * الحارس `check:brand-kit-patch-coverage` يفرض أن هذه القائمة تغطّي
 * كل حقل قابل للتعديل في BrandKit (BrandKit ∖ BLOCKED_TOP).
 */
const ALLOWED_TOP_LEVEL: readonly string[] = [
  'name',
  'direction', 'locale',
  'fonts', 'colors', 'logo', 'typography',
  'badges', 'gradient', 'shadows', 'margins', 'motion',
  'outputs', 'audio',
  'attribution', 'assets', 'placement',
  'transcription', 'tts',
];
const ALLOWED_SET = new Set(ALLOWED_TOP_LEVEL);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);
    const patch = req.body as JsonValue;

    // فحص المحظور قبل أيّ عمل DB
    const blocked = findBlockedPath(patch, BLOCKED_PATHS);
    if (blocked) throw ImmutableField(blocked);

    // BK-NUMERALS: رفض مفتاح top-level غير معروف قبل أيّ عمل DB.
    // مفتاح مثل `numerals: 'arabic'` في الجذر (بدل typography.bidi.numerals)
    // كان يُبتلع صامتاً ⇒ يدخل config ولا يُطبَّق. الآن يفشل صراحةً.
    if (typeof patch === 'object' && patch !== null && !Array.isArray(patch)) {
      for (const k of Object.keys(patch)) {
        if (!ALLOWED_SET.has(k)) throw ValidationFailed(k);
      }
    }

    // 1. جلب الحالة الحالية
    const current = await req.dbClient!.query<DbBrandKitRow>(
      `SELECT id, tenant_id, name, config, created_at, updated_at
       FROM brand_kits WHERE id = $1`,
      [id],
    );
    if (current.rowCount === 0) throw NotFound();
    const row = current.rows[0]!;

    // 2. فصل تحديث `name` (عمود) عن config (jsonb)
    const patchObj = (typeof patch === 'object' && patch !== null && !Array.isArray(patch))
      ? patch as JsonObject
      : {};

    let nextName = row.name;
    if ('name' in patchObj) {
      const v = patchObj['name'];
      if (typeof v === 'string' && v.length >= 1 && v.length <= 100) {
        nextName = v;
      } else {
        // name = null أو نوع خاطئ → خطأ
        throw ImmutableField('name'); // معالجة أفضل: VALIDATION_FAILED — لكن IMMUTABLE يوضّح أن الحقل موجود لكن غير صالح هنا
      }
    }

    // نستبعد name من patch لأن config لا يحمله (عمود منفصل)
    const { name: _n, ...patchForConfig } = patchObj;

    const mergedConfig = mergePatch(row.config as JsonValue, patchForConfig as JsonValue);

    // FONT-METRICS-UPLOAD (90) — حين يُقدَّم assetId لخطّ في الPATCH،
    // نجلب metrics من assets.metadata.metrics (المُقاسة عند finalize) ونحقنها
    // في نفس الوزن. الغياب ⇒ 422 INVALID_FONT_METRICS (الخطّ غير مقيس).
    await injectFontMetricsFromAssets(req.dbClient!, patchForConfig as JsonObject, mergedConfig as JsonObject);

    // 3. UPDATE (RLS يحمي — نفس المستأجر)
    const updated = await req.dbClient!.query<DbBrandKitRow>(
      `UPDATE brand_kits
       SET name = $2, config = $3
       WHERE id = $1
       RETURNING id, tenant_id, name, config, created_at, updated_at`,
      [id, nextName, mergedConfig],
    );
    return toFull(updated.rows[0]!);
  });
};

/**
 * FONT-METRICS-UPLOAD (90) — إن ذكر PATCH `assetId` لأيّ وزن خطّ، نجلب
 * الأصل ونحقن metrics من `assets.metadata.metrics` في `mergedConfig`.
 * يمرّ عبر `req.dbClient` (RLS — لا نقرأ أصولاً لمستأجر آخر).
 *
 * السلوك:
 *   • assetId في patch + asset له metrics ⇒ حقن (override أيّ قيمة عميل)
 *   • assetId في patch + asset بلا metrics ⇒ 422 INVALID_FONT_METRICS
 *   • assetId في patch + asset غير موجود ⇒ 422 INVALID_FONT_METRICS
 *     (نتجنّب 404 حتى لا نكشف وجود/غياب أصول مستأجرين آخرين)
 *   • لا assetId في patch ⇒ لا فعل
 */
async function injectFontMetricsFromAssets(
  db: PoolClient,
  patch: JsonObject,
  merged: JsonObject,
): Promise<void> {
  const patchFonts = patch['fonts'];
  if (!patchFonts || typeof patchFonts !== 'object' || Array.isArray(patchFonts)) return;

  const familyKeys = ['primary'] as const;
  // نمرّ على primary أوّلاً، ثم على byLocale.<group> إن وُجدت
  const patchFamilies: [string[], JsonObject][] = [];
  for (const k of familyKeys) {
    const f = (patchFonts as JsonObject)[k];
    if (f && typeof f === 'object' && !Array.isArray(f)) patchFamilies.push([['fonts', k], f as JsonObject]);
  }
  const patchByLocale = (patchFonts as JsonObject)['byLocale'];
  if (patchByLocale && typeof patchByLocale === 'object' && !Array.isArray(patchByLocale)) {
    for (const group of Object.keys(patchByLocale as JsonObject)) {
      const f = (patchByLocale as JsonObject)[group];
      if (f && typeof f === 'object' && !Array.isArray(f)) patchFamilies.push([['fonts', 'byLocale', group], f as JsonObject]);
    }
  }

  for (const [famPath, famPatch] of patchFamilies) {
    const weights = famPatch['weights'];
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)) continue;
    for (const weightKey of Object.keys(weights as JsonObject)) {
      const w = (weights as JsonObject)[weightKey];
      if (!w || typeof w !== 'object' || Array.isArray(w)) continue;
      const assetId = (w as JsonObject)['assetId'];
      if (typeof assetId !== 'string') continue;

      const r = await db.query<{ metadata: Record<string, unknown> | null }>(
        `SELECT metadata FROM assets WHERE id = $1 AND kind = 'font'`,
        [assetId],
      );
      if (r.rowCount === 0) throw InvalidFontMetrics();
      const meta = r.rows[0]!.metadata;
      const metrics = meta && typeof meta === 'object' ? (meta['metrics'] as unknown) : undefined;
      if (!metrics || typeof metrics !== 'object') throw InvalidFontMetrics();
      const m = metrics as Record<string, unknown>;
      if (typeof m['ascent'] !== 'number' || typeof m['descent'] !== 'number' || typeof m['unitsPerEm'] !== 'number') {
        throw InvalidFontMetrics();
      }

      // حقن في mergedConfig — نضمن وجود المسار (mergePatch أنشأه من patch)
      let cursor: JsonObject = merged;
      for (const seg of famPath) {
        if (!cursor[seg] || typeof cursor[seg] !== 'object' || Array.isArray(cursor[seg])) {
          cursor[seg] = {};
        }
        cursor = cursor[seg] as JsonObject;
      }
      if (!cursor['weights'] || typeof cursor['weights'] !== 'object' || Array.isArray(cursor['weights'])) {
        cursor['weights'] = {};
      }
      const weightsMerged = cursor['weights'] as JsonObject;
      if (!weightsMerged[weightKey] || typeof weightsMerged[weightKey] !== 'object' || Array.isArray(weightsMerged[weightKey])) {
        weightsMerged[weightKey] = {};
      }
      const wMerged = weightsMerged[weightKey] as JsonObject;
      wMerged['metrics'] = { ascent: m['ascent'], descent: m['descent'], unitsPerEm: m['unitsPerEm'] };
    }
  }
}

export default route;
