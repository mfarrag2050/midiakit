// /v1/auth/* — docs/16 §2. لا يُستدعى قبل A6-A8 (S5).

import { request } from '../client';
import { setSession, clearSession } from '../tokens';
import type { AuthSession, Locale, Role, User, Tenant } from '../types';

interface SignupInput {
  readonly email: string;
  readonly password: string;
  readonly tenantName: string;
  readonly locale?: Locale;
}

interface SignupResponse {
  readonly user: { readonly id: string; readonly email: string; readonly role: Role };
  readonly tenant: Tenant;
  readonly session: AuthSession;
}

export async function signup(input: SignupInput): Promise<SignupResponse> {
  const res = await request<SignupResponse>('/v1/auth/signup', {
    method: 'POST',
    body: input,
  });
  setSession(res.session);
  return res;
}

interface LoginResponse {
  readonly session: AuthSession;
  readonly user: User;
  readonly tenant: Tenant;
}

export async function login(input: {
  readonly email: string;
  readonly password: string;
}): Promise<LoginResponse> {
  const res = await request<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: input,
  });
  setSession(res.session);
  return res;
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/v1/auth/logout', { method: 'DELETE' });
  } finally {
    clearSession();
  }
}

export function forgotPassword(email: string): Promise<void> {
  return request<void>('/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(input: {
  readonly token: string;
  readonly newPassword: string;
}): Promise<void> {
  return request<void>('/v1/auth/reset-password', {
    method: 'POST',
    body: input,
  });
}
