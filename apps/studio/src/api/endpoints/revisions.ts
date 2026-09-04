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
  readonly actorId: string;
  readonly action: 'create' | 'update' | 'delete' | 'reassign' | 'restore';
  readonly createdAt: string;
}

export interface RevisionFull extends RevisionSummary {
  readonly diff: unknown;
  readonly reconstructedState: unknown;
  readonly reason: string | null;
}

export function list(
  resource: RevisionResource,
  id: string,
  opts?: {
    readonly cursor?: string;
    readonly limit?: number;
    readonly filter?: { readonly actorId?: string; readonly createdAt?: string };
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

export function restore(
  resource: RevisionResource,
  id: string,
  revId: string,
  input: { readonly reason: string }
): Promise<{ readonly newRevisionId: string }> {
  return request(
    `/v1/${resource}/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revId)}/restore`,
    { method: 'POST', body: input }
  );
}
