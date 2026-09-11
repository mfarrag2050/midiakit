/**
 * POST /v1/webhooks/subscription (docs/16 §16.1).
 *
 * انحراف مُعلَن عن العقد: docs/17 §A21 يسمّي المسار باسم المزوّد،
 * ودocs/16 §16.1 يعترف بالبديل. عمّمنا الاسم إلى `subscription` —
 * تطبيقاً لقاعدة القرار 3 (اسم المزوّد يُخفَى بنيوياً خارج payments/).
 * إضافة مزوّد إقليمي مستقبلاً = نفس URL، محوّل مختلف. لا route جديد.
 *
 * لا مصادقة Bearer — التحقّق عبر X-Signature في المحوّل.
 * حاسم: توقيع مزيَّف ⇒ 400 INVALID_SIGNATURE. لا Bearer، لا RLS —
 * نستعمل control_plane_user ضمنياً (webhook ليس عملية مستأجر).
 */
import type { FastifyPluginAsync } from 'fastify';
import { ApiError } from '../../errors.js';
import { getPlatformPool } from '../../db.js';
import {
  getPaymentsProvider, InvalidSignatureError,
  type SubscriptionEvent,
} from '../../payments/index.js';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/subscription', {
    config: {
      // rawBody لازم للتحقّق من التوقيع (JSON.stringify لا يُضمَن أن يُنتج
      // نفس البايتات بترتيب المفاتيح — التوقيع فوق البايتات الأصلية).
      rawBody: true,
    },
  }, async (req, reply) => {
    const signature = String(req.headers['x-signature'] ?? '');
    const rawBody = ((req as unknown as { rawBody?: string }).rawBody) ?? JSON.stringify(req.body);

    const provider = getPaymentsProvider();
    try {
      provider.verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        throw new ApiError('VALIDATION_FAILED', 400, 'X-Signature');
      }
      throw err;
    }

    let event: SubscriptionEvent;
    try {
      event = provider.parseWebhookEvent(rawBody);
    } catch (err) {
      req.log.warn({ err }, 'webhook parse failed');
      throw new ApiError('VALIDATION_FAILED', 400, 'body');
    }

    // نستعمل control_plane pool مباشرة — webhook خارج المستأجر
    // (يكتب على subscriptions لمستأجر معلوم من payload).
    const c = await getPlatformPool().connect();
    try {
      await c.query('BEGIN');
      await applyEvent(c, event);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { c.release(); }

    reply.status(200).send({ received: true });
  });
};

async function applyEvent(c: import('pg').PoolClient, ev: SubscriptionEvent): Promise<void> {
  switch (ev.kind) {
    case 'subscription.created':
      await c.query(
        `INSERT INTO subscriptions(tenant_id, plan, status, external_subscription_id,
                                    external_customer_id, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', $3, $4, $5, $6)
         ON CONFLICT (tenant_id) DO UPDATE SET
           plan = EXCLUDED.plan,
           status = 'active',
           external_subscription_id = EXCLUDED.external_subscription_id,
           external_customer_id = EXCLUDED.external_customer_id,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           updated_at = now()`,
        [ev.tenantId, ev.plan, ev.externalSubscriptionId, ev.externalCustomerId,
         ev.currentPeriodStart, ev.currentPeriodEnd],
      );
      // نحدّث tenants.plan ليعكس الاشتراك المدفوع.
      await c.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [ev.plan, ev.tenantId]);
      return;
    case 'subscription.updated':
      await c.query(
        `UPDATE subscriptions SET
           plan = $1, current_period_start = $2, current_period_end = $3, updated_at = now()
         WHERE tenant_id = $4 AND external_subscription_id = $5`,
        [ev.plan, ev.currentPeriodStart, ev.currentPeriodEnd, ev.tenantId, ev.externalSubscriptionId],
      );
      await c.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [ev.plan, ev.tenantId]);
      return;
    case 'subscription.canceled':
      await c.query(
        `UPDATE subscriptions SET status = 'canceled', canceled_at = $1, updated_at = now()
         WHERE tenant_id = $2 AND external_subscription_id = $3`,
        [ev.canceledAt, ev.tenantId, ev.externalSubscriptionId],
      );
      return;
    case 'subscription.past_due':
      await c.query(
        `UPDATE subscriptions SET status = 'past_due', updated_at = now()
         WHERE tenant_id = $1 AND external_subscription_id = $2`,
        [ev.tenantId, ev.externalSubscriptionId],
      );
      return;
  }
}

export default route;
