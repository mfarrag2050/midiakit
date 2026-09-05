/**
 * GET /v1/projects/:id/state (docs/16 §11.6). viewer+.
 *
 * يجمع الحالة من projects (state + assignee_id + workflow_id) + workflow
 * definition (availableTransitions المشتقة من current state + requiredRole)
 * + transitions table (history).
 *
 * إن كان المشروع بلا workflow_id ⇒ availableTransitions=[]، history=[]
 * (لا حالة رسمية). currentState = projects.state (افتراضي 'draft').
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound } from '../../errors.js';
import type { WorkflowTransition } from '../workflows/shared/schema.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface ProjectStateRow {
  id: string;
  state: string;
  assignee_id: string | null;
  workflow_id: string | null;
  created_by: string | null;
}

interface WorkflowRow {
  transitions: WorkflowTransition[];
}

interface TransitionRow {
  id: string;
  from_state: string | null;
  to_state: string;
  transitioned_by: string | null;
  reason: string | null;
  at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id/state', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);

    const pr = await req.dbClient!.query<ProjectStateRow>(
      `SELECT id, state, assignee_id, workflow_id, created_by
       FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (pr.rowCount === 0) throw NotFound();
    const p = pr.rows[0]!;

    // RBAC: viewer+ يرى المُسند إليه أو الذي أنشأه
    const isAdminPlus = req.auth!.role === 'owner' || req.auth!.role === 'admin';
    if (!isAdminPlus && p.created_by !== req.auth!.userId && p.assignee_id !== req.auth!.userId) {
      throw NotFound();
    }

    let availableTransitions: Array<Pick<WorkflowTransition, 'id' | 'to' | 'label' | 'requiresReason'>> = [];
    if (p.workflow_id) {
      const wr = await req.dbClient!.query<WorkflowRow>(
        `SELECT transitions FROM workflows WHERE id = $1`, [p.workflow_id],
      );
      if ((wr.rowCount ?? 0) > 0) {
        const trs = wr.rows[0]!.transitions;
        const role = req.auth!.role;
        availableTransitions = trs
          .filter((t) => t.from === p.state)
          .filter((t) => !t.requiredRole || t.requiredRole === role || role === 'owner' || role === 'admin')
          .map((t) => ({
            id: t.id, to: t.to, label: t.label,
            ...(t.requiresReason !== undefined ? { requiresReason: t.requiresReason } : {}),
          }));
      }
    }

    const hr = await req.dbClient!.query<TransitionRow>(
      `SELECT id, from_state, to_state, transitioned_by, reason, at
       FROM transitions WHERE project_id = $1 ORDER BY at ASC`, [id],
    );

    return {
      projectId: p.id,
      workflowId: p.workflow_id,
      currentState: p.state,
      assigneeId: p.assignee_id,
      availableTransitions,
      history: hr.rows.map((h) => ({
        transitionId: h.id,
        from: h.from_state,
        to: h.to_state,
        actorId: h.transitioned_by,
        reason: h.reason,
        at: h.at.toISOString(),
      })),
    };
  });
};
export default route;
