// /v1/tenant — docs/16 §3.

import { request } from '../client';
import type { Locale, Tenant } from '../types';

export function get(): Promise<Tenant> {
  return request<Tenant>('/v1/tenant');
}

export function patch(input: {
  readonly name?: string;
  readonly locale?: Locale;
}): Promise<Tenant> {
  return request<Tenant>('/v1/tenant', { method: 'PATCH', body: input });
}
