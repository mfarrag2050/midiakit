/**
 * POST /v1/subscription/resume (docs/16 §13.4). owner.
 * يمسح cancel_at + cancel_reason ويُبلّغ المحوّل.
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound } from '../../errors.js';
import { getPaymentsProvider } from '../../payments/index.js';

interface SubRow { id: string; external_subscription_id: string | null }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/resume', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner']);

    const cur = await req.dbClient!.query<SubRow>(
      `SELECT id, external_subscription_id FROM subscriptions LIMIT 1`);
    if (cur.rowCount === 0) throw NotFound();
    const sub = cur.rows[0]!;

    if (sub.external_subscription_id) {
      await getPaymentsProvider().resumeSubscription(sub.external_subscription_id);
    }

    await req.dbClient!.query(
      `UPDATE subscriptions SET cancel_at = NULL, cancel_reason = NULL WHERE id = $1`, [sub.id]);

    const updated = await req.dbClient!.query<{ plan: string; status: string; current_period_end: Date | null }>(
      `SELECT plan, status, current_period_end FROM subscriptions WHERE id = $1`, [sub.id]);
    const r = updated.rows[0]!;
    return {
      plan: r.plan, status: r.status,
      currentPeriodEnd: r.current_period_end?.toISOString() ?? null,
      cancelAtPeriodEnd: false,
    };
  });
};
export default route;
