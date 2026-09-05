/**
 * PATCH /v1/projects/:id/annotations/:aid (docs/16 §12.3).
 * الدور: المؤلّف أو editor+ (owner/admin/editor).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, InsufficientRole } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid(), aid: z.string().uuid() });
const bodySchema = z.object({
  body: z.string().min(1).max(2000).optional(),
  resolved: z.boolean().optional(),
});

interface Row {
  id: string; author_id: string | null; target: unknown; body: string;
  resolved: boolean; created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id/annotations/:aid', { preHandler: fastify.authenticated }, async (req) => {
    const { id, aid } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const cur = await req.dbClient!.query<Row>(
      `SELECT id, author_id, target, body, resolved, created_at
       FROM annotations WHERE id = $1 AND project_id = $2`, [aid, id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const ann = cur.rows[0]!;

    const role = req.auth!.role;
    const isEditorPlus = role === 'owner' || role === 'admin' || role === 'editor';
    const isAuthor = ann.author_id === req.auth!.userId;
    if (!isEditorPlus && !isAuthor) throw InsufficientRole();

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.body !== undefined) { params.push(body.body); sets.push(`body = $${params.length}`); }
    if (body.resolved !== undefined) { params.push(body.resolved); sets.push(`resolved = $${params.length}`); }
    if (sets.length === 0) {
      return {
        id: ann.id, authorId: ann.author_id, target: ann.target, body: ann.body,
        resolved: ann.resolved, createdAt: ann.created_at.toISOString(),
      };
    }

    params.push(aid);
    const upd = await req.dbClient!.query<Row>(
      `UPDATE annotations SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, author_id, target, body, resolved, created_at`,
      params,
    );
    const row = upd.rows[0]!;
    return {
      id: row.id, authorId: row.author_id, target: row.target, body: row.body,
      resolved: row.resolved, createdAt: row.created_at.toISOString(),
    };
  });
};
export default route;
