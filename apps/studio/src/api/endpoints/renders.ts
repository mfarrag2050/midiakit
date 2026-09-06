// /v1/renders — docs/16 §8. brand_snapshot + template_snapshot ذرّيان.

import { request, requestPage, type Page } from '../client';

export type RenderStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'cancelling';

export interface RenderCreated {
  readonly id: string;
  readonly status: 'queued';
  readonly queuedAt: string;
  readonly estimatedStartAt?: string;
  readonly brand_snapshot_id: string;
  readonly template_snapshot_id: string;
}

export interface RenderRow {
  readonly id: string;
  readonly project_id: string;
  readonly status: RenderStatus;
  readonly size: string;
  readonly format: 'png' | 'mp4';
  readonly output_url: string | null;
  readonly duration_ms: number | null;
  readonly brand_snapshot_id: string;
  readonly template_snapshot_id: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export function create(
  input: {
    readonly project_id: string;
    readonly size: 'x' | 'instagram' | 'feed' | 'reel';
    readonly format: 'png' | 'mp4';
    readonly priority?: 'urgent' | 'normal';
  },
  idempotencyKey?: string
): Promise<RenderCreated> {
  return request<RenderCreated>('/v1/renders', {
    method: 'POST',
    body: input,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: {
    readonly project_id?: string;
    readonly status?: RenderStatus;
    readonly format?: 'png' | 'mp4';
  };
}): Promise<Page<RenderRow>> {
  return requestPage<RenderRow>('/v1/renders', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<RenderRow> {
  return request<RenderRow>(`/v1/renders/${encodeURIComponent(id)}`);
}

// §8.4 — 404 OUTPUT_NOT_READY when status ≠ succeeded.
export function getOutput(
  id: string
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/output`);
}

export function getBrandSnapshot(id: string): Promise<{ readonly config: unknown }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/brand-snapshot`);
}

export function getTemplateSnapshot(id: string): Promise<{ readonly definition: unknown }> {
  return request(`/v1/renders/${encodeURIComponent(id)}/template-snapshot`);
}

export function cancel(id: string): Promise<RenderRow> {
  return request(`/v1/renders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/renders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
