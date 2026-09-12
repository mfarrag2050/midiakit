// /v1/users — docs/16 §4.

import { request, requestPage, type Page } from '../client';
import type { Role, User } from '../types';

export function list(opts?: {
  readonly cursor?: string;
  readonly limit?: number;
  readonly filter?: { readonly role?: Role };
  readonly sort?: 'createdAt' | '-createdAt';
}): Promise<Page<User>> {
  return requestPage<User>('/v1/users', {
    ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
    ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts?.filter ? { filter: opts.filter as Record<string, string> } : {}),
    ...(opts?.sort ? { sort: opts.sort } : {}),
  });
}

export function get(id: string): Promise<User> {
  return request<User>(`/v1/users/${encodeURIComponent(id)}`);
}

export function invite(input: {
  readonly email: string;
  readonly role: Exclude<Role, 'owner'>;
}): Promise<{ readonly id: string; readonly email: string; readonly role: Role; readonly expiresAt: string }> {
  return request('/v1/users/invite', { method: 'POST', body: input });
}

export function patch(id: string, input: { readonly role: Role }): Promise<User> {
  return request<User>(`/v1/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function remove(
  id: string,
  input: { readonly reason: string }
): Promise<{
  readonly userId: string;
  readonly reassignedProjects: number;
  readonly deletedDrafts: number;
  readonly newOwnerId: string;
}> {
  return request(`/v1/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: input,
  });
}
