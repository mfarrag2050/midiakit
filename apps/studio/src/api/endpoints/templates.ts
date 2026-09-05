// /v1/templates — docs/16 §6.
// **بعد A13 + SYNC-β**: الأشكال المُثبَتة من fetch حقيقي:
//   GET /v1/templates       → {data:[{id,scope,name,kind,createdAt}], nextCursor, hasMore}
//   GET /v1/templates/:id   → {id, scope, name, kind, definition, createdAt, updatedAt}
//   POST /v1/templates      → 201 نفس شكل :id
//   PATCH/DELETE على scope=global → 403 GLOBAL_TEMPLATE_READONLY

import { request, requestPage, type Page } from '../client';

export type TemplateScope = 'global' | 'tenant';
export type TemplateKind = 'static' | 'video';

export interface TemplateListItem {
  readonly id: string;
  readonly scope: TemplateScope;
  readonly name: string;
  readonly kind: TemplateKind;
  readonly createdAt: string;
}

export interface Template extends TemplateListItem {
  readonly definition: unknown;
  readonly updatedAt: string;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: {
    readonly scope?: TemplateScope;
    readonly kind?: TemplateKind;
  };
}): Promise<Page<TemplateListItem>> {
  return requestPage<TemplateListItem>('/v1/templates', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<Template> {
  return request<Template>(`/v1/templates/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly name: string;
  readonly kind: TemplateKind;
  readonly definition: unknown;
}): Promise<Template> {
  return request<Template>('/v1/templates', { method: 'POST', body: input });
}

/** JSON Merge Patch — يفشل بـ403 GLOBAL_TEMPLATE_READONLY على القوالب العامة. */
export function patch(id: string, input: unknown): Promise<Template> {
  return request<Template>(`/v1/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
