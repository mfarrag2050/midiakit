// /api/diacritize — Next.js route يعمل proxy بسيطاً إلى خدمة التشكيل
// المحلّية على 127.0.0.1:19080 (services/diacritizer/).
//
// **لماذا proxy؟** خدمة التشكيل بلا CORS (`services/diacritizer/main.py`
// تعلن ذلك صراحة). استدعاؤها من متصفح على origin مختلف = رفض. Proxy
// خادم-جانب في Next يحلّ المشكلة بلا تعديل خدمة (بوابة توقّف: لا تعديل
// على services/**).
//
// **السلوك:**
// - POST { text: string } ⇒ 200 { text: مُشكَّل }
// - الخدمة غير متاحة (ECONNREFUSED / 000) ⇒ 503 مع رمز خاص ندلّ الواجهة
//   عليه: `SERVICE_UNAVAILABLE`. الواجهة تعرض رسالة عربية «الخدمة غير
//   متاحة — شغّل services/diacritizer محلّياً» + زرّ إعادة.
// - الخدمة أعادت شيئاً ⇒ نُمرِّره كما هو.
//
// **قاعدة أمن:** لا logging للنصّ نفسه — لا في stdout ولا في history.
// النصّ خاص بالمشروع؛ pass-through فقط.

const UPSTREAM = 'http://127.0.0.1:19080/diacritize';

export async function POST(req: Request): Promise<Response> {
  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'errors.VALIDATION_FAILED', field: 'text' } },
      { status: 400 }
    );
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text || text.length > 2000) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'errors.VALIDATION_FAILED', field: 'text' } },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const up = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!up.ok) {
      return Response.json(
        {
          error: {
            code: 'PROVIDER_ERROR',
            message: 'errors.PROVIDER_ERROR',
            field: null,
            upstreamStatus: up.status,
          },
        },
        { status: 502 }
      );
    }
    const data = (await up.json()) as { text?: unknown };
    return Response.json({ text: String(data.text ?? '') });
  } catch (err) {
    // ECONNREFUSED / abort / DNS = الخدمة غير متاحة.
    return Response.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'errors.SERVICE_UNAVAILABLE',
          field: null,
          upstreamHint: 'services/diacritizer on 127.0.0.1:19080',
        },
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
