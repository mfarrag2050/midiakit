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
  UnsupportedKind, UnsupportedContentTypeForKind, SizeTooLarge,
} from '../../errors.js';

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

    // 2. حدّ الحجم — SIZE_TOO_LARGE
    if (parsed.sizeBytes > config.STORAGE_MAX_SIZE_BYTES) throw SizeTooLarge();

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
