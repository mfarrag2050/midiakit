/**
 * GET /v1/usage/current (docs/16 §14.1). viewer فما فوق.
 *
 * الفترة الحالية = الشهر التقويمي (`date_trunc('month', now())::date`).
 * قرار المالك 2026-09-08: تقويمي حصراً — يعمل للحساب اليدوي (بلا subscription)
 * وحسابات الاشتراك على السواء. docs/01 يقول «20 فيديو/شهر» — لغة تقويمية.
 *
 * المصدر: `usage` (trigger على renders يملأها). صفر صفوف = 0/0.
 * `byBrandKit` مُشتقّ من renders حين succeeded — مصدر الحقيقة نفسه (renders =
 * ما يُطلق trigger)، فلا انفصال.
 * `storageBytes` من assets.size_bytes مباشرة (لا aggregate).
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getEffectiveLimits } from '../../config/effective-limits.js';

interface UsageRow {
  renders_count: number;
  videos_count: number;
  video_seconds: number;
}

interface ByBrandKitRow {
  brand_kit_id: string;
  renders: number;
  videos_count: number;
  video_seconds: number;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/current', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']);

    const periodR = await req.dbClient!.query<{ period_start: string; period_end: string }>(
      `SELECT
         date_trunc('month', now())::date::text AS period_start,
         (date_trunc('month', now()) + interval '1 month' - interval '1 microsecond')::text AS period_end`,
    );
    const p = periodR.rows[0]!;

    const cur = await req.dbClient!.query<UsageRow>(
      `SELECT renders_count, videos_count, video_seconds FROM usage
       WHERE period = date_trunc('month', now())::date`,
    );
    const u = cur.rows[0] ?? { renders_count: 0, videos_count: 0, video_seconds: 0 };

    const storage = await req.dbClient!.query<{ n: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS n FROM assets
       WHERE finalized_at IS NOT NULL`,
    );

    const byBk = await req.dbClient!.query<ByBrandKitRow>(
      `SELECT p.brand_kit_id::text,
              count(*)::int AS renders,
              SUM(CASE WHEN r.format = 'mp4' THEN 1 ELSE 0 END)::int AS videos_count,
              0::int AS video_seconds
       FROM renders r
       JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'succeeded'
         AND r.created_at >= date_trunc('month', now())
       GROUP BY p.brand_kit_id`,
    );

    const limits = await getEffectiveLimits(req.dbClient!, req.auth!.tenantId);

    return {
      periodStart: new Date(p.period_start).toISOString(),
      periodEnd: new Date(p.period_end).toISOString(),
      counts: {
        rendersTotal: Number(u.renders_count),
        videos: Number(u.videos_count),
        videosSeconds: Number(u.video_seconds),
        storageBytes: Number(storage.rows[0]!.n),
      },
      limits: {
        videos: limits.videosPerMonthLimit,
        brandKits: limits.brandKitsLimit,
        seats: limits.seatsLimit,
        concurrentRenders: limits.concurrentRendersLimit,
      },
      byBrandKit: byBk.rows.map((r) => ({
        brand_kit_id: r.brand_kit_id,
        renders: Number(r.renders),
        videos: Number(r.videos_count),
        videosSeconds: Number(r.video_seconds),
      })),
    };
  });
};
export default route;
