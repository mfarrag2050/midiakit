// /v1/projects — docs/16 §7 · §11.6-§11.8 · §12.

import { request, requestPage, type Page } from '../client';

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly currentState: string;
  readonly assigneeId: string | null;
  readonly updatedAt: string;
}

export interface ProjectFull extends ProjectSummary {
  readonly content: Record<string, unknown>;
  readonly locale: string;
  readonly workflow_id: string;
  readonly createdAt: string;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: Readonly<{
    readonly state?: string;
    readonly assignee?: string;
    readonly brand_kit_id?: string;
    readonly template_id?: string;
  }>;
  readonly sort?: string;
}): Promise<Page<ProjectSummary>> {
  return requestPage<ProjectSummary>('/v1/projects', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
    ...(opts?.sort !== undefined ? { sort: opts.sort } : {}),
  });
}

export function get(id: string): Promise<ProjectFull> {
  return request<ProjectFull>(`/v1/projects/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly title: string;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly content?: Record<string, unknown>;
  readonly locale?: string;
  readonly workflow_id?: string;
}): Promise<ProjectFull> {
  return request<ProjectFull>('/v1/projects', {
    method: 'POST',
    body: input,
  });
}

// §12: PATCH يستلزم If-Match (ETag = updatedAt). الغياب → 428
// IF_MATCH_REQUIRED. عدم التطابق → 409 STALE_UPDATE.
export function patch(
  id: string,
  input: Record<string, unknown>,
  ifMatch: string
): Promise<ProjectFull> {
  return request<ProjectFull>(`/v1/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    headers: { 'if-match': ifMatch },
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// §11.6 GET /v1/projects/:id/state
export interface ProjectState {
  readonly projectId: string;
  readonly workflowId: string;
  readonly currentState: string;
  readonly assigneeId: string | null;
  readonly availableTransitions: readonly {
    readonly id: string;
    readonly to: string;
    readonly label: string;
    readonly requiresReason: boolean;
  }[];
  readonly history: readonly {
    readonly transitionId: string;
    readonly from: string;
    readonly to: string;
    readonly actorId: string | null;
    readonly reason: string | null;
    readonly at: string;
  }[];
}

export function getState(id: string): Promise<ProjectState> {
  return request<ProjectState>(`/v1/projects/${encodeURIComponent(id)}/state`);
}

// §11.7 POST /v1/projects/:id/transitions
export function transition(
  id: string,
  input: {
    readonly transitionId: string;
    readonly reason?: string;
    readonly assigneeId?: string | null;
  }
): Promise<ProjectState> {
  return request<ProjectState>(
    `/v1/projects/${encodeURIComponent(id)}/transitions`,
    { method: 'POST', body: input }
  );
}

// §11.8 POST /v1/projects/:id/assign
export function assign(
  id: string,
  input: { readonly assigneeId: string | null }
): Promise<{ readonly assigneeId: string | null }> {
  return request(`/v1/projects/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    body: input,
  });
}
