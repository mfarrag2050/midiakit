/**
 * GET /v1/workflows/:id (docs/16 §11.2). viewer+.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toFull, type DbWorkflowRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<DbWorkflowRow>(
      `SELECT * FROM workflows WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    return toFull(r.rows[0]!);
  });
};
export default route;
