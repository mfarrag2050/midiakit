// طبقة mock لـmk-api — تُفعَّل بمتغيّر البيئة `NEXT_PUBLIC_API_MOCK=true`.
//
// **الغاية:** S5 يبني صفحات المصادقة على mocks قبل فتح SYNC-α
// (docs/17 §4.2). عند اكتمال A6-A8، إزالة المتغيّر تعيد المسار إلى
// الخدمة الحقيقية بلا تعديل صفحة.
//
// **قواعد:**
// - يحاكي عقد الاستجابة/الخطأ من docs/16 §1.4 حرفياً — نفس المفاتيح
//   `error.code`, `error.field`, `error.message`, `error.requestId`.
// - لا يخترع أشكالاً — كل رمز خطأ موجود في `docs/16 §2` أو `§1.4`.
// - يقدّم مُشغِّلات نصّية (مثل `email=taken@x.com`) للقطات القارءة.
//
// **المُشغِّلات المعلَنة (اختبار كل حالة):**
//   POST /v1/auth/login
//     email=throttle@x.com     → 429 RATE_LIMITED (Retry-After: 2)
//     email=suspended@x.com    → 403 ACCOUNT_SUSPENDED
//     password === 'letmein12345' → 200 success
//     أي كلمة سر أخرى           → 401 INVALID_CREDENTIALS
//     (تفادي كشف الحسابات — بلا تمييز بين «بريد غير موجود» و«كلمة خطأ»)
//   POST /v1/auth/signup
//     email=taken@x.com        → 409 EMAIL_TAKEN (field=email)
//     email مشوَّه              → 400 INVALID_EMAIL (field=email)
//     password.length < 12     → 400 PASSWORD_TOO_WEAK (field=password)
//     tenantName فارغ          → 400 TENANT_NAME_EMPTY (field=tenantName)
//     otherwise                → 201 success
//   POST /v1/auth/forgot-password
//     دائماً                    → 204 (لا يكشف وجود البريد)
//   POST /v1/auth/reset-password
//     token=expired            → 400 TOKEN_EXPIRED (field=token)
//     token=invalid            → 400 INVALID_RESET_TOKEN (field=token)
//     newPassword.length < 12  → 400 PASSWORD_TOO_WEAK (field=newPassword)
//     otherwise                → 204

import { ApiError } from './errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_API_MOCK === 'true';
}

/** استجابة mock بشكل ما يعود من `fetch` → JSON body، بلا throw هنا.
 *  الأخطاء تُرمى كـ`ApiError` مباشرة. */
export interface MockResult {
  readonly status: number;
  readonly body: unknown;
}

function ok(status: number, body: unknown = null): MockResult {
  return { status, body };
}

function err(
  status: number,
  code: string,
  messageKey: string,
  field: string | null = null
): never {
  throw new ApiError({
    code,
    messageKey,
    field,
    requestId: `req_mock_${Date.now().toString(36)}`,
    status,
  });
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** يستلم path + method + body ويعيد نتيجة mock أو يرمي ApiError.
 *  يُستدعى فقط حين `isMockEnabled()`. */
export async function handleMock(
  method: string,
  path: string,
  body: unknown
): Promise<MockResult> {
  // تأخير 200ms لمحاكاة زمن الشبكة — كي تُرى حالة loading في المتصفح.
  await delay(200);

  const key = `${method} ${path}`;
  const b = (body ?? {}) as Record<string, unknown>;

  switch (key) {
    case 'POST /v1/auth/signup': {
      const email = String(b.email ?? '');
      const password = String(b.password ?? '');
      const tenantName = String(b.tenantName ?? '');
      if (!tenantName.trim()) err(400, 'TENANT_NAME_EMPTY', 'errors.TENANT_NAME_EMPTY', 'tenantName');
      if (!EMAIL_RE.test(email)) err(400, 'INVALID_EMAIL', 'errors.INVALID_EMAIL', 'email');
      if (password.length < 12) err(400, 'PASSWORD_TOO_WEAK', 'errors.PASSWORD_TOO_WEAK', 'password');
      if (email === 'taken@x.com') err(409, 'EMAIL_TAKEN', 'errors.EMAIL_TAKEN', 'email');
      return ok(201, {
        user: { id: 'usr_mock', email, role: 'owner' },
        tenant: { id: 'tnt_mock', name: tenantName, plan: 'trial' },
        session: {
          accessToken: 'mock.access.token',
          refreshToken: 'mock.refresh.token',
          expiresIn: 900,
        },
      });
    }

    case 'POST /v1/auth/login': {
      const email = String(b.email ?? '');
      const password = String(b.password ?? '');
      if (email === 'throttle@x.com') {
        throw new ApiError({
          code: 'RATE_LIMITED',
          messageKey: 'errors.RATE_LIMITED',
          field: null,
          requestId: `req_mock_${Date.now().toString(36)}`,
          status: 429,
        });
      }
      if (email === 'suspended@x.com') err(403, 'ACCOUNT_SUSPENDED', 'errors.ACCOUNT_SUSPENDED');
      // Mock يعرف كلمة سر واحدة فقط — أي شيء آخر = 401 (تفادي كشف
      // الحسابات: نفس الرمز لكل من «بريد مفقود» و«كلمة خطأ»).
      if (password !== 'letmein12345') {
        err(401, 'INVALID_CREDENTIALS', 'errors.INVALID_CREDENTIALS');
      }
      return ok(200, {
        session: {
          accessToken: 'mock.access.token',
          refreshToken: 'mock.refresh.token',
          expiresIn: 900,
        },
        user: { id: 'usr_mock', email, role: 'owner', createdAt: new Date().toISOString() },
        tenant: { id: 'tnt_mock', name: 'Mock Agency', plan: 'trial' },
      });
    }

    case 'POST /v1/auth/forgot-password': {
      // دائماً 204 — لا كشف وجود البريد.
      return ok(204);
    }

    case 'POST /v1/auth/reset-password': {
      const token = String(b.token ?? '');
      const newPassword = String(b.newPassword ?? '');
      if (token === 'expired') err(400, 'TOKEN_EXPIRED', 'errors.TOKEN_EXPIRED', 'token');
      if (token === 'invalid') err(400, 'INVALID_RESET_TOKEN', 'errors.INVALID_RESET_TOKEN', 'token');
      if (newPassword.length < 12) err(400, 'PASSWORD_TOO_WEAK', 'errors.PASSWORD_TOO_WEAK', 'newPassword');
      return ok(204);
    }

    default:
      err(404, 'NOT_FOUND', 'errors.NOT_FOUND');
  }
}
