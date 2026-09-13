// 330-THREE-LEAKS-AND-A-LIE §1 · CF Access opaqueredirect ⇒ AUTH_SESSION_EXPIRED
//
// **Why it exists:** قبل التذكرة، طلب `/v1/*` يعترضه CF Access حين تنتهي جلسة
// النفق. `fetch` يتبع 302 تلقائياً إلى `*.cloudflareaccess.com` (Origin مختلف
// ⇒ CORS ⇒ TypeError) — الواجهة كانت ترى «تعذّر الوصول إلى الخدمة» وتكذب على
// المستخدم. الحلّ في `client.ts`: `redirect: 'manual'` + فحص `res.type` صريح.
//
// **الحياة:** الاختبار يستبدل `globalThis.fetch` بمولّد استجابة opaqueredirect
// (كما يصنعها المتصفّح فعلاً حين redirect:'manual') ويتحقّق أنّ:
//   1. `request()` يرمي `ApiError`
//   2. الكود = `AUTH_SESSION_EXPIRED` (ليس `NETWORK_ERROR` ولا `UNKNOWN`)
//   3. مفتاح i18n = `errors.AUTH_SESSION_EXPIRED`
//
// **RED (قبل الإصلاح):** حذف الفرع `res.type === 'opaqueredirect'` ⇒ الفحص
// التالي `!res.ok` (لأنّ status=0) ⇒ `parseApiError(0, null)` ⇒ خطأ عامّ.
// **GREEN (بعد الإصلاح):** الكود المكتوب في `client.ts` — الاختبار يمرّ.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiError } from './errors';
import { request } from './client';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;
const ORIGINAL_MOCK = process.env.NEXT_PUBLIC_API_MOCK;

describe('CF Access opaqueredirect → AUTH_SESSION_EXPIRED (330 §1)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://mkdemo.primeflow.co';
    process.env.NEXT_PUBLIC_API_MOCK = 'false';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_API_URL === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    if (ORIGINAL_MOCK === undefined) delete process.env.NEXT_PUBLIC_API_MOCK;
    else process.env.NEXT_PUBLIC_API_MOCK = ORIGINAL_MOCK;
  });

  it('يرمي AUTH_SESSION_EXPIRED حين fetch يعيد type=opaqueredirect', async () => {
    // كائن يشبه Response كما يصنعها المتصفّح مع redirect:'manual':
    //   type='opaqueredirect' · status=0 · body غير مقروء.
    const fakeResponse = {
      type: 'opaqueredirect' as ResponseType,
      status: 0,
      ok: false,
      headers: new Headers(),
      json: async () => null,
      text: async () => '',
    };
    globalThis.fetch = (async () => fakeResponse) as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await request('/v1/projects');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as ApiError;
    expect(apiErr.code).toBe('AUTH_SESSION_EXPIRED');
    expect(apiErr.messageKey).toBe('errors.AUTH_SESSION_EXPIRED');
    // ليس هذه:
    expect(apiErr.code).not.toBe('NETWORK_ERROR');
    expect(apiErr.code).not.toBe('UNKNOWN');
    expect(apiErr.messageKey).not.toBe('errors.NETWORK_ERROR');
  });

  it('استجابة 200 عادية لا تُطلق AUTH_SESSION_EXPIRED', async () => {
    const okResponse = new Response(JSON.stringify({ id: 'p_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    globalThis.fetch = (async () => okResponse) as unknown as typeof fetch;
    const body = await request<{ id: string }>('/v1/projects/p_1');
    expect(body.id).toBe('p_1');
  });
});
