/**
 * GET /v1/subscription (docs/16 §13.1). owner|admin.
 *
 * يجمع: باقة المستأجر + حالة اشتراكه (إن وُجد صفّ) + استعمال الفترة الجارية.
 * مستأجر بلا صفّ في subscriptions ⇒ يُعامَل «حساب يدوي» (docs/17:229):
 *   plan من tenants.plan، status='active' افتراضياً، currentPeriodEnd=null.
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getEffectiveLimits } from '../../config/effective-limits.js';

interface SubRow {
  plan: string;
  status: string;
  current_period_end: Date | null;
  cancel_at: Date | null;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const tenantId = req.auth!.tenantId;

    const sub = await req.dbClient!.query<SubRow>(
      `SELECT plan, status, current_period_end, cancel_at
       FROM subscriptions LIMIT 1`,
    );
    const tenant = await req.dbClient!.query<{ plan: string }>(
      `SELECT plan FROM tenants WHERE id = $1`, [tenantId],
    );
    if (tenant.rowCount === 0) return { plan: 'trial', status: 'trialing', currentPeriodEnd: null, seats: null, quotas: null, cancelAtPeriodEnd: false };

    const plan = sub.rows[0]?.plan ?? tenant.rows[0]!.plan;
    const status = sub.rows[0]?.status ?? 'active';
    const periodEnd = sub.rows[0]?.current_period_end ?? null;
    const cancelAt = sub.rows[0]?.cancel_at ?? null;

    const limits = await getEffectiveLimits(req.dbClient!, tenantId);

    const seatsUsed = await req.dbClient!.query<{ n: string }>(
      `SELECT count(*)::bigint AS n FROM users`);
    const brandKitsUsed = await req.dbClient!.query<{ n: string }>(
      `SELECT count(*)::bigint AS n FROM brand_kits`);
    const rendersMonth = await req.dbClient!.query<{ videos: string; renders: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN video_seconds > 0 THEN 1 ELSE 0 END), 0)::bigint AS videos,
         COALESCE(SUM(renders_count), 0)::bigint AS renders
       FROM usage
       WHERE date_trunc('month', period) = date_trunc('month', now())`);

    return {
      plan,
      status,
      currentPeriodEnd: periodEnd?.toISOString() ?? null,
      seats: { used: Number(seatsUsed.rows[0]!.n), limit: limits.seatsLimit },
      quotas: {
        brandKits: { used: Number(brandKitsUsed.rows[0]!.n), limit: limits.brandKitsLimit },
        videos: { used: Number(rendersMonth.rows[0]!.videos), limit: limits.videosPerMonthLimit ?? 'unlimited' },
        renders: { used: Number(rendersMonth.rows[0]!.renders), limit: 'unlimited' },
      },
      cancelAtPeriodEnd: cancelAt !== null,
    };
  });
};
export default route;
