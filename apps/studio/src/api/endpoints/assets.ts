// /v1/assets — docs/16 §9. نمط رفع pre-signed.
//
// **الرفع نفسه ليس هنا** — src/api/uploader.ts ينفّذ PUT مباشر إلى
// الـsigned URL (بلا Bearer، بلا refresh). هذا الملف يحمل استدعاءات
// mk-api فقط.

import { request, requestPage, type Page } from '../client';

export type AssetKind = 'font' | 'logo' | 'image' | 'audio' | 'video' | 'lottie' | 'svg';

/** الشكل من §9.2/§9.4 finalize + get — كامل مع publicUrl. */
export interface Asset {
  readonly id: string;
  readonly kind: AssetKind;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly publicUrl?: string;
  readonly publicUrlExpiresAt?: string;
  readonly licenseAck?: boolean;
  readonly ackBy?: string;
  readonly ackAt?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

/** §9.3 GET /v1/assets — بلا publicUrl في القائمة (يُطلَب per-item). */
export interface AssetListItem {
  readonly id: string;
  readonly kind: AssetKind;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly licenseAck?: boolean;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface UploadUrl {
  readonly assetId: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly maxSizeBytes: number;
}

export function requestUploadUrl(input: {
  readonly kind: AssetKind;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}): Promise<UploadUrl> {
  return request<UploadUrl>('/v1/assets/upload-url', {
    method: 'POST',
    body: input,
  });
}

export function finalize(
  assetId: string,
  input: {
    readonly licenseAck?: boolean;
    readonly acknowledgedBy?: string;
    readonly acknowledgedWarnings?: readonly string[];
    readonly meta?: Readonly<Record<string, unknown>>;
  }
): Promise<Asset> {
  return request(`/v1/assets/${encodeURIComponent(assetId)}/finalize`, {
    method: 'POST',
    body: input,
  });
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: {
    readonly kind?: AssetKind;
    readonly inUse?: boolean;
    readonly licenseAck?: boolean;
    readonly label?: string;
    readonly hasFaces?: boolean;
  };
  readonly sort?: string;
}): Promise<Page<AssetListItem>> {
  return requestPage<AssetListItem>('/v1/assets', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter
      ? {
          filter: Object.fromEntries(
            Object.entries(opts.filter).map(([k, v]) => [k, String(v)])
          ),
        }
      : {}),
    ...(opts?.sort ? { sort: opts.sort } : {}),
  });
}

export function get(id: string): Promise<Asset> {
  return request<Asset>(`/v1/assets/${encodeURIComponent(id)}`);
}

export function refreshUrl(id: string): Promise<{
  readonly publicUrl: string;
  readonly expiresAt: string;
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
