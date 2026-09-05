/**
 * POST /v1/projects/:id/transitions (docs/16 §11.7).
 * الدور: يعتمد على transitions[].requiredRole (owner/admin يمرّان دائماً).
 *
 * الأخطاء:
 *   403 TRANSITION_ROLE_REQUIRED — دور غير كافٍ
 *   409 TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE
 *   400 REASON_REQUIRED_FOR_THIS_TRANSITION
 *   409 PROJECT_HAS_NO_WORKFLOW (المشروع بلا workflow_id)
 *
 * الأثر:
 *   - UPDATE projects.state = to (+ assignee_id إن أُرسل)
 *   - INSERT transitions(from_state, to_state, transitioned_by, reason)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  NotFound, ProjectHasNoWorkflow, TransitionNotAvailableFromCurrentState,
  ReasonRequiredForThisTransition, TransitionRoleRequired,
} from '../../errors.js';
import type { WorkflowTransition } from '../workflows/shared/schema.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  transitionId: z.string().min(1),
  reason: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

interface PRow {
  state: string;
  workflow_id: string | null;
  created_by: string | null;
  assignee_id: string | null;
}

interface WRow { transitions: WorkflowTransition[] }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/transitions', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const pr = await req.dbClient!.query<PRow>(
      `SELECT state, workflow_id, created_by, assignee_id
       FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (pr.rowCount === 0) throw NotFound();
    const p = pr.rows[0]!;

    if (!p.workflow_id) throw ProjectHasNoWorkflow();

    const wr = await req.dbClient!.query<WRow>(
      `SELECT transitions FROM workflows WHERE id = $1`, [p.workflow_id],
    );
    if (wr.rowCount === 0) throw NotFound();
    const trs = wr.rows[0]!.transitions;

    const t = trs.find((x) => x.id === body.transitionId);
    if (!t) throw TransitionNotAvailableFromCurrentState();
    if (t.from !== p.state) throw TransitionNotAvailableFromCurrentState();

    // requiredRole — owner/admin يمرّان
    const role = req.auth!.role;
    const isAdminPlus = role === 'owner' || role === 'admin';
    if (t.requiredRole && !isAdminPlus && t.requiredRole !== role) {
      throw TransitionRoleRequired();
    }

    // reason
    if (t.requiresReason && (!body.reason || body.reason.trim().length === 0)) {
      throw ReasonRequiredForThisTransition();
    }

    // UPDATE state + optional assignee
    if (body.assigneeId !== undefined) {
      await req.dbClient!.query(
        `UPDATE projects SET state = $1, assignee_id = $2 WHERE id = $3`,
        [t.to, body.assigneeId, id],
      );
    } else {
      await req.dbClient!.query(
        `UPDATE projects SET state = $1 WHERE id = $2`,
        [t.to, id],
      );
    }

    // INSERT transition log
    await req.dbClient!.query(
      `INSERT INTO transitions(tenant_id, project_id, from_state, to_state, transitioned_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.auth!.tenantId, id, p.state, t.to, req.auth!.userId, body.reason ?? null],
    );

    // ارجع بحالة المشروع الجديدة (كـ§11.6)
    const p2 = await req.dbClient!.query<PRow>(
      `SELECT state, workflow_id, created_by, assignee_id FROM projects WHERE id = $1`, [id],
    );
    const np = p2.rows[0]!;

    // availableTransitions من الحالة الجديدة
    const availableTransitions = trs
      .filter((x) => x.from === np.state)
      .filter((x) => !x.requiredRole || x.requiredRole === role || isAdminPlus)
      .map((x) => ({
        id: x.id, to: x.to, label: x.label,
        ...(x.requiresReason !== undefined ? { requiresReason: x.requiresReason } : {}),
      }));

    // history
    const hr = await req.dbClient!.query(
      `SELECT id, from_state, to_state, transitioned_by, reason, at
       FROM transitions WHERE project_id = $1 ORDER BY at ASC`, [id],
    );

    return {
      projectId: id,
      workflowId: np.workflow_id,
      currentState: np.state,
      assigneeId: np.assignee_id,
      availableTransitions,
      history: hr.rows.map((h: any) => ({
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
