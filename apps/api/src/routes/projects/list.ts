/**
 * GET /v1/projects — قائمة المشاريع (docs/16 §7.1).
 * الدور: viewer فما فوق — يرى المُسند إليه أو الذي أنشأه.
 *        admin+ يرى الكل.
 *
 * الفلاتر: filter[state] · filter[assignee] · filter[brand_kit_id] · filter[template_id]
 * الترتيب: sort=updatedAt|createdAt|title (مع `-`)
 * الغلاف: §1.5 {data, nextCursor, hasMore}
 * المحذوف ناعماً مستَبعَد صراحةً.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  toSummary, encodeCursor, decodeCursor, type DbProjectRow,
} from './shared/mapper.js';
import { InvalidFilterField } from '../../errors.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sort: z.enum([
    'updatedAt', 'createdAt', 'title',
    '-updatedAt', '-createdAt', '-title',
  ]).default('-updatedAt'),
}).passthrough();

const ALLOWED_FILTER_KEYS = new Set([
  'filter[state]', 'filter[assignee]',
  'filter[brand_kit_id]', 'filter[template_id]',
]);
const RESERVED_QUERY_KEYS = new Set(['limit', 'cursor', 'sort']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);

    for (const key of Object.keys(req.query as Record<string, unknown>)) {
      if (RESERVED_QUERY_KEYS.has(key)) continue;
      if (!ALLOWED_FILTER_KEYS.has(key)) throw InvalidFilterField(key);
    }

    const raw = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = ['deleted_at IS NULL'];

    // RBAC: admin+ يرى الكل. غير-admin يرى created_by=self OR assignee_id=self.
    const isAdminPlus = req.auth!.role === 'owner' || req.auth!.role === 'admin';
    if (!isAdminPlus) {
      params.push(req.auth!.userId);
      where.push(`(created_by = $${params.length} OR assignee_id = $${params.length})`);
    }

    if (raw['filter[state]']) {
      params.push(raw['filter[state]']);
      where.push(`state = $${params.length}`);
    }
    if (raw['filter[assignee]']) {
      params.push(raw['filter[assignee]']);
      where.push(`assignee_id = $${params.length}`);
    }
    if (raw['filter[brand_kit_id]']) {
      params.push(raw['filter[brand_kit_id]']);
      where.push(`brand_kit_id = $${params.length}`);
    }
    if (raw['filter[template_id]']) {
      params.push(raw['filter[template_id]']);
      where.push(`template_id = $${params.length}`);
    }

    const sortMap: Record<string, string> = {
      updatedAt:    'updated_at ASC, id ASC',
      '-updatedAt': 'updated_at DESC, id DESC',
      createdAt:    'created_at ASC, id ASC',
      '-createdAt': 'created_at DESC, id DESC',
      title:        'name ASC, id ASC',
      '-title':     'name DESC, id DESC',
    };
    const orderBy = sortMap[q.sort];

    if (q.cursor && (q.sort === '-updatedAt' || q.sort === 'updatedAt')) {
      const c = decodeCursor(q.cursor);
      if (c) {
        params.push(c.updatedAt, c.id);
        const cmp = q.sort === '-updatedAt' ? '<' : '>';
        where.push(`(updated_at, id) ${cmp} ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }

    const sql = `
      SELECT * FROM projects
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbProjectRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      data: trimmed.map(toSummary),
      nextCursor: hasMore
        ? encodeCursor(trimmed[trimmed.length - 1]!.updated_at, trimmed[trimmed.length - 1]!.id)
        : null,
      hasMore,
    };
  });
};

export default route;
