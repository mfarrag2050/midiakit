// /v1/workflows — docs/16 §11.
// **بعد SYNC-δ (mk-api 8b20eaf):** الأشكال المُثبَتة بـcurl حقيقي.

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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly kind?: string;
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

// §11.3 — إنشاء workflow بتعريف كامل. presets مبنية على العميل ثم تُرسَل.
export function create(input: {
  readonly name: string;
  readonly kind?: string;
  readonly states: readonly WorkflowState[];
  readonly transitions: readonly WorkflowTransition[];
}): Promise<WorkflowFull> {
  return request<WorkflowFull>('/v1/workflows', {
    method: 'POST',
    body: input,
  });
}

// §11.4 — PATCH يمنع تعديل حقول ثابتة على workflow مستعمل
// (409 WORKFLOW_IN_USE_IMMUTABLE_FIELD).
export function patch(
  id: string,
  input: Partial<{
    readonly name: string;
    readonly kind: string;
    readonly states: readonly WorkflowState[];
    readonly transitions: readonly WorkflowTransition[];
  }>
): Promise<WorkflowFull> {
  return request<WorkflowFull>(`/v1/workflows/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

// §11.5 — 409 على الافتراضي (CANNOT_DELETE_DEFAULT) أو المستعمل (WORKFLOW_IN_USE).
export function remove(id: string): Promise<void> {
  return request<void>(`/v1/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
