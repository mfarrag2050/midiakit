/**
 * DELETE /v1/templates/:id — حذف ناعم لقالب (docs/16 §6.5).
 * الدور: admin+.
 *
 * global ⇒ 403 GLOBAL_TEMPLATE_READONLY.
 * مستعمل في مشاريع (RESTRICT FK) ⇒ 409 TEMPLATE_IN_USE.
 * غير مستعمل ⇒ يوضع deleted_at ⇒ 204.
 *
 * soft delete: الصف يبقى للمشاريع/التصديرات المرجعية (docs/13 حجج
 * الأصول). العدّ للتسعير يتجاهل deleted_at IS NOT NULL.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  NotFound, GlobalTemplateReadonly, TemplateInUse,
} from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);

    const cur = await req.dbClient!.query<{ scope: string }>(
      `SELECT scope FROM templates WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    if (cur.rows[0]!.scope === 'global') throw GlobalTemplateReadonly();

    // TEMPLATE_IN_USE — مشاريع تشير إليه (RLS على projects تحمي عزل المستأجرين)
    const used = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM projects WHERE template_id = $1`, [id],
    );
    if ((used.rows[0]?.n ?? 0) > 0) throw TemplateInUse();

    await req.dbClient!.query(
      `UPDATE templates SET deleted_at = now() WHERE id = $1`, [id],
    );
    reply.status(204).send();
  });
};

export default route;
