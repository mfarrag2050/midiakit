/**
 * GET /v1/usage/history (docs/16 §14.2). viewer فما فوق.
 *
 * التصفية: `filter[period][gte]=YYYY-MM` و `filter[period][lte]=YYYY-MM`.
 * الترتيب: `sort=-period` (الأحدث أولاً) — افتراضي وحده حالياً.
 * الغلاف: §1.5 (`data · nextCursor · hasMore`).
 *
 * `period` هنا مفتاح `YYYY-MM` (نصّ) للتوافق مع العقد، وقاعدتنا تخزّن
 * أوّل يوم في الشهر (`date`).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const querySchema = z.object({
  'filter[period][gte]': z.string().regex(PERIOD_RE).optional(),
  'filter[period][lte]': z.string().regex(PERIOD_RE).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  cursor: z.string().optional(),
}).passthrough();

interface Row {
  period: Date;
  renders_count: number;
  videos_count: number;
  video_seconds: number;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/history', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']);

    const q = querySchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q['filter[period][gte]']) {
      params.push(`${q['filter[period][gte]']}-01`);
      where.push(`period >= $${params.length}::date`);
    }
    if (q['filter[period][lte]']) {
      params.push(`${q['filter[period][lte]']}-01`);
      where.push(`period <= $${params.length}::date`);
    }
    if (q.cursor) {
      // cursor بسيط = period ISO (YYYY-MM-DD). حدود A22: صفحات صغيرة، لا نحتاج
      // encode مركّب. صفّ واحد شهرياً — 24 شهر = 24 صفّاً.
      params.push(q.cursor);
      where.push(`period < $${params.length}::date`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const limitPlus = q.limit + 1;
    const rr = await req.dbClient!.query<Row>(
      `SELECT period, renders_count, videos_count, video_seconds
         FROM usage ${whereSql}
        ORDER BY period DESC
        LIMIT ${limitPlus}`, params);

    const rows = rr.rows;
    const hasMore = rows.length > q.limit;
    const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

    return {
      data: trimmed.map((r) => ({
        period: r.period.toISOString().slice(0, 7), // YYYY-MM
        counts: {
          rendersTotal: Number(r.renders_count),
          videos: Number(r.videos_count),
          videosSeconds: Number(r.video_seconds),
        },
      })),
      nextCursor: hasMore ? trimmed[trimmed.length - 1]!.period.toISOString().slice(0, 10) : null,
      hasMore,
    };
  });
};
export default route;
