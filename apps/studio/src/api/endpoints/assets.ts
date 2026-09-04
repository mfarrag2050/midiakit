// /v1/assets — docs/16 §9. نمط رفع pre-signed.

import { request, requestPage, type Page } from '../client';

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'lottie' | 'svg';

export interface AssetSummary {
  readonly id: string;
  readonly kind: AssetKind;
  readonly filename: string;
  readonly bytes: number;
  readonly createdAt: string;
  readonly publicUrl: string;
  readonly publicUrlExpiresAt: string;
}

export interface UploadUrl {
  readonly assetId: string;
  readonly uploadUrl: string;
  readonly method: 'PUT';
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export function requestUploadUrl(input: {
  readonly kind: AssetKind;
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
}): Promise<UploadUrl> {
  return request<UploadUrl>('/v1/assets/upload-url', {
    method: 'POST',
    body: input,
  });
}

export function finalize(
  assetId: string,
  input: {
    readonly licenseAck?: true;
    readonly meta?: Readonly<Record<string, unknown>>;
  }
): Promise<AssetSummary & { readonly warnings?: readonly string[] }> {
  return request(
    `/v1/assets/${encodeURIComponent(assetId)}/finalize`,
    { method: 'POST', body: input }
  );
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: { readonly kind?: AssetKind };
}): Promise<Page<AssetSummary>> {
  return requestPage<AssetSummary>('/v1/assets', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<AssetSummary> {
  return request<AssetSummary>(`/v1/assets/${encodeURIComponent(id)}`);
}

export function refreshUrl(id: string): Promise<{
  readonly publicUrl: string;
  readonly publicUrlExpiresAt: string;
}> {
  return request(`/v1/assets/${encodeURIComponent(id)}/refresh-url`, {
    method: 'POST',
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function detectFaces(id: string): Promise<{
  readonly faces: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
}> {
  return request(`/v1/assets/${encodeURIComponent(id)}/detect-faces`, {
    method: 'POST',
  });
}

/** إحداثيات نسبية من العرض/الارتفاع (L-02). */
export function patchFaces(
  id: string,
  input: {
    readonly faces: readonly {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }[];
  }
): Promise<void> {
  return request<void>(`/v1/assets/${encodeURIComponent(id)}/faces`, {
    method: 'PATCH',
    body: input,
  });
}
