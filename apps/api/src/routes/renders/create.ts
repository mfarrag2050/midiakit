/**
 * POST /v1/renders (docs/16 §8.1). writer+.
 *
 * تسلسل ذرّي:
 *   1. جلب المشروع + brand_kit + template (RLS يحمي)
 *   2. RENDER_NOT_ALLOWED_IN_CURRENT_STATE إن كان workflow يمنع
 *      (بسيط في A18: state='review'|'approved' يسمح، غيرها؟ — راجع الانحرافات)
 *   3. QUOTA_EXCEEDED_RENDERS: عدّ queued+running في المستأجر ≥ حدّ
 *   4. UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS: أيّ assetId أو URL http في brand
 *   5. Idempotency-Key: إن وُجد وسبق ⇒ يعيد الـrender السابق (202)
 *   6. INSERT renders (status=queued، snapshots كاملة)
 *   7. enqueueRender إلى BullMQ
 *   8. 202 مع {id, status:'queued', queuedAt, estimatedStartAt, snapshot_ids}
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { config } from '../../config.js';
import { enqueueRender } from '../../queues/index.js';
import {
  NotFound, QuotaExceededRenders, UnsupportedBrandHasExternalAssets,
} from '../../errors.js';

const bodySchema = z.object({
  project_id: z.string().uuid(),
  size: z.enum(['x', 'instagram', 'feed', 'reel']),
  format: z.enum(['png', 'mp4']),
  priority: z.enum(['urgent', 'normal']).optional().default('normal'),
});

interface ProjectRow {
  id: string; tenant_id: string; brand_kit_id: string; template_id: string;
  content: Record<string, unknown>; state: string;
}
interface BrandKitRow { id: string; config: Record<string, unknown> }
interface TemplateRow { id: string; definition: Record<string, unknown> }
interface RenderRow { id: string; status: string; created_at: Date }

// فحص «brand بلا أصول خارجية» (MVP A18):
// - أيّ حقل url يبدأ بـhttp أو https خارج مسار محلّي ⇒ مرفوض
// - أيّ assetId موجود ⇒ مرفوض (يحتاج S3 fetch في worker)
function hasExternalAssets(brand: Record<string, unknown>): boolean {
  const flat = JSON.stringify(brand);
  if (/"assetId"\s*:\s*"[^"]/.test(flat)) return true;
  if (/"url"\s*:\s*"https?:\/\//.test(flat)) return true;
  if (/"url"\s*:\s*"mem:\/\//.test(flat)) return true;
  if (/"url"\s*:\s*"s3:\/\//.test(flat)) return true;
  return false;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const body = bodySchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key']
      ? String(req.headers['idempotency-key']).slice(0, 200)
      : null;

    // 1. جلب المشروع
    const pr = await req.dbClient!.query<ProjectRow>(
      `SELECT id, tenant_id, brand_kit_id, template_id, content, state
       FROM projects WHERE id = $1 AND deleted_at IS NULL`, [body.project_id],
    );
    if (pr.rowCount === 0) throw NotFound();
    const proj = pr.rows[0]!;

    // 5-idempotency (قبل الـsnapshots لتفادي عمل مكرَّر)
    if (idempotencyKey) {
      const existing = await req.dbClient!.query<RenderRow>(
        `SELECT id, status, created_at FROM renders
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [req.auth!.tenantId, idempotencyKey],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const r = existing.rows[0]!;
        reply.status(202).send({
          id: r.id, status: 'queued',
          queuedAt: r.created_at.toISOString(),
          estimatedStartAt: new Date(r.created_at.getTime() + 5000).toISOString(),
          brand_snapshot_id: r.id,
          template_snapshot_id: r.id,
        });
        return;
      }
    }

    // 3. QUOTA_EXCEEDED_RENDERS — حصة التوازي (فحص التطبيق L-58 قبل السقف الحقيقي)
    const active = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM renders
       WHERE tenant_id = $1 AND status IN ('queued', 'running')`,
      [req.auth!.tenantId],
    );
    if ((active.rows[0]?.n ?? 0) >= config.RENDER_CONCURRENCY_LIMIT) throw QuotaExceededRenders();

    // 2. brand_kit + template
    const bkr = await req.dbClient!.query<BrandKitRow>(
      `SELECT id, config FROM brand_kits WHERE id = $1`, [proj.brand_kit_id],
    );
    if (bkr.rowCount === 0) throw NotFound();
    const brand = bkr.rows[0]!.config;

    // 4. UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS
    if (hasExternalAssets(brand)) throw UnsupportedBrandHasExternalAssets();

    const tpl = await req.dbClient!.query<TemplateRow>(
      `SELECT id, definition FROM templates WHERE id = $1 AND deleted_at IS NULL`, [proj.template_id],
    );
    if (tpl.rowCount === 0) throw NotFound();
    const template = tpl.rows[0]!.definition;

    // 6. INSERT render مع snapshots (ذرّي — brand_kit تعديل لاحق لا يمسّها)
    const ins = await req.dbClient!.query<{ id: string; created_at: Date }>(
      `INSERT INTO renders(tenant_id, project_id, size, format, status,
                           brand_snapshot, template_snapshot,
                           requested_by, idempotency_key)
       VALUES ($1, $2, $3, $4, 'queued', $5::jsonb, $6::jsonb, $7, $8)
       RETURNING id, created_at`,
      [
        req.auth!.tenantId, body.project_id, body.size, body.format,
        JSON.stringify(brand), JSON.stringify(template),
        req.auth!.userId, idempotencyKey,
      ],
    );
    const r = ins.rows[0]!;

    // 7. enqueue إلى BullMQ (Fair-share priority)
    try {
      await enqueueRender({
        renderId: r.id,
        tenantId: req.auth!.tenantId,
        projectId: body.project_id,
        size: body.size,
        format: body.format,
        brandSnapshot: brand,
        templateSnapshot: template,
        content: proj.content ?? {},
      }, body.priority);
    } catch (err) {
      req.log.error({ err, renderId: r.id }, 'enqueue failed — render سيبقى queued (سيُستعاد بعد ذلك)');
      // نُبقي الصف queued — retry job منفصل ممكن. لا نفشل الاستجابة.
    }

    reply.status(202).send({
      id: r.id,
      status: 'queued',
      queuedAt: r.created_at.toISOString(),
      estimatedStartAt: new Date(r.created_at.getTime() + 5000).toISOString(),
      brand_snapshot_id: r.id,
      template_snapshot_id: r.id,
    });
  });
};
export default route;
