// /v1/renders — docs/16 §8. brand_snapshot ذرّي عند POST.

import { request, requestPage, type Page } from '../client';

export type RenderStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type RenderQueue = 'urgent' | 'normal' | 'edit' | 'batch';

export interface RenderSummary {
  readonly id: string;
  readonly projectId: string;
  readonly status: RenderStatus;
  readonly queue: RenderQueue;
  readonly size: { readonly w: number; readonly h: number };
  readonly format: 'png' | 'mp4';
  readonly progress: number;
  readonly durationMs: number | null;
  readonly createdAt: string;
}

export function create(
  input: {
    readonly projectId: string;
    readonly format: 'png' | 'mp4';
    readonly size: { readonly w: number; readonly h: number };
    readonly queue?: RenderQueue;
  },
  idempotencyKey?: string
): Promise<RenderSummary> {
  return request<RenderSummary>('/v1/renders', {
    method: 'POST',
    body: input,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: {
    readonly projectId?: string;
    readonly status?: RenderStatus;
  };
}): Promise<Page<RenderSummary>> {
  return requestPage<RenderSummary>('/v1/renders', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<RenderSummary> {
  return request<RenderSummary>(`/v1/renders/${encodeURIComponent(id)}`);
}

export function getOutput(
  id: string
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/output`);
}

export function getBrandSnapshot(id: string): Promise<{ readonly config: unknown }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/brand-snapshot`);
}

export function cancel(id: string): Promise<{ readonly status: RenderStatus }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/renders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
