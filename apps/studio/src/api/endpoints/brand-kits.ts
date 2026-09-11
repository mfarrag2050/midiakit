// /v1/brand-kits — docs/16 §5.
// **بعد SYNC-β**: الأشكال المُثبَتة:
//   GET /v1/brand-kits        → {data:[{id,name,createdAt,updatedAt}], nextCursor, hasMore}
//   POST /v1/brand-kits       → 201 {id,name,config,createdAt,updatedAt}
//   GET /v1/brand-kits/:id    → نفس create response
//   PATCH /v1/brand-kits/:id  → JSON Merge Patch (§5.4 blocked paths)
//   POST /:id/fonts/:family/ack:
//     body: {licenseAck:true, acknowledgedBy:userId, notes?}
//     returns 200 {fonts:{primary:{...updatedPrimary...}}} — جزء لا كامل (ملاحظة العقد)
//     licenseAck=false → 422 LICENSE_ACK_MUST_BE_TRUE
//   POST /:id/assets-version:
//     body: {targetVersion: 'YYYY.MM', acknowledgedDiff:true}
//     returns 200 {assets:{version, autoUpdate}} — جزء
//     acknowledgedDiff=false → 409 DIFF_NOT_ACKNOWLEDGED
//     targetVersion غير مطابق → 400 INVALID_VERSION_FORMAT

import { request, requestPage, type Page } from '../client';

export interface BrandKitSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** config JSON غير مُنمَّط — schema كامل في packages/shared (خارج نطاق studio). */
export interface BrandKitFull extends BrandKitSummary {
  readonly config: Record<string, unknown>;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<Page<BrandKitSummary>> {
  return requestPage<BrandKitSummary>('/v1/brand-kits', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
  });
}

export function get(id: string): Promise<BrandKitFull> {
  return request<BrandKitFull>(`/v1/brand-kits/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly name: string;
  readonly config?: Record<string, unknown>;
}): Promise<BrandKitFull> {
  return request<BrandKitFull>('/v1/brand-kits', {
    method: 'POST',
    body: input,
  });
}

/** JSON Merge Patch — §5.4 يحجب: assets.version, fonts.primary.licenseAck,
 *  attribution.logoAcks.*.licenseAck (تُعدَّل عبر endpoints مخصّصة). */
export function patch(id: string, mergePatch: unknown): Promise<BrandKitFull> {
  return request<BrandKitFull>(`/v1/brand-kits/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: mergePatch,
    headers: { 'content-type': 'application/merge-patch+json' },
  });
}

/** ackFontLicense — 200 يعيد `{fonts:{primary}}` جزءاً وحده (ملاحظة SYNC-β).
 *  يفشل بـ404 FONT_NOT_UPLOADED إن كان font.source !== 'custom'. */
export function ackFontLicense(
  brandKitId: string,
  family: string,
  input: {
    readonly licenseAck: boolean;
    readonly acknowledgedBy: string;
    readonly notes?: string;
  }
): Promise<{
  readonly fonts: {
    readonly primary: {
      readonly family: string;
      readonly source: string;
      readonly licenseAck: boolean;
      readonly ackBy: string;
      readonly ackAt: string;
      readonly ackNotes?: string;
    };
  };
}> {
  return request(
    `/v1/brand-kits/${encodeURIComponent(brandKitId)}/fonts/${encodeURIComponent(family)}/ack`,
    { method: 'POST', body: input }
  );
}

export function ackLogoAttribution(
  brandKitId: string,
  platform: string,
  input: { readonly licenseAck: boolean; readonly acknowledgedBy: string }
): Promise<{
  readonly attribution: {
    readonly logoAcks: Record<
      string,
      { readonly licenseAck: boolean; readonly ackBy: string; readonly ackAt: string }
    >;
  };
}> {
  return request(
    `/v1/brand-kits/${encodeURIComponent(brandKitId)}/attribution/logo-acks/${encodeURIComponent(platform)}`,
    { method: 'POST', body: input }
  );
}

/** ترقية إصدار الأصول — targetVersion بصيغة 'YYYY.MM'. يعيد جزءاً
 *  `{assets:{version, autoUpdate}}` (ملاحظة SYNC-β). */
export function bumpAssetsVersion(
  brandKitId: string,
  input: { readonly targetVersion: string; readonly acknowledgedDiff: boolean }
): Promise<{
  readonly assets: { readonly version: string; readonly autoUpdate: boolean };
}> {
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
