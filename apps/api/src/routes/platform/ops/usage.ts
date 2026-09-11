/**
 * GET /v1/platform/ops/usage — usage_current_month + top_tenants_by_renders (A25).
 *
 * مصدر واحد: `usage` جدول (نمط A22 — trigger على renders يملأه).
 * لا حساب من `renders` مباشرة (كان علّة A21 قبل A22).
 */
import type { FastifyPluginAsync } from 'fastify';

interface TotalsRow {
  renders_count: string;
  videos_count: string;
  video_seconds: string;
  ai_tokens_in: string;
  ai_tokens_out: string;
  tenants_active: string;
}

interface TopRow {
  tenant_id: string;
  renders_count: string;
  videos_count: string;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/usage', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const c = req.platformDbClient!;
    const totals = await c.query<TotalsRow>(
      `SELECT
         COALESCE(SUM(renders_count), 0)::bigint::text AS renders_count,
         COALESCE(SUM(videos_count), 0)::bigint::text AS videos_count,
         COALESCE(SUM(video_seconds), 0)::bigint::text AS video_seconds,
         COALESCE(SUM(ai_tokens_in), 0)::bigint::text AS ai_tokens_in,
         COALESCE(SUM(ai_tokens_out), 0)::bigint::text AS ai_tokens_out,
         count(DISTINCT tenant_id)::bigint::text AS tenants_active
       FROM usage
       WHERE period = date_trunc('month', now())::date`,
    );
    const top = await c.query<TopRow>(
      `SELECT tenant_id::text,
              renders_count::text,
              videos_count::text
       FROM usage
       WHERE period = date_trunc('month', now())::date
       ORDER BY renders_count DESC
       LIMIT 10`,
    );
    const t = totals.rows[0]!;
    return {
      currentMonthTotals: {
        rendersTotal: Number(t.renders_count),
        videos: Number(t.videos_count),
        videosSeconds: Number(t.video_seconds),
        aiTokensIn: Number(t.ai_tokens_in),
        aiTokensOut: Number(t.ai_tokens_out),
        tenantsActive: Number(t.tenants_active),
      },
      topTenantsByRenders: top.rows.map((r) => ({
        tenantId: r.tenant_id,
        renders: Number(r.renders_count),
        videos: Number(r.videos_count),
      })),
    };
  });
};
export default route;
