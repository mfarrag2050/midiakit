/**
 * PATCH /v1/projects/:id — تعديل مشروع (docs/16 §7.4).
 * الدور: writer فما فوق (في A14). فحص workflow state (§10) يُضاف في A15.
 *
 * ممنوع من الجسم: id · tenant_id · createdAt · currentState (state) —
 * الحالة تُغيَّر عبر transitions (§10.4، A15).
 *
 * TRANSITION_ROLE_REQUIRED: مُعلَن، **يُطلَق فقط في A15** (بلا workflow
 * loaded). في A14 يمرّ writer+ بدون فحص حالة.
 * STALE_UPDATE (409): مُعلَن، **يُطلَق فقط في A20** (revisions concurrency).
 *
 * حقول قابلة للتعديل في A14: title · content · assignee_id · workflow_id · locale.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbProjectRow } from './shared/mapper.js';
import {
  NotFound, ImmutableField, LocaleUnsupported, WorkflowNotFound,
} from '../../errors.js';

const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'tr', 'es', 'de'] as const;
const FORBIDDEN_KEYS = new Set(['id', 'tenant_id', 'createdAt', 'currentState', 'state']);

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.record(z.unknown()).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  workflow_id: z.string().uuid().nullable().optional(),
  locale: z.string().optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const { id } = paramsSchema.parse(req.params);

    // فحص مفاتيح غير مسموحة صراحةً (id/tenant_id/createdAt/state/currentState)
    if (req.body && typeof req.body === 'object') {
      for (const k of Object.keys(req.body as object)) {
        if (FORBIDDEN_KEYS.has(k)) throw ImmutableField(k);
      }
    }

    const body = bodySchema.parse(req.body);

    const cur = await req.dbClient!.query<DbProjectRow>(
      `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();

    if (body.locale !== undefined && !(SUPPORTED_LOCALES as readonly string[]).includes(body.locale)) {
      throw LocaleUnsupported();
    }

    if (body.workflow_id !== undefined && body.workflow_id !== null) {
      const wf = await req.dbClient!.query<{ id: string }>(
        `SELECT id FROM workflows WHERE id = $1`, [body.workflow_id],
      );
      if (wf.rowCount === 0) throw WorkflowNotFound();
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.title !== undefined) { params.push(body.title); sets.push(`name = $${params.length}`); }
    if (body.content !== undefined) {
      params.push(JSON.stringify(body.content));
      sets.push(`content = $${params.length}::jsonb`);
    }
    if (body.assignee_id !== undefined) {
      params.push(body.assignee_id);
      sets.push(`assignee_id = $${params.length}`);
    }
    if (body.workflow_id !== undefined) {
      params.push(body.workflow_id);
      sets.push(`workflow_id = $${params.length}`);
    }
    if (body.locale !== undefined) {
      params.push(body.locale);
      sets.push(`locale = $${params.length}`);
    }
    if (sets.length === 0) return toFull(cur.rows[0]!);

    params.push(id);
    const upd = await req.dbClient!.query<DbProjectRow>(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return toFull(upd.rows[0]!);
  });
};

export default route;
