/**
 * POST /v1/subscription/cancel (docs/16 §13.3). owner.
 *
 * reason إلزامي ≥ 10 حرف (بعد trim). يُسجَّل + يُبلَّغ المحوّل +
 * cancel_at يُضبَط على current_period_end (المستخدم يُكمل الفترة).
 * إن لم يوجد صفّ subscriptions ⇒ 404.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound, ReasonTooShort } from '../../errors.js';
import { getPaymentsProvider } from '../../payments/index.js';

const bodySchema = z.object({ reason: z.string() });

interface SubRow {
  id: string;
  external_subscription_id: string | null;
  current_period_end: Date | null;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/cancel', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner']);
    const body = bodySchema.parse(req.body);
    const reason = body.reason.trim();
    if (reason.length < 10) throw ReasonTooShort();

    const cur = await req.dbClient!.query<SubRow>(
      `SELECT id, external_subscription_id, current_period_end
       FROM subscriptions LIMIT 1`);
    if (cur.rowCount === 0) throw NotFound();
    const sub = cur.rows[0]!;

    if (sub.external_subscription_id) {
      await getPaymentsProvider().cancelSubscription(sub.external_subscription_id, reason);
    }

    const cancelAt = sub.current_period_end ?? new Date();
    await req.dbClient!.query(
      `UPDATE subscriptions SET cancel_at = $1, cancel_reason = $2 WHERE id = $3`,
      [cancelAt, reason, sub.id],
    );

    const updated = await req.dbClient!.query<{ plan: string; status: string; current_period_end: Date | null }>(
      `SELECT plan, status, current_period_end FROM subscriptions WHERE id = $1`, [sub.id]);
    const r = updated.rows[0]!;
    return {
      plan: r.plan, status: r.status,
      currentPeriodEnd: r.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: true,
    };
  });
};
export default route;
