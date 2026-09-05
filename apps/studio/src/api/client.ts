// طبقة استهلاك mk-api — تنفّذ عقد `docs/16`:
//  §1.2 مصادقة Bearer (auto-refresh عند 401)
//  §1.4 شكل الخطأ الموحّد (`error.code`, `error.field`, `error.message` مفتاح i18n)
//  §1.5 ترقيم cursor-based
//  §1.6 تصفية `filter[field]=val`
//  §1.7 `Idempotency-Key` للعمليات المُنشِئة
//
// **قاعدة الحياد:** هذا الملف يُكتب الآن ولا يُستدعى من أيّ صفحة
// حتى يجهز mk-api (بند S1 في `docs/17`). الغاية: عندما ينضج العقد،
// الربط تعديل استيراد لا إعادة بناء.
//
// **أوامر:**
// - `NEXT_PUBLIC_API_URL` هو أصل mk-api. غيابه في dev = خطأ صريح.
// - كل استدعاء يمرّ عبر `request()` — لا `fetch` مباشر في مكوّنات.

import { parseApiError, ApiError } from './errors';
import { handleMock, isMockEnabled } from './mock';
import {
  getAccessToken,
  getRefreshToken,
  updateAccessToken,
  clearSession,
} from './tokens';

const REFRESH_PATH = '/v1/auth/refresh';

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  /** استعمال داخلي — يمنع حلقة auto-refresh لانهائية. */
  readonly _isRetry?: boolean;
  /** يمرّر signal للإلغاء (مثلاً عند useEffect cleanup). */
  readonly signal?: AbortSignal;
}

function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_API_URL غير معرَّف — أضفه في .env قبل استدعاء طبقة API (أو ضع NEXT_PUBLIC_API_MOCK=true)'
    );
  }
  return url.replace(/\/+$/, '');
}

function buildQuery(
  q: Readonly<Record<string, string | number | boolean | undefined>>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function readBody(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return null;
}

// —— auto-refresh: طلب واحد يستأثر بالتجديد كي لا نستدعي refresh N مرات
// حين تنتهي جلسة نشطة في تبويبات متعدّدة.
let inflightRefresh: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError({
    code: 'UNAUTHENTICATED',
    messageKey: 'errors.UNAUTHENTICATED',
    field: null,
    requestId: null,
    status: 401,
  });

  const res = await fetch(`${apiBase()}${REFRESH_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearSession();
    throw parseApiError(res.status, await readBody(res));
  }

  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  updateAccessToken({
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  });
}

async function ensureRefresh(): Promise<void> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAccessToken().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * الطلب الأساسي — كل endpoint typed يستدعي هذا.
 * يُلقي `ApiError` عند فشل. النجاح يعيد جسم استجابة الخادم كما هو.
 */
export async function request<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const method = opts.method ?? 'GET';

  // Mock switch — يعمل قبل fetch كي لا تحتاج NEXT_PUBLIC_API_URL.
  // ApiError يخرج من `handleMock` كما لو من الشبكة — بلا فرق للمستدعي.
  if (isMockEnabled()) {
    const result = await handleMock(method, path, opts.body);
    if (result.status === 204) return undefined as T;
    return result.body as T;
  }

  const url =
    `${apiBase()}${path}` + (opts.query ? buildQuery(opts.query) : '');

  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(opts.headers ?? {}),
  };

  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const token = getAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;

  if (opts.idempotencyKey) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }

  const init: RequestInit = {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
    ...(opts.signal ? { signal: opts.signal } : {}),
  };

  const res = await fetch(url, init);

  // 429 — احترم Retry-After ثم أعد المحاولة **مرة واحدة**.
  if (res.status === 429 && !opts._isRetry) {
    const retry = Number(res.headers.get('retry-after') ?? '1');
    const ms = Math.max(500, Math.min(retry * 1000, 30_000));
    await new Promise((r) => setTimeout(r, ms));
    return request<T>(path, { ...opts, _isRetry: true });
  }

  // 401 — جدّد access ثم كرّر (مرة واحدة).
  if (res.status === 401 && !opts._isRetry && token) {
    try {
      await ensureRefresh();
      return request<T>(path, { ...opts, _isRetry: true });
    } catch {
      clearSession();
      throw parseApiError(res.status, await readBody(res));
    }
  }

  if (!res.ok) {
    throw parseApiError(res.status, await readBody(res));
  }

  if (res.status === 204) return undefined as T;
  return (await readBody(res)) as T;
}

/** ترقيم موحّد لكل قوائم docs/16 §1.5. */
export interface Page<T> {
  readonly data: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** طلب قائمة مع cursor + limit + filters. */
export function requestPage<T>(
  path: string,
  opts: {
    readonly cursor?: string;
    readonly limit?: number;
    readonly filter?: Readonly<Record<string, string | number | boolean>>;
    readonly sort?: string;
    readonly signal?: AbortSignal;
  } = {}
): Promise<Page<T>> {
  const query: Record<string, string | number> = {};
  if (opts.cursor) query.cursor = opts.cursor;
  if (opts.limit !== undefined) query.limit = opts.limit;
  if (opts.sort) query.sort = opts.sort;
  if (opts.filter) {
    for (const [k, v] of Object.entries(opts.filter)) {
      query[`filter[${k}]`] = String(v);
    }
  }
  return request<Page<T>>(path, {
    query,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
}
