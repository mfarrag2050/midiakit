// /v1/workflows — docs/16 §11.

import { request, requestPage, type Page } from '../client';

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

export interface WorkflowState {
  readonly id: string;
  readonly label: string;
  readonly assignableTo: readonly string[];
}

export interface WorkflowTransition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly requiredRole: string;
  readonly requiresReason: boolean;
}

export interface WorkflowFull extends WorkflowSummary {
  readonly states: readonly WorkflowState[];
  readonly transitions: readonly WorkflowTransition[];
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
