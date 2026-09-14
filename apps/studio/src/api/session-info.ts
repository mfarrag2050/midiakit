// معلومات الجلسة غير-الحسّاسة — user + tenant.
// Tokens (access/refresh) في tokens.ts. هذه للعرض في AppShell قبل
// أن تتوفّر endpoint المستخدم/المستأجر (يُدعى الآن من AppShell عند
// mount ليتحقّق ويُحدّث).

import type { Tenant, User } from './types';

const USER_KEY = 'pfmk.studio.session.user';
const TENANT_KEY = 'pfmk.studio.session.tenant';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function setSessionInfo(user: User, tenant: Tenant): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

export function getSessionUser(): User | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function getSessionTenant(): Tenant | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(TENANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tenant;
  } catch {
    return null;
  }
}

export function clearSessionInfo(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TENANT_KEY);
}
