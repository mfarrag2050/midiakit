/**
 * DELETE /v1/projects/:id — حذف مشروع (docs/16 §7.5).
 * الدور: admin+ OR (المنشئ AND state='draft').
 *
 * 409 PROJECT_HAS_RENDERS إن كان له تصديرات (Q5 حسم: نرفض الحذف).
 * soft delete (deleted_at) — يحمي التصديرات المرجعية (docs/13).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  NotFound, InsufficientRole, ProjectHasRenders,
} from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    const { id } = paramsSchema.parse(req.params);

    const cur = await req.dbClient!.query<{ state: string; created_by: string | null }>(
      `SELECT state, created_by FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const project = cur.rows[0]!;

    // RBAC: admin+ أو (المنشئ + state='draft')
    const role = req.auth!.role;
    const isAdminPlus = role === 'owner' || role === 'admin';
    const isCreator = project.created_by === req.auth!.userId;
    const allowedDraftOwner = isCreator && project.state === 'draft';
    if (!isAdminPlus && !allowedDraftOwner) throw InsufficientRole();

    // PROJECT_HAS_RENDERS (§7.5)
    const rn = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM renders WHERE project_id = $1`, [id],
    );
    if ((rn.rows[0]?.n ?? 0) > 0) throw ProjectHasRenders();

    await req.dbClient!.query(
      `UPDATE projects SET deleted_at = now() WHERE id = $1`, [id],
    );
    reply.status(204).send();
  });
};

export default route;
