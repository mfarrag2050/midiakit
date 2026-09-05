/**
 * PATCH /v1/templates/:id — تعديل قالب (docs/16 §6.4).
 * الدور: admin+.
 *
 * قالب global ⇒ 403 GLOBAL_TEMPLATE_READONLY (فحص التطبيق L-61).
 * حتى لو سقط فحص التطبيق، RLS templates_update ترفض (طبقة ثانية).
 *
 * definition الجديد يمرّ بـvalidateTemplate.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validateTemplate, TemplateValidationError } from '@pf-mediakit/templates';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbTemplateRow } from './shared/mapper.js';
import {
  NotFound, GlobalTemplateReadonly, TemplateSchemaViolation,
} from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.string().min(1).max(50).optional(),
  definition: z.record(z.unknown()).optional(),
}).strict();

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const cur = await req.dbClient!.query<DbTemplateRow>(
      `SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const target = cur.rows[0]!;

    // فحص التطبيق: global ⇒ 403 معلن (L-61)
    if (target.scope === 'global') throw GlobalTemplateReadonly();

    // dvalidate إن كان definition جديداً
    if (body.definition) {
      try {
        validateTemplate(body.definition);
      } catch (err) {
        if (err instanceof TemplateValidationError) throw TemplateSchemaViolation(err.path);
        throw err;
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }
    if (body.kind !== undefined) { params.push(body.kind); sets.push(`kind = $${params.length}`); }
    if (body.definition !== undefined) {
      params.push(JSON.stringify(body.definition));
      sets.push(`definition = $${params.length}::jsonb`);
    }
    if (sets.length === 0) return toFull(target);

    params.push(id);
    const upd = await req.dbClient!.query<DbTemplateRow>(
      `UPDATE templates SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return toFull(upd.rows[0]!);
  });
};

export default route;
