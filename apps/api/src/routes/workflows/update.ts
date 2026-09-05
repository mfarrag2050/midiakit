/**
 * PATCH /v1/workflows/:id (docs/16 §11.4). admin+.
 *
 * WORKFLOW_IN_USE_IMMUTABLE_FIELD (409) عند تعديل states[].id أو
 * transitions[].from/to إن كان workflow مربوطاً بمشاريع نشطة
 * (projects.workflow_id = هذا).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbWorkflowRow } from './shared/mapper.js';
import { validateWorkflowDefinition } from './shared/schema.js';
import { NotFound, WorkflowInUseImmutableField } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  states: z.array(z.record(z.unknown())).optional(),
  transitions: z.array(z.record(z.unknown())).optional(),
  isDefault: z.boolean().optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const cur = await req.dbClient!.query<DbWorkflowRow>(
      `SELECT * FROM workflows WHERE id = $1`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const old = cur.rows[0]!;

    // تحقّق IN_USE إن كان تعديل جوهري
    let sets: string[] = [];
    const params: unknown[] = [];

    if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }

    if (body.states !== undefined || body.transitions !== undefined) {
      // تحقّق أن workflow ليس مستعملاً في مشاريع نشطة (deleted_at IS NULL)
      const use = await req.dbClient!.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM projects
         WHERE workflow_id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if ((use.rows[0]?.n ?? 0) > 0) {
        // نفحص إن تغيّرت state.id أو from/to في transitions (مقابل قديم)
        const newDef = validateWorkflowDefinition({
          states: body.states ?? old.states,
          transitions: body.transitions ?? old.transitions,
        });
        const oldStateIds = new Set(old.states.map((s) => s.id));
        for (const s of newDef.states) if (!oldStateIds.has(s.id)) throw WorkflowInUseImmutableField('states[].id');
        for (const t of newDef.transitions) {
          const oldT = old.transitions.find((x) => x.id === t.id);
          if (oldT && (oldT.from !== t.from || oldT.to !== t.to)) throw WorkflowInUseImmutableField('transitions[].from/to');
        }
      } else {
        // بلا استعمال — نتحقّق فقط أن التعريف صحيح
        validateWorkflowDefinition({
          states: body.states ?? old.states,
          transitions: body.transitions ?? old.transitions,
        });
      }
      if (body.states) {
        params.push(JSON.stringify(body.states));
        sets.push(`states = $${params.length}::jsonb`);
      }
      if (body.transitions) {
        params.push(JSON.stringify(body.transitions));
        sets.push(`transitions = $${params.length}::jsonb`);
      }
    }

    if (body.isDefault !== undefined) {
      if (body.isDefault) {
        await req.dbClient!.query(`UPDATE workflows SET is_default = false WHERE is_default = true AND id != $1`, [id]);
      }
      params.push(body.isDefault);
      sets.push(`is_default = $${params.length}`);
    }

    if (sets.length === 0) return toFull(old);

    params.push(id);
    const upd = await req.dbClient!.query<DbWorkflowRow>(
      `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return toFull(upd.rows[0]!);
  });
};
export default route;
