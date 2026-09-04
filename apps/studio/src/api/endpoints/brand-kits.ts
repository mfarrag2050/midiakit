// /v1/brand-kits — docs/16 §5. الشكل الكامل لـ`config` في packages/shared
// عند اكتمال العقد. حتى ذلك، نمرّر unknown في PATCH ونتفادى الوعد.

import { request, requestPage, type Page } from '../client';

export interface BrandKitSummary {
  readonly id: string;
  readonly name: string;
  readonly locale: string;
  readonly updatedAt: string;
}

export interface BrandKitFull extends BrandKitSummary {
  readonly config: unknown;
  readonly assetsVersion: number;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly sort?: string;
}): Promise<Page<BrandKitSummary>> {
  return requestPage<BrandKitSummary>('/v1/brand-kits', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.sort ? { sort: opts.sort } : {}),
  });
}

export function get(id: string): Promise<BrandKitFull> {
  return request<BrandKitFull>(`/v1/brand-kits/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly name: string;
  readonly locale?: string;
  readonly config?: unknown;
}): Promise<BrandKitFull> {
  return request<BrandKitFull>('/v1/brand-kits', {
    method: 'POST',
    body: input,
  });
}

/**
 * JSON Merge Patch (RFC 7396) — تعديل جزئي. الخادم يُنشئ revision تلقائياً.
 */
export function patch(id: string, mergePatch: unknown): Promise<BrandKitFull> {
  return request<BrandKitFull>(`/v1/brand-kits/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: mergePatch,
    headers: { 'content-type': 'application/merge-patch+json' },
  });
}

export function ackFontLicense(
  brandKitId: string,
  family: string,
  input: { readonly licenseAck: true }
): Promise<{ readonly ackBy: string; readonly ackAt: string }> {
  return request(
    `/v1/brand-kits/${encodeURIComponent(brandKitId)}/fonts/${encodeURIComponent(family)}/ack`,
    { method: 'POST', body: input }
  );
}

export function ackLogoAttribution(
  brandKitId: string,
  platform: string,
  input: { readonly licenseAck: true }
): Promise<{ readonly ackBy: string; readonly ackAt: string }> {
  return request(
    `/v1/brand-kits/${encodeURIComponent(brandKitId)}/attribution/logo-acks/${encodeURIComponent(platform)}`,
    { method: 'POST', body: input }
  );
}

export function bumpAssetsVersion(
  brandKitId: string,
  input: { readonly acknowledgedDiff: true; readonly reason: string }
): Promise<BrandKitFull> {
  return request(
    `/v1/brand-kits/${encodeURIComponent(brandKitId)}/assets-version`,
    { method: 'POST', body: input }
  );
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/brand-kits/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
