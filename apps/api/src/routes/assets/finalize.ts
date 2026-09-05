/**
 * POST /v1/assets/:id/finalize — تأكيد الرفع (docs/16 §9.2).
 * الدور: writer فما فوق.
 *
 * تسلسل العمل:
 *   1. جلب الأصل — 404 NOT_FOUND إن لم يوجد (RLS يحمي العزل)
 *   2. HeadObject على التخزين — 404 UPLOAD_NOT_COMPLETED إن لم يوجد
 *   3. licenseAck: مُلزَم `true` لـfont+lottie (§9.2 قواعد licenseAck).
 *      الرفض الصريح لـfalse → 422 LICENSE_ACK_MUST_BE_TRUE.
 *   4. SVG warning: kind=svg يحمل <text> → warnings=[{SVG_HAS_TEXT}].
 *      إن كانت acknowledgedWarnings تحمل SVG_HAS_TEXT → نمرّر بلا رفض.
 *   5. UPDATE assets: finalized_at + license_ack + ack_by + ack_at
 *      + warnings + metadata.label.
 *   6. presignDownload → publicUrl (§9.2 يعيد publicUrl مع الاستجابة)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { config } from '../../config.js';
import { getStorage } from '../../storage/index.js';
import { toAssetResponse, type DbAssetRow } from './shared/mapper.js';
import {
  NotFound, UploadNotCompleted, LicenseAckMustBeTrue, InvalidSvgWithTextWarning,
} from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  licenseAck: z.boolean().optional(),
  acknowledgedBy: z.string().uuid().optional(),
  acknowledgedWarnings: z.array(z.string()).optional(),
  meta: z.object({ label: z.string().max(500).optional() }).partial().optional(),
});

const LICENSE_REQUIRED_KINDS = new Set(['font', 'lottie']);

function svgHasText(body: string): boolean {
  // فحص خفيف: <text> أو <tspan> في المحتوى (بلا XML parser كامل).
  // التحوّل الكامل إلى مسارات يتمّ في الاستوديو، والفحص هنا للتحذير فقط.
  return /<text\b|<tspan\b/i.test(body);
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/finalize', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body ?? {});

    // 1. جلب الأصل
    const cur = await req.dbClient!.query<DbAssetRow>(
      `SELECT * FROM assets WHERE id = $1`,
      [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const asset = cur.rows[0]!;

    // 2. HeadObject
    const head = await getStorage().headObject(asset.storage_key);
    if (!head.exists) throw UploadNotCompleted();

    // 3. licenseAck rules — font/lottie
    const licenseRequired = LICENSE_REQUIRED_KINDS.has(asset.kind);
    if (licenseRequired) {
      if (body.licenseAck === false) throw LicenseAckMustBeTrue();
      if (body.licenseAck !== true) throw LicenseAckMustBeTrue();
      if (!body.acknowledgedBy) throw LicenseAckMustBeTrue();
    }

    // 4. SVG warning
    let warnings: { code: string; message: string }[] | null = null;
    if (asset.kind === 'svg') {
      const text = await getStorage().getObjectText(asset.storage_key);
      if (svgHasText(text)) {
        const acked = (body.acknowledgedWarnings ?? []).includes('SVG_HAS_TEXT');
        if (!acked) {
          // نُسجِّل التحذير ونرفض القبول — العميل يعيد finalize بـacknowledgedWarnings.
          warnings = [{ code: 'SVG_HAS_TEXT', message: 'svg.text_not_converted' }];
          // نُخزّن التحذير حتى لو رفضنا — يُظهر السبب عند إعادة القراءة.
          await req.dbClient!.query(
            `UPDATE assets SET warnings = $1 WHERE id = $2`,
            [JSON.stringify(warnings), id],
          );
          throw InvalidSvgWithTextWarning();
        }
        // مُقرَّاً — نسجّل التحذير في السجلّ، ونمرّر
        warnings = [{ code: 'SVG_HAS_TEXT', message: 'svg.text_not_converted' }];
      }
    }

    // 5. UPDATE finalize
    const label = body.meta?.label ?? null;
    // نجمّع metadata: label أوّلاً، ثم أي capabilities مستخرَجة (بند لاحق).
    const metadata: Record<string, unknown> = { ...(asset.metadata ?? {}) };
    if (label != null) metadata.label = label;

    const upd = await req.dbClient!.query<DbAssetRow>(
      `UPDATE assets SET
         finalized_at = now(),
         license_ack = COALESCE($1, license_ack),
         ack_by = $2,
         ack_at = CASE WHEN $1 = true THEN now() ELSE ack_at END,
         metadata = $3,
         warnings = $4,
         size_bytes = COALESCE(size_bytes, $5),
         content_type = COALESCE(content_type, $6)
       WHERE id = $7
       RETURNING *`,
      [
        body.licenseAck ?? null,
        body.acknowledgedBy ?? null,
        JSON.stringify(metadata),
        warnings ? JSON.stringify(warnings) : null,
        head.sizeBytes ?? null,
        head.contentType ?? null,
        id,
      ],
    );
    const updated = upd.rows[0]!;

    // 6. presignDownload
    const dl = await getStorage().presignDownload(updated.storage_key, config.S3_PRESIGN_TTL_SECONDS);

    reply.status(200).send(toAssetResponse(updated, dl.publicUrl));
  });
};

export default route;
