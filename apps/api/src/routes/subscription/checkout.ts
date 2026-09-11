/**
 * POST /v1/subscription/checkout (docs/16 §13.2). owner.
 *
 * يُنشئ جلسة دفع عبر المحوّل. Idempotency-Key مدعوم — إن كرِّر المفتاح
 * في مستأجر واحد خلال 24 ساعة، يُعاد نفس checkoutUrl.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getPaymentsProvider } from '../../payments/index.js';

const bodySchema = z.object({
  targetPlan: z.enum(['starter', 'studio', 'agency', 'api']),
  billingCycle: z.enum(['monthly', 'yearly']),
});

interface CheckoutSessionRow {
  checkout_url: string;
  expires_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/checkout', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner']);
    const body = bodySchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const idempotencyKey = req.headers['idempotency-key']
      ? String(req.headers['idempotency-key']).slice(0, 200) : null;

    if (idempotencyKey) {
      const existing = await req.dbClient!.query<CheckoutSessionRow>(
        `SELECT checkout_url, expires_at FROM checkout_sessions
         WHERE tenant_id = $1 AND idempotency_key = $2 AND expires_at > now()`,
        [tenantId, idempotencyKey],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const r = existing.rows[0]!;
        return { checkoutUrl: r.checkout_url, expiresAt: r.expires_at.toISOString() };
      }
    }

    const provider = getPaymentsProvider();
    const result = await provider.createCheckoutSession({
      tenantId, targetPlan: body.targetPlan, billingCycle: body.billingCycle, idempotencyKey,
    });

    await req.dbClient!.query(
      `INSERT INTO checkout_sessions(tenant_id, idempotency_key, target_plan, billing_cycle,
                                      checkout_url, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, idempotencyKey, body.targetPlan, body.billingCycle,
       result.checkoutUrl, result.expiresAt, req.auth!.userId],
    );

    return { checkoutUrl: result.checkoutUrl, expiresAt: result.expiresAt.toISOString() };
  });
};
export default route;
