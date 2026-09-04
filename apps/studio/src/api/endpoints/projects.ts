// /v1/projects — docs/16 §7.

import { request, requestPage, type Page } from '../client';

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly assigneeId: string | null;
  readonly brandKitId: string;
  readonly templateId: string;
  readonly updatedAt: string;
}

export interface ProjectFull extends ProjectSummary {
  readonly content: unknown;
}

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: Readonly<{
    readonly state?: string;
    readonly assigneeId?: string;
    readonly brandKitId?: string;
    readonly templateId?: string;
  }>;
}): Promise<Page<ProjectSummary>> {
  return requestPage<ProjectSummary>('/v1/projects', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
  });
}

export function get(id: string): Promise<ProjectFull> {
  return request<ProjectFull>(`/v1/projects/${encodeURIComponent(id)}`);
}

export function create(input: {
  readonly title: string;
  readonly brandKitId: string;
  readonly templateId: string;
  readonly content?: unknown;
}): Promise<ProjectFull> {
  return request<ProjectFull>('/v1/projects', {
    method: 'POST',
    body: input,
  });
}

export function patch(id: string, input: unknown): Promise<ProjectFull> {
  return request<ProjectFull>(`/v1/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function remove(id: string): Promise<void> {
  return request<void>(`/v1/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// state + transitions — docs/16 §11.6-11.8
export function getState(id: string): Promise<{
  readonly state: string;
  readonly availableTransitions: readonly {
    readonly id: string;
    readonly toState: string;
    readonly requiresReason: boolean;
  }[];
  readonly history: readonly {
    readonly at: string;
    readonly actorId: string;
    readonly fromState: string;
    readonly toState: string;
    readonly reason: string | null;
  }[];
}> {
  return request(`/v1/projects/${encodeURIComponent(id)}/state`);
}

export function transition(
  id: string,
  input: { readonly transitionId: string; readonly reason?: string }
): Promise<{ readonly state: string }> {
  return request(`/v1/projects/${encodeURIComponent(id)}/transitions`, {
    method: 'POST',
    body: input,
  });
}

export function assign(
  id: string,
  input: { readonly assigneeId: string }
): Promise<{ readonly assigneeId: string }> {
  return request(`/v1/projects/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    body: input,
  });
}
