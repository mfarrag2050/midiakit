/**
 * GET /v1/users — قائمة مستخدمي المستأجر (docs/16 §4.1).
 * الدور: viewer فما فوق.
 * التصفية: filter[role] · الترتيب: sort=createdAt أو -createdAt.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
  'filter[role]': z.enum(['owner', 'admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']).optional(),
});

interface DbUserRow {
  id: string;
  email: string;
  role: string;
  created_at: Date;
}

interface Cursor { createdAt: string; id: string }

function encodeCursor(row: DbUserRow): string {
  const c: Cursor = { createdAt: row.created_at.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    if (typeof c.createdAt === 'string' && typeof c.id === 'string') return c;
  } catch {}
  return null;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);
    const filterRole = q['filter[role]'];

    const params: unknown[] = [];
    const conds: string[] = [];
    if (filterRole) { params.push(filterRole); conds.push(`role = $${params.length}`); }

    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        if (q.sort === '-createdAt') {
          params.push(c.createdAt, c.id);
          conds.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        } else {
          params.push(c.createdAt, c.id);
          conds.push(`(created_at, id) > ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        }
      }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const orderBy = q.sort === 'createdAt' ? 'created_at ASC, id ASC' : 'created_at DESC, id DESC';
    params.push(q.limit + 1);
    const sql = `
      SELECT id, email, role, created_at
      FROM users ${where}
      ORDER BY ${orderBy}
      LIMIT $${params.length}
    `;

    const r = await req.dbClient!.query<DbUserRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const data = (hasMore ? rows.slice(0, q.limit) : rows).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at.toISOString(),
    }));
    const lastRow = hasMore ? rows[q.limit - 1] : null;
    return { data, nextCursor: lastRow ? encodeCursor(lastRow) : null, hasMore };
  });
};

export default route;
