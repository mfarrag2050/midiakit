// /v1/workflows — docs/16 §11.

import { request, requestPage, type Page } from '../client';

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: 'individual' | 'small-team' | 'full-agency' | 'custom';
  readonly isDefault: boolean;
  readonly updatedAt: string;
}

export interface WorkflowFull extends WorkflowSummary {
  readonly states: readonly {
    readonly id: string;
    readonly name: string;
    readonly isInitial: boolean;
    readonly isTerminal: boolean;
  }[];
  readonly transitions: readonly {
    readonly id: string;
    readonly fromStateId: string;
    readonly toStateId: string;
    readonly allowedRoles: readonly string[];
    readonly requiresReason: boolean;
  }[];
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
}): Promise<Page<WorkflowSummary>> {
  return requestPage<WorkflowSummary>('/v1/workflows', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
  });
}

export function get(id: string): Promise<WorkflowFull> {
  return request<WorkflowFull>(`/v1/workflows/${encodeURIComponent(id)}`);
}

export function create(input: Omit<WorkflowFull, 'id' | 'updatedAt'>): Promise<WorkflowFull> {
  return request<WorkflowFull>('/v1/workflows', {
    method: 'POST',
    body: input,
  });
}

export function patch(id: string, input: unknown): Promise<WorkflowFull> {
  return request<WorkflowFull>(`/v1/workflows/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
