// /v1/usage — docs/16 §14.

import { request } from '../client';

export interface UsageWindow {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly renders: number;
  readonly videoSeconds: number;
  readonly aiTokens: number;
  readonly storageBytes: number;
  readonly byBrandKit: Readonly<Record<string, { readonly renders: number }>>;
}

export function current(): Promise<UsageWindow> {
  return request<UsageWindow>('/v1/usage/current');
}

export function history(opts?: {
  readonly months?: number;
}): Promise<{ readonly windows: readonly UsageWindow[] }> {
  return request('/v1/usage/history', {
    query: opts?.months !== undefined ? { months: opts.months } : {},
  });
}
