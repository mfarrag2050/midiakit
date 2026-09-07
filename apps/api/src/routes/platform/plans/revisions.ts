/**
 * GET /v1/platform/plans/:key/revisions (A28). platform user.
 *
 * سجلّ تدقيق تحرير الباقة — يقرأ من `plan_revisions` (A28 trigger).
 * يعرض الأحدث أوّلاً. §1.5 wrapper.
 *
 * «سجلّ لا يُقرأ ليس سجلّاً» — هذه النقطة تجعله مقروءاً من اللوحة.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const paramsSchema = z.object({ key: z.string().min(1).max(50) });
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).passthrough();

interface Row {
  id: string;
  plan_key: string;
  actor_id: string | null;
  action: string;
  snapshot: Record<string, unknown>;
  created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:key/revisions', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const { key } = paramsSchema.parse(req.params);
    const q = querySchema.parse(req.query);
    const r = await req.platformDbClient!.query<Row>(
      `SELECT id, plan_key, actor_id, action, snapshot, created_at
       FROM plan_revisions WHERE plan_key = $1
       ORDER BY created_at DESC LIMIT $2`,
      [key, q.limit],
    );
    return {
      data: r.rows.map((row) => ({
        id: row.id,
        planKey: row.plan_key,
        actorId: row.actor_id,
        action: row.action,
        snapshot: row.snapshot,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: null,
      hasMore: false,
    };
  });
};
export default route;
