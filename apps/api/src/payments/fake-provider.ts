/**
 * FakeProvider — للاختبار والتطوير. Deterministic، بلا شبكة.
 *
 * التوقيع: HMAC-SHA256(rawBody, FAKE_WEBHOOK_SECRET). يُحاكي عقد Paddle
 * الحقيقي (توقيع من رأس + rawBody). صيغة payload = JSON بحقول اسم الحدث
 * والبيانات مباشرة (لا nesting معقّد).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type PaymentsProvider, type CheckoutRequest, type CheckoutResult,
  type Invoice, type SubscriptionEvent,
  InvalidSignatureError,
} from './provider.js';

export class FakeProvider implements PaymentsProvider {
  constructor(
    private readonly webhookSecret: string,
    private readonly baseCheckoutUrl: string = 'https://fake-checkout.local',
  ) {}

  async createCheckoutSession(req: CheckoutRequest): Promise<CheckoutResult> {
    const params = new URLSearchParams({
      tenant: req.tenantId,
      plan: req.targetPlan,
      cycle: req.billingCycle,
      ...(req.idempotencyKey ? { idem: req.idempotencyKey } : {}),
    });
    return {
      checkoutUrl: `${this.baseCheckoutUrl}/session?${params.toString()}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async cancelSubscription(_id: string, _reason: string): Promise<void> {
    // no-op — تحديث DB يتمّ خارج المحوّل عند استقبال webhook.
  }

  async resumeSubscription(_id: string): Promise<void> {
    // no-op — نفس السبب أعلاه.
  }

  async listInvoices(_customerId: string): Promise<Invoice[]> {
    return [];
  }

  verifyWebhookSignature(rawBody: string, signature: string): void {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const provided = String(signature ?? '').trim();
    if (provided.length !== expected.length) throw new InvalidSignatureError();
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) throw new InvalidSignatureError();
    if (!timingSafeEqual(a, b)) throw new InvalidSignatureError();
  }

  parseWebhookEvent(rawBody: string): SubscriptionEvent {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const kind = String(parsed['kind'] ?? '');
    const tenantId = String(parsed['tenantId'] ?? '');
    const externalSubscriptionId = String(parsed['externalSubscriptionId'] ?? '');

    switch (kind) {
      case 'subscription.created':
        return {
          kind, tenantId, externalSubscriptionId,
          plan: parsed['plan'] as SubscriptionEvent extends { plan: infer P } ? P : never,
          externalCustomerId: String(parsed['externalCustomerId'] ?? ''),
          currentPeriodStart: new Date(String(parsed['currentPeriodStart'])),
          currentPeriodEnd: new Date(String(parsed['currentPeriodEnd'])),
        };
      case 'subscription.updated':
        return {
          kind, tenantId, externalSubscriptionId,
          plan: parsed['plan'] as SubscriptionEvent extends { plan: infer P } ? P : never,
          currentPeriodStart: new Date(String(parsed['currentPeriodStart'])),
          currentPeriodEnd: new Date(String(parsed['currentPeriodEnd'])),
        };
      case 'subscription.canceled':
        return {
          kind, tenantId, externalSubscriptionId,
          canceledAt: new Date(String(parsed['canceledAt'] ?? new Date().toISOString())),
        };
      case 'subscription.past_due':
        return { kind, tenantId, externalSubscriptionId };
      default:
        throw new Error(`UNKNOWN_EVENT_KIND: ${kind}`);
    }
  }

  /** أداة اختبار — تُنتج توقيعاً صحيحاً لجسم معطى. لا تُستدعى من الإنتاج. */
  static sign(secret: string, rawBody: string): string {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }
}
