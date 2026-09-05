/**
 * GET /v1/projects/:id/annotations (docs/16 §12.1). viewer+.
 * فلاتر: resolved · authorId · layer · segmentIndex
 * الغلاف §1.5.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, InvalidFilterField } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).passthrough();

const ALLOWED_FILTER_KEYS = new Set([
  'filter[resolved]', 'filter[authorId]', 'filter[layer]', 'filter[segmentIndex]',
]);
const RESERVED = new Set(['limit', 'cursor', 'sort']);

interface DbRow {
  id: string;
  author_id: string | null;
  target: unknown;
  body: string;
  resolved: boolean;
  created_at: Date;
  updated_at: Date;
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
  fastify.get('/:id/annotations', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const q = querySchema.parse(req.query);

    for (const k of Object.keys(req.query as Record<string, unknown>)) {
      if (RESERVED.has(k)) continue;
      if (!ALLOWED_FILTER_KEYS.has(k)) throw InvalidFilterField(k);
    }

    // تحقّق وجود المشروع + RBAC
    const pr = await req.dbClient!.query<{ created_by: string | null; assignee_id: string | null }>(
      `SELECT created_by, assignee_id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (pr.rowCount === 0) throw NotFound();
    const isAdminPlus = req.auth!.role === 'owner' || req.auth!.role === 'admin';
    if (!isAdminPlus) {
      const p = pr.rows[0]!;
      if (p.created_by !== req.auth!.userId && p.assignee_id !== req.auth!.userId) throw NotFound();
    }

    const raw = req.query as Record<string, string | undefined>;
    const params: unknown[] = [id];
    const where: string[] = [`project_id = $1`];

    if (raw['filter[resolved]'] === 'true' || raw['filter[resolved]'] === 'false') {
      params.push(raw['filter[resolved]'] === 'true');
      where.push(`resolved = $${params.length}`);
    }
    if (raw['filter[authorId]']) {
      params.push(raw['filter[authorId]']);
      where.push(`author_id = $${params.length}`);
    }
    if (raw['filter[layer]']) {
      params.push(raw['filter[layer]']);
      where.push(`target->>'layer' = $${params.length}`);
    }
    if (raw['filter[segmentIndex]']) {
      params.push(parseInt(raw['filter[segmentIndex]']!, 10));
      where.push(`(target->>'segmentIndex')::int = $${params.length}`);
    }

    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        params.push(c.createdAt, c.id);
        where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
      }
    }

    const sql = `
      SELECT * FROM annotations WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ${q.limit + 1}
    `;
    const r = await req.dbClient!.query<DbRow>(sql, params);
    const rows = r.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      data: trimmed.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        target: row.target,
        body: row.body,
        resolved: row.resolved,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: hasMore
        ? encodeCursor(trimmed[trimmed.length - 1]!.created_at, trimmed[trimmed.length - 1]!.id)
        : null,
      hasMore,
    };
  });
};
export default route;
