/**
 * GET /v1/templates — قائمة قوالب (docs/16 §6.1).
 * الدور: viewer فما فوق (كل مصادَق).
 *
 * الفلاتر:
 *   filter[scope] = 'global' | 'tenant' | 'all' (افتراضي 'all')
 *   filter[kind]  = template.kind (static | video — راجع الانحرافات)
 *
 * **انحراف مُعلَن عن العقد:** §6.1 يذكر
 * `filter[kind]=card|breaking|reel` كأمثلة، لكن قيم template.kind
 * الفعلية في `packages/templates` هي `static|video` — Q4 مفتوح في العقد.
 * نتّبع القيم الفعلية.
 *
 * القائمة تستثني المحذوف ناعماً (deleted_at IS NULL).
 * القائمة بلا `definition` — تُطلَب عبر §6.2 لكل قالب.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  toSummary, encodeCursor, decodeCursor, type DbTemplateRow,
} from './shared/mapper.js';
import { InvalidFilterField } from '../../errors.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).passthrough();

const ALLOWED_FILTER_KEYS = new Set(['filter[scope]', 'filter[kind]']);
const RESERVED_QUERY_KEYS = new Set(['limit', 'cursor', 'sort']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);

    for (const key of Object.keys(req.query as Record<string, unknown>)) {
      if (RESERVED_QUERY_KEYS.has(key)) continue;
      if (!ALLOWED_FILTER_KEYS.has(key)) throw InvalidFilterField(key);
    }

    const raw = req.query as Record<string, string | undefined>;
    const scopeFilter = raw['filter[scope]'] ?? 'all';
    const kindFilter = raw['filter[kind]'];

    const params: unknown[] = [];
    const where: string[] = ['deleted_at IS NULL'];

    // RLS يحمي أصلاً — لكن نفلتر صراحةً لتقليل الحمل
    if (scopeFilter === 'global') where.push(`scope = 'global'`);
    else if (scopeFilter === 'tenant') where.push(`scope = 'tenant'`);
    // 'all' = بلا فلتر إضافي (RLS تحمي)

    if (kindFilter) {
      params.push(kindFilter);
      where.push(`kind = $${params.length}`);
    }

    // cursor
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        params.push(c.createdAt, c.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }

    const sql = `
      SELECT * FROM templates
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbTemplateRow>(sql, params);
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
