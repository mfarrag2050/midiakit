/**
 * GET /v1/renders/:id (docs/16 §8.3). viewer+.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toFull, type DbRenderRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<DbRenderRow>(`SELECT * FROM renders WHERE id = $1`, [id]);
    if (r.rowCount === 0) throw NotFound();
    return toFull(r.rows[0]!);
  });
};
export default route;
