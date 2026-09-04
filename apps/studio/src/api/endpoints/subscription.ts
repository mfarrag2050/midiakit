// /v1/subscription — docs/16 §13.

import { request, requestPage, type Page } from '../client';

export interface Subscription {
  readonly plan: string;
  readonly status: 'active' | 'past_due' | 'cancelled' | 'trial';
  readonly currentPeriodEnd: string;
  readonly cancelAtPeriodEnd: boolean;
}

export interface Invoice {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: 'paid' | 'pending' | 'failed';
  readonly issuedAt: string;
  readonly pdfUrl: string;
}

export function get(): Promise<Subscription> {
  return request<Subscription>('/v1/subscription');
}

export function checkout(input: {
  readonly plan: string;
  readonly returnUrl: string;
}): Promise<{ readonly checkoutUrl: string }> {
  return request('/v1/subscription/checkout', { method: 'POST', body: input });
}

export function cancel(input: { readonly reason: string }): Promise<Subscription> {
  return request('/v1/subscription/cancel', { method: 'POST', body: input });
}

export function resume(): Promise<Subscription> {
  return request('/v1/subscription/resume', { method: 'POST' });
}

export function invoices(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<Page<Invoice>> {
  return requestPage<Invoice>('/v1/subscription/invoices', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
  });
}
