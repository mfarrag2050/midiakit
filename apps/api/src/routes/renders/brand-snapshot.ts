/**
 * GET /v1/renders/:id/brand-snapshot (docs/16 §8.5). viewer+.
 * يعيد كائن BrandKit كامل من renders.brand_snapshot (jsonb).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, BrandSnapshotNotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id/brand-snapshot', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{ brand_snapshot: Record<string, unknown> | null }>(
      `SELECT brand_snapshot FROM renders WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    if (!r.rows[0]!.brand_snapshot) throw BrandSnapshotNotFound();
    return r.rows[0]!.brand_snapshot;
  });
};
export default route;
