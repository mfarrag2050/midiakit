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
import { ImmutableField, NotFound, ValidationFailed } from '../../errors.js';

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

export default route;
