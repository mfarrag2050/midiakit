// نمط عام — docs/16 §10. خمسة موارد بنفس الشكل.

import { request, requestPage, type Page } from '../client';

export type RevisionResource =
  | 'brand-kits'
  | 'projects'
  | 'templates'
  | 'users'
  | 'assets';

export interface RevisionSummary {
  readonly id: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actorId: string | null;
  readonly op: 'insert' | 'update' | 'delete';
  readonly diff: unknown;
  readonly hasSnapshot: boolean;
  readonly createdAt: string;
}

export interface RevisionFull {
  readonly id: string;
  readonly reconstructedState: unknown;
  readonly diff: unknown;
  readonly snapshot: unknown;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export function list(
  resource: RevisionResource,
  id: string,
  opts?: {
    readonly cursor?: string;
    readonly limit?: number;
    readonly filter?: { readonly actorId?: string };
  }
): Promise<Page<RevisionSummary>> {
  return requestPage<RevisionSummary>(
    `/v1/${resource}/${encodeURIComponent(id)}/revisions`,
    {
      ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
      ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
    }
  );
}

export function get(
  resource: RevisionResource,
  id: string,
  revId: string
): Promise<RevisionFull> {
  return request<RevisionFull>(
    `/v1/${resource}/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revId)}`
  );
}

// §10.3 — استعادة. reason ≥ 10 محارف (L-15). استجابة = المورد المُعاد.
export function restore<T = unknown>(
  resource: RevisionResource,
  id: string,
  revId: string,
  input: { readonly reason: string }
): Promise<T> {
  return request<T>(
    `/v1/${resource}/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revId)}/restore`,
    { method: 'POST', body: input }
  );
}
