/**
 * DELETE /v1/platform/plans/:key (A28). platform owner.
 *
 * FK RESTRICT من tenants.plan / subscriptions.plan / checkout_sessions.target_plan
 * على DB يمنع حذف باقة مستعملة — Postgres يرجع 23503 ⇒ نحوّله إلى
 * 409 مع رسالة مقروءة.
 * إسقاط ذاكرة plan-limits-cache بعد الحذف (لا مستأجر يبقى على هذه الباقة،
 * لكن نُبقي الشرط تماشياً مع القاعدة: كلّ كتابة تمسّ حدّاً ⇒ clearCache).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { ApiError, NotFound } from '../../../errors.js';
import { clearPlanLimitsCache } from '../../../plugins/plan-limits-cache.js';

const paramsSchema = z.object({ key: z.string().min(1).max(50) });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:key', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    requirePlatformRoleIn(req, ['owner']);
    const { key } = paramsSchema.parse(req.params);
    try {
      const r = await req.platformDbClient!.query(`DELETE FROM plans WHERE key = $1`, [key]);
      if ((r.rowCount ?? 0) === 0) throw NotFound();
      clearPlanLimitsCache();
      reply.status(204).send();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const pgErr = err as { code?: string };
      if (pgErr.code === '23503') {
        // FK RESTRICT — باقة مستعملة (tenants.plan / subscriptions.plan / checkout_sessions.target_plan)
        throw new ApiError('PLAN_IN_USE', 409, 'key');
      }
      throw err;
    }
  });
};
export default route;
