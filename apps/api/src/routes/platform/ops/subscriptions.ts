/**
 * GET /v1/platform/ops/subscriptions — subscriptions_by_status + tenants_by_plan (A25).
 *
 * مصدر واحد لكل مقياس (لا حساب من مصدرين — L-53):
 *   subscriptions_by_status ⇐ subscriptions حصراً
 *   tenants_by_plan         ⇐ tenants حصراً
 *
 * control_plane_user يعبر RLS بسياسات control_plane_all (A27).
 */
import type { FastifyPluginAsync } from 'fastify';

interface StatusRow { status: string; count: string }
interface PlanRow { plan: string; count: string }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/subscriptions', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const c = req.platformDbClient!;
    const byStatus = await c.query<StatusRow>(
      `SELECT status, count(*)::bigint::text AS count
       FROM subscriptions GROUP BY status ORDER BY status`,
    );
    const byPlan = await c.query<PlanRow>(
      `SELECT plan, count(*)::bigint::text AS count
       FROM tenants GROUP BY plan ORDER BY plan`,
    );
    return {
      subscriptionsByStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      tenantsByPlan: byPlan.rows.map((r) => ({ plan: r.plan, count: Number(r.count) })),
    };
  });
};
export default route;
