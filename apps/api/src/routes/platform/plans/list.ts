/**
 * GET /v1/platform/plans (A28). platform user.
 * يعيد كل الباقات — بيانات مرجعية عامّة صغيرة (5 صفوف)، بلا §1.5 wrapper.
 */
import type { FastifyPluginAsync } from 'fastify';
import { toPublicPlan, type DbPlanRow } from './shared.js';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const r = await req.platformDbClient!.query<DbPlanRow>(
      `SELECT key, name_ar, name_en, price_usd_cents,
              brand_kits_limit, seats_limit, videos_per_month_limit,
              requests_per_minute_limit, concurrent_renders_limit,
              created_at, updated_at
       FROM plans ORDER BY price_usd_cents`,
    );
    return { data: r.rows.map(toPublicPlan) };
  });
};
export default route;
