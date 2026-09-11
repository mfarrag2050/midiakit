// مخزن رموز المصادقة — localStorage الآن. عند اكتمال endpoint المستخدم
// (S6+A6)، لا يتغيّر شيء هنا — الرموز تبقى في المتصفح، والخادم يحمل
// السياق (docs/16 §2).
//
// **قواعد أمنية:**
// - refresh token لا يُقرأ خارج هذا الملف — لا يُلحق برأس Authorization
//   في طلبات عادية.
// - clear() يمحو الرمزين معاً — لا حالة فردية.

const ACCESS_KEY = 'pfmk.studio.session.access';
const REFRESH_KEY = 'pfmk.studio.session.refresh';

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setSession(tokens: SessionTokens): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function updateAccessToken(next: {
  readonly accessToken: string;
  readonly refreshToken: string;
}): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, next.accessToken);
  window.localStorage.setItem(REFRESH_KEY, next.refreshToken);
}

export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}
