/**
 * POST /v1/projects/:id/assign (docs/16 §11.8). editor+ (Q7 المؤقّت).
 * assigneeId nullable ⇒ إزالة الإسناد.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});

interface PRow { state: string; workflow_id: string | null; assignee_id: string | null }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/assign', { preHandler: fastify.authenticated }, async (req) => {
    // Q7 مؤقّت: editor+ (owner/admin/writer/editor)
    requireRoleIn(req, ['owner', 'admin', 'writer', 'editor']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const pr = await req.dbClient!.query<PRow>(
      `SELECT state, workflow_id, assignee_id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (pr.rowCount === 0) throw NotFound();

    await req.dbClient!.query(
      `UPDATE projects SET assignee_id = $1 WHERE id = $2`,
      [body.assigneeId, id],
    );

    const p2 = await req.dbClient!.query<PRow>(
      `SELECT state, workflow_id, assignee_id FROM projects WHERE id = $1`, [id],
    );
    const p = p2.rows[0]!;

    return {
      projectId: id,
      workflowId: p.workflow_id,
      currentState: p.state,
      assigneeId: p.assignee_id,
      availableTransitions: [],
      history: [],
    };
  });
};
export default route;
