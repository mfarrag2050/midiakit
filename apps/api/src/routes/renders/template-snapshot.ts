/**
 * GET /v1/renders/:id/template-snapshot (docs/16 §8.6). viewer+.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, TemplateSnapshotNotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id/template-snapshot', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{ template_snapshot: Record<string, unknown> | null }>(
      `SELECT template_snapshot FROM renders WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    if (!r.rows[0]!.template_snapshot) throw TemplateSnapshotNotFound();
    return r.rows[0]!.template_snapshot;
  });
};
export default route;
