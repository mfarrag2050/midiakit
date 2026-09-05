/**
 * GET /v1/brand-kits — قائمة موجزة (docs/16 §5.1).
 * الدور: viewer+ (أيّ مستخدم مصادَق).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toSummary, encodeCursor, decodeCursor, type DbBrandKitRow } from '../../shared/brand-kit-mapper.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sort: z.enum(['name', 'createdAt', 'updatedAt', '-name', '-createdAt', '-updatedAt']).default('-createdAt'),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);

    // خرائط sort → SQL ORDER BY (فقط الحقول المسموحة)
    const sortMap: Record<string, string> = {
      name: 'name ASC',
      '-name': 'name DESC',
      createdAt: 'created_at ASC, id ASC',
      '-createdAt': 'created_at DESC, id DESC',
      updatedAt: 'updated_at ASC, id ASC',
      '-updatedAt': 'updated_at DESC, id DESC',
    };
    const orderBy = sortMap[q.sort];

    const params: unknown[] = [];
    let cursorClause = '';
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!c) {
        // cursor تالف → نعامله كأول صفحة (لا خطأ عام؛ opaque).
      } else {
        // فقط للـsort على createdAt (الافتراضي). للأنواع الأخرى نتجاهل.
        // TODO: توسيع لدعم cursor على name/updatedAt عند الحاجة.
        if (q.sort === '-createdAt') {
          params.push(c.createdAt, c.id);
          cursorClause = `AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
        } else if (q.sort === 'createdAt') {
          params.push(c.createdAt, c.id);
          cursorClause = `AND (created_at, id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
        }
      }
    }

    // limit+1 لكشف hasMore
    params.push(q.limit + 1);
    const sql = `
      SELECT id, tenant_id, name, config, created_at, updated_at
      FROM brand_kits
      WHERE true ${cursorClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length}
    `;

    const r = await req.dbClient!.query<DbBrandKitRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const data = (hasMore ? rows.slice(0, q.limit) : rows).map(toSummary);
    const lastRow = hasMore ? rows[q.limit - 1] : null;

    return {
      data,
      nextCursor: lastRow ? encodeCursor(lastRow) : null,
      hasMore,
    };
  });
};

export default route;
