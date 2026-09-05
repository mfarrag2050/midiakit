/**
 * GET /v1/workflows — قائمة (docs/16 §11.1). viewer+.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toSummary, encodeCursor, decodeCursor, type DbWorkflowRow } from './shared/mapper.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).passthrough();

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);

    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        params.push(c.createdAt, c.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }

    const sql = `
      SELECT * FROM workflows
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbWorkflowRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      data: trimmed.map(toSummary),
      nextCursor: hasMore
        ? encodeCursor(trimmed[trimmed.length - 1]!.created_at, trimmed[trimmed.length - 1]!.id)
        : null,
      hasMore,
    };
  });
};
export default route;
