/**
 * GET /v1/templates/:id — قالب واحد كامل (docs/16 §6.2).
 * الدور: viewer فما فوق.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toFull, type DbTemplateRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);

    const r = await req.dbClient!.query<DbTemplateRow>(
      `SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (r.rowCount === 0) throw NotFound();
    return toFull(r.rows[0]!);
  });
};

export default route;
