/**
 * payments/provider — المحوّل الحاكم (docs/17 §القرار 3).
 *
 * قاعدة بنيوية: كل استدعاء لمزوّد الفوترة يمرّ من هنا. بقية النظام يعرف
 * «اشتراك نشط» و«الحدّ الشهري» فقط — لا يذكر Paddle (أو أيّ مزوّد قادم:
 * Tap · PayTabs · Moyasar) باسمه. تبديل المزوّد = إبدال ملف واحد.
 *
 * الحارس `check:no-paddle-outside-payments` يفرض هذا آلياً.
 */

export type BillingCycle = 'monthly' | 'yearly';
export type PlanKey = 'starter' | 'studio' | 'agency' | 'api';

export interface CheckoutRequest {
  tenantId: string;
  targetPlan: PlanKey;
  billingCycle: BillingCycle;
  idempotencyKey: string | null;
}

export interface CheckoutResult {
  checkoutUrl: string;
  expiresAt: Date;
}

export interface Invoice {
  id: string;
  amountCents: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'refunded';
  issuedAt: Date;
  pdfUrl: string | null;
}

/**
 * أحداث موحَّدة من webhook — المحوّل يستخرجها من payload المزوّد.
 * بقية النظام لا يرى شكل الحدث الأصلي.
 */
export type SubscriptionEvent =
  | { kind: 'subscription.created'; tenantId: string; plan: PlanKey; externalSubscriptionId: string; externalCustomerId: string; currentPeriodStart: Date; currentPeriodEnd: Date }
  | { kind: 'subscription.updated'; tenantId: string; plan: PlanKey; externalSubscriptionId: string; currentPeriodStart: Date; currentPeriodEnd: Date }
  | { kind: 'subscription.canceled'; tenantId: string; externalSubscriptionId: string; canceledAt: Date }
  | { kind: 'subscription.past_due'; tenantId: string; externalSubscriptionId: string };

export interface PaymentsProvider {
  createCheckoutSession(req: CheckoutRequest): Promise<CheckoutResult>;
  cancelSubscription(externalSubscriptionId: string, reason: string): Promise<void>;
  resumeSubscription(externalSubscriptionId: string): Promise<void>;
  listInvoices(externalCustomerId: string): Promise<Invoice[]>;
  /** يتحقّق من توقيع webhook. يرمي عند الفشل. */
  verifyWebhookSignature(rawBody: string, signature: string): void;
  parseWebhookEvent(rawBody: string): SubscriptionEvent;
}

export class InvalidSignatureError extends Error {
  constructor() { super('INVALID_SIGNATURE'); this.name = 'InvalidSignatureError'; }
}
