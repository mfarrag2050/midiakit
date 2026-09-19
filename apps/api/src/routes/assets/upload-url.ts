/**
 * POST /v1/assets/upload-url — طلب رفع موقَّت (docs/16 §9.1).
 * الدور: writer فما فوق.
 *
 * ينشئ صفّ assets بحالة draft (finalized_at IS NULL)، يعيد uploadUrl
 * موقَّت + assetId. العميل يرفع مباشرة إلى التخزين، ثم يستدعي §9.2.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireRoleIn } from '../../shared/role-guard.js';
import { config } from '../../config.js';
import { getStorage } from '../../storage/index.js';
import {
  ASSET_KINDS, isContentTypeAllowedForKind, type AssetKind,
} from './shared/kind-rules.js';
import {
  UnsupportedKind, UnsupportedContentTypeForKind, SizeTooLarge, StorageQuotaExceeded,
} from '../../errors.js';
import { getEffectiveLimits } from '../../config/effective-limits.js';

const bodySchema = z.object({
  kind: z.string(),
  filename: z.string().min(1).max(500),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().min(1).max(200),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/upload-url', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const parsed = bodySchema.parse(req.body);

    // 1. kind + content-type — UNSUPPORTED_KIND / UNSUPPORTED_CONTENT_TYPE_FOR_KIND
    if (!(ASSET_KINDS as readonly string[]).includes(parsed.kind)) throw UnsupportedKind();
    const kind = parsed.kind as AssetKind;
    if (!isContentTypeAllowedForKind(kind, parsed.contentType)) throw UnsupportedContentTypeForKind();

    // 2. حدّ الحجم — SIZE_TOO_LARGE (فرديّ · env-driven).
    if (parsed.sizeBytes > config.STORAGE_MAX_SIZE_BYTES) throw SizeTooLarge();

    // 2.b · 420 §٢ · حصّة التخزين المتراكمة — STORAGE_QUOTA_EXCEEDED.
    // ─────────────────────────────────────────────────────────────
    // كل ملفٍّ منفردٍ يمرّ SIZE_TOO_LARGE، لكنّ ألفَ ملفٍّ صغيرٍ لا يفعل.
    // نجمع SUM(size_bytes) لأصول المستأجر المكتملة (نفس نمط
    // usage/current.ts:47-50)، ونرفض إن كان `المجموع + الملفّ الجديد`
    // يتجاوز `plans.storage_quota_bytes` (nullable = غير محدود).
    //
    // **الأداء:** استعلامٌ واحد لكلّ رفع، مع RLS يقصر على المستأجر. لا
    // aggregate عبر كلّ الصفوف. عدّادٌ مسبوق (بـtrigger على assets)
    // يُبنى لاحقاً إن ظهرت مشكلة أداء — لم يُبنَ اليوم بأمر التذكرة.
    //
    // **فشلٌ مغلق:** `getEffectiveLimits` يرمي على مستأجرٍ مفقود ⇒
    // الاستثناء يصعد ⇒ لا تُصدَر presign. SUM يرمي على DB منقطعة ⇒
    // نفس المصير. لا try/catch يبتلع الفشل.
    const limits = await getEffectiveLimits(req.dbClient!, req.auth!.tenantId);
    if (limits.storageQuotaBytes !== null) {
      const used = await req.dbClient!.query<{ n: string }>(
        `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS n FROM assets
          WHERE finalized_at IS NOT NULL`,
      );
      const currentBytes = Number(used.rows[0]!.n);
      if (currentBytes + parsed.sizeBytes > limits.storageQuotaBytes) {
        throw StorageQuotaExceeded();
      }
    }

    // 3. توليد storage_key فريد: <tenantId>/<uuid>/<filename-safe>
    const assetId = randomUUID();
    const safeName = parsed.filename.replace(/[^\w.\-]/g, '_').slice(0, 200);
    const storageKey = `${req.auth!.tenantId}/${assetId}/${safeName}`;

    // 4. INSERT draft — finalized_at IS NULL
    await req.dbClient!.query(
      `INSERT INTO assets(id, tenant_id, kind, storage_key, filename, size_bytes, content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [assetId, req.auth!.tenantId, kind, storageKey, parsed.filename, parsed.sizeBytes, parsed.contentType],
    );

    // 5. presign
    const presign = await getStorage().presignUpload(
      storageKey, parsed.contentType, parsed.sizeBytes, config.S3_PRESIGN_TTL_SECONDS,
    );

    reply.status(200).send({
      uploadUrl: presign.uploadUrl,
      assetId,
      expiresAt: presign.expiresAt.toISOString(),
      maxSizeBytes: config.STORAGE_MAX_SIZE_BYTES,
    });
  });
};

export default route;
