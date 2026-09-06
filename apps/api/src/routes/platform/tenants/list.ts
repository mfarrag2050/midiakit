/**
 * GET /v1/platform/tenants — قائمة المستأجرين (عابرة). owner/admin.
 * غلاف §1.5.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PlatformInsufficientRole } from '../../../errors.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

interface Row {
  id: string; name: string; plan: string; locale: string;
  plan_overrides: unknown; created_at: Date; updated_at: Date;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as { c?: string; i?: string };
    if (!p.c || !p.i) return null;
    return { createdAt: p.c, id: p.i };
  } catch { return null; }
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const role = req.platformAuth!.platformRole;
    if (role !== 'owner' && role !== 'admin' && role !== 'viewer') throw PlatformInsufficientRole();
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

    const sql = `SELECT id, name, plan, locale, plan_overrides, created_at, updated_at
                 FROM tenants WHERE ${where.join(' AND ')}
                 ORDER BY created_at DESC, id DESC LIMIT ${q.limit + 1}`;
    const r = await req.platformDbClient!.query<Row>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      data: trimmed.map((row) => ({
        id: row.id, name: row.name, plan: row.plan, locale: row.locale,
        planOverrides: row.plan_overrides,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
      nextCursor: hasMore
        ? encodeCursor(trimmed[trimmed.length - 1]!.created_at, trimmed[trimmed.length - 1]!.id)
        : null,
      hasMore,
    };
  });
};
export default route;
