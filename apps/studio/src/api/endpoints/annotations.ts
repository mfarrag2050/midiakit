// /v1/projects/:id/annotations — docs/16 §12.

import { request, requestPage, type Page } from '../client';

export interface AnnotationTarget {
  readonly kind: 'layer';
  readonly layer: string;
  readonly segmentIndex?: number;
}

export interface Annotation {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly target: AnnotationTarget;
  readonly resolved: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function list(
  projectId: string,
  opts?: {
    readonly cursor?: string;
    readonly limit?: number;
    readonly filter?: {
      readonly resolved?: boolean;
      readonly authorId?: string;
      readonly layer?: string;
      readonly segmentIndex?: number;
    };
  }
): Promise<Page<Annotation>> {
  return requestPage<Annotation>(
    `/v1/projects/${encodeURIComponent(projectId)}/annotations`,
    {
      ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
      ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts?.filter
        ? {
            filter: Object.fromEntries(
              Object.entries(opts.filter).map(([k, v]) => [k, String(v)])
            ),
          }
        : {}),
    }
  );
}

export function create(
  projectId: string,
  input: { readonly body: string; readonly target: AnnotationTarget }
): Promise<Annotation> {
  return request<Annotation>(
    `/v1/projects/${encodeURIComponent(projectId)}/annotations`,
    { method: 'POST', body: input }
  );
}

export function patch(
  projectId: string,
  annotationId: string,
  input: { readonly body?: string; readonly resolved?: boolean }
): Promise<Annotation> {
  return request<Annotation>(
    `/v1/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(annotationId)}`,
    { method: 'PATCH', body: input }
  );
}

export function remove(projectId: string, annotationId: string): Promise<void> {
  return request<void>(
    `/v1/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(annotationId)}`,
    { method: 'DELETE' }
  );
}
