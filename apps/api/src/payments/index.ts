/**
 * payments — نقطة الوصول الوحيدة للمزوّد. env-driven.
 *
 * PAYMENTS_PROVIDER=fake (افتراضي في dev/test) — FakeProvider.
 * PAYMENTS_PROVIDER=paddle — PaddleProvider (stub حالياً، يُبنى في تذكرة
 * منفصلة عند ربط حساب Paddle الحقيقي).
 */
import { FakeProvider } from './fake-provider.js';
import type { PaymentsProvider } from './provider.js';

export type { PaymentsProvider, CheckoutRequest, CheckoutResult, Invoice, SubscriptionEvent, PlanKey, BillingCycle } from './provider.js';
export { InvalidSignatureError } from './provider.js';
export { FakeProvider } from './fake-provider.js';

let cached: PaymentsProvider | null = null;

export function getPaymentsProvider(): PaymentsProvider {
  if (cached) return cached;
  const which = process.env['PAYMENTS_PROVIDER'] ?? 'fake';
  const webhookSecret = process.env['PAYMENTS_WEBHOOK_SECRET'] ?? 'dev-webhook-secret-do-not-use-in-prod';

  if (which === 'fake') {
    cached = new FakeProvider(webhookSecret);
    return cached;
  }
  // stub — يُستبدَل بـPaddleProvider حين ربط الحساب الحقيقي.
  throw new Error(`PAYMENTS_PROVIDER='${which}' لم يُربَط بعد. استعمل 'fake' في dev/test.`);
}

/** للاختبار — يُعيد ضبط الـcache بعد تغيير env. */
export function resetPaymentsProvider(): void {
  cached = null;
}
