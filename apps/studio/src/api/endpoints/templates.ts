// /v1/templates — docs/16 §6.

import { request, requestPage, type Page } from '../client';

export type TemplateScope = 'global' | 'tenant';
export type TemplateKind = 'card' | 'urgent' | 'reel';

export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly scope: TemplateScope;
  readonly kind: TemplateKind;
  readonly updatedAt: string;
}

export interface TemplateFull extends TemplateSummary {
  readonly definition: unknown;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: { readonly scope?: TemplateScope; readonly kind?: TemplateKind };
}): Promise<Page<TemplateSummary>> {
  return requestPage<TemplateSummary>('/v1/templates', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<TemplateFull> {
  return request<TemplateFull>(`/v1/templates/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly name: string;
  readonly kind: TemplateKind;
  readonly definition: unknown;
}): Promise<TemplateFull> {
  return request<TemplateFull>('/v1/templates', {
    method: 'POST',
    body: input,
  });
}

export function patch(id: string, input: unknown): Promise<TemplateFull> {
  return request<TemplateFull>(`/v1/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
