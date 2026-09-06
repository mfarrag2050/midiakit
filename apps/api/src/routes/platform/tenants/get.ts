/**
 * GET /v1/platform/tenants/:id — تفاصيل مستأجر واحد + حدوده الفعلية.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface Row {
  id: string; name: string; plan: string; locale: string;
  plan_overrides: Record<string, unknown> | null;
  brand_kits_limit: number | null; seats_limit: number | null;
  videos_per_month_limit: number | null;
  requests_per_minute_limit: number; concurrent_renders_limit: number;
  created_at: Date; updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.platformDbClient!.query<Row>(
      `SELECT t.id, t.name, t.plan, t.locale, t.plan_overrides,
              p.brand_kits_limit, p.seats_limit, p.videos_per_month_limit,
              p.requests_per_minute_limit, p.concurrent_renders_limit,
              t.created_at, t.updated_at
       FROM tenants t JOIN plans p ON p.key = t.plan
       WHERE t.id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;
    const ov = row.plan_overrides ?? {};
    const pick = <T extends number | null>(k: string, dflt: T): T =>
      (k in ov ? (ov[k] as T) : dflt);

    return {
      id: row.id,
      name: row.name,
      plan: row.plan,
      locale: row.locale,
      planOverrides: row.plan_overrides,
      effectiveLimits: {
        brandKitsLimit: pick('brand_kits_limit', row.brand_kits_limit),
        seatsLimit: pick('seats_limit', row.seats_limit),
        videosPerMonthLimit: pick('videos_per_month_limit', row.videos_per_month_limit),
        requestsPerMinuteLimit: pick('requests_per_minute_limit', row.requests_per_minute_limit),
        concurrentRendersLimit: pick('concurrent_renders_limit', row.concurrent_renders_limit),
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
};
export default route;
