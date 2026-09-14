// /v1/usage — docs/16 §14.
// **الشكل الحاكم (A22):** counts + limits + byBrandKit. limits داخل
// usage/current — لا حاجة لاستدعاء subscription لأجلها.

import { request, requestPage, type Page } from '../client';

export interface UsageCounts {
  readonly rendersTotal: number;
  readonly videos: number;
  readonly videosSeconds: number;
  readonly storageBytes: number;
  /** ai (اختياري — قد يغيب على الباقات الأقدم). لا حدّ عليه في الطبقة
   * الحالية: `usage` تعدّ tokensIn/tokensOut، لكن الفرض غير موجود. */
  readonly aiTokensIn?: number;
  readonly aiTokensOut?: number;
}

export interface UsageLimits {
  readonly rendersTotal?: number | 'unlimited';
  readonly videos?: number | 'unlimited';
  readonly videosSeconds?: number | 'unlimited';
  readonly storageBytes?: number | 'unlimited';
}

export interface UsageByBrandKit {
  readonly brandKitId: string;
  readonly rendersTotal: number;
}

export interface UsageWindow {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly counts: UsageCounts;
  readonly limits: UsageLimits;
  readonly byBrandKit: readonly UsageByBrandKit[];
}

export function current(): Promise<UsageWindow> {
  return request<UsageWindow>('/v1/usage/current');
}

export function history(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<Page<UsageWindow>> {
  return requestPage<UsageWindow>('/v1/usage/history', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
  });
}
