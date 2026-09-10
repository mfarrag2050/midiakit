/**
 * GET /v1/platform/plans/:key (A28). platform user.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound } from '../../../errors.js';
import { toPublicPlan, type DbPlanRow } from './shared.js';

const paramsSchema = z.object({ key: z.string().min(1).max(50) });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:key', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const { key } = paramsSchema.parse(req.params);
    const r = await req.platformDbClient!.query<DbPlanRow>(
      `SELECT key, name_ar, name_en, price_usd_cents,
              brand_kits_limit, seats_limit, videos_per_month_limit,
              requests_per_minute_limit, concurrent_renders_limit,
              created_at, updated_at
       FROM plans WHERE key = $1`, [key]);
    if (r.rowCount === 0) throw NotFound();
    return toPublicPlan(r.rows[0]!);
  });
};
export default route;
