/**
 * POST /v1/projects/:id/annotations (docs/16 §12.2). viewer+.
 *
 * LAYER_NOT_FOUND (404) — الطبقة غير موجودة في template.layers
 * INVALID_SEGMENT_INDEX (400) — segmentIndex سالب (فحص أعمق للطبقات
 * ذات المقاطع المتعدّدة مؤجَّل — Q4 من §12).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, LayerNotFound, InvalidSegmentIndex } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  target: z.object({
    kind: z.literal('layer'),
    layer: z.string().min(1).max(100),
    segmentIndex: z.number().int(),
  }),
  body: z.string().min(1).max(2000),
});

interface PRow { template_id: string }
interface TRow { definition: { layers?: Array<{ type?: string; field?: string }> } }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/annotations', { preHandler: fastify.authenticated }, async (req, reply) => {
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    if (body.target.segmentIndex < 0) throw InvalidSegmentIndex();

    const pr = await req.dbClient!.query<PRow>(
      `SELECT template_id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (pr.rowCount === 0) throw NotFound();

    // LAYER_NOT_FOUND — نتحقّق أن الطبقة موجودة في template.definition
    const tr = await req.dbClient!.query<TRow>(
      `SELECT definition FROM templates WHERE id = $1 AND deleted_at IS NULL`,
      [pr.rows[0]!.template_id],
    );
    if (tr.rowCount === 0) throw NotFound();
    const layers = tr.rows[0]!.definition.layers ?? [];
    // طبقات القالب تحمل type ("headline"/"solid"/…). العميل يشير عادةً
    // إلى type (headline · caption · source · attribution · kicker).
    const hasLayer = layers.some((l) => l.type === body.target.layer);
    if (!hasLayer) throw LayerNotFound();

    const ins = await req.dbClient!.query<{
      id: string; author_id: string | null; target: unknown; body: string;
      resolved: boolean; created_at: Date;
    }>(
      `INSERT INTO annotations(tenant_id, project_id, author_id, target, body)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, author_id, target, body, resolved, created_at`,
      [req.auth!.tenantId, id, req.auth!.userId, JSON.stringify(body.target), body.body],
    );
    const row = ins.rows[0]!;
    reply.status(201).send({
      id: row.id,
      authorId: row.author_id,
      target: row.target,
      body: row.body,
      resolved: row.resolved,
      createdAt: row.created_at.toISOString(),
    });
  });
};
export default route;
