/**
 * GET /v1/renders (docs/16 §8.2). viewer+.
 * فلاتر: project_id · status · format · createdAt[gte/lte].
 * ترتيب افتراضي: -createdAt.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toSummary, encodeCursor, decodeCursor, type DbRenderRow } from './shared/mapper.js';
import { InvalidFilterField } from '../../errors.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).passthrough();

const ALLOWED = new Set([
  'filter[project_id]', 'filter[status]', 'filter[format]',
  'filter[createdAt][gte]', 'filter[createdAt][lte]',
]);
const RESERVED = new Set(['limit', 'cursor', 'sort']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);
    for (const k of Object.keys(req.query as Record<string, unknown>)) {
      if (RESERVED.has(k)) continue;
      if (!ALLOWED.has(k)) throw InvalidFilterField(k);
    }

    const raw = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = ['1=1'];

    if (raw['filter[project_id]']) { params.push(raw['filter[project_id]']); where.push(`project_id = $${params.length}`); }
    if (raw['filter[status]']) { params.push(raw['filter[status]']); where.push(`status = $${params.length}`); }
    if (raw['filter[format]']) { params.push(raw['filter[format]']); where.push(`format = $${params.length}`); }
    if (raw['filter[createdAt][gte]']) { params.push(new Date(raw['filter[createdAt][gte]'])); where.push(`created_at >= $${params.length}`); }
    if (raw['filter[createdAt][lte]']) { params.push(new Date(raw['filter[createdAt][lte]'])); where.push(`created_at <= $${params.length}`); }

    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        params.push(c.createdAt, c.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }

    const sql = `
      SELECT * FROM renders WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbRenderRow>(sql, params);
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
