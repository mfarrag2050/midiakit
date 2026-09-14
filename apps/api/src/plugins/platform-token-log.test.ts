// 317-A-REFUSAL-THAT-LEAVES-NO-TRACE · رفض platform token يترك أثراً في السجلّ.
//
// **الادّعاء المُختبَر** (§٣):
//   1. رمز موقَّع بسرّ خاطئ ⇒ HTTP 401 (سلوك الرفض لم يتغيّر · §٤).
//   2. الجسم المُعاد لا يكشف السبب (code=TOKEN_INVALID فقط).
//   3. السجلّ يحمل `causeCode` من jose (مثل ERR_JWS_SIGNATURE_VERIFICATION_FAILED)
//      + `causeMsg` مقصوصة.
//   4. **لا الرمز ولا أيّ جزء منه** يظهر في السجلّ.
//
// **L-46**: قبل 317 platform-session.ts:catch كان يرمي TokenInvalid() بلا cause
// · error-handler.ts:ApiError branch يرد ويعود بلا log. الاختبار يفشل باعتيادي.
// بعد 317: cause يُمرَّر · error-handler يسجّل warn. الاختبار يمرّ.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { Writable } from 'node:stream';
import { buildServer } from '../server.js';
import { closePool, closePlatformPool } from '../db.js';
import { closeQueues } from '../queues/index.js';

let fastify: FastifyInstance;
const logLines: string[] = [];
let forgedToken: string;

beforeAll(async () => {
  // نمرّر pino config مع stream مخصّص إلى fastify (يفوّض لـpino الداخليّ)
  // — يتفادى استيراد pino من apps/api (غير محلول محلّيّاً).
  const stream = new Writable({
    write(chunk, _enc, cb) { logLines.push(chunk.toString()); cb(); },
  });
  fastify = await buildServer({ level: 'warn', stream });
  await fastify.ready();

  // نصنع token بسرّ خاطئ (بدل PLATFORM_JWT_SECRET الحقيقيّ)
  // signature valid syntactically · لكن SigVerification يفشل ⇒
  // jose يرمي ERR_JWS_SIGNATURE_VERIFICATION_FAILED.
  const wrongSecret = new TextEncoder().encode('wrong-secret-' + 'x'.repeat(64));
  forgedToken = await new SignJWT({
    sub_type: 'platform',
    platform_role: 'owner',
    session_id: '00000000-0000-0000-0000-000000000000',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .setIssuer('mk-api-platform')
    .setAudience('mk-platform')
    .sign(wrongSecret);
});

afterAll(async () => {
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('317 · platform token · رفض يترك أثراً', () => {
  it('bad signature ⇒ 401 + جسم لا يكشف · سجلّ يحمل ERR_JWS_SIGNATURE_VERIFICATION_FAILED', async () => {
    const startIdx = logLines.length;
    const r = await fastify.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${forgedToken}` },
    });

    // (١·§٤): 401 · جسم لم يتغيّر
    expect(r.statusCode).toBe(401);
    const body = JSON.parse(r.body) as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_INVALID');

    // (٢·§٤): الجسم لا يكشف السبب — لا causeCode ولا causeMsg
    expect(r.body).not.toContain('ERR_JWS');
    expect(r.body).not.toContain('signature');

    // (٣): السجلّ يحمل causeCode
    const newLogs = logLines.slice(startIdx).join('');
    expect(newLogs, 'log يجب أن يحمل ERR_JWS_SIGNATURE_VERIFICATION_FAILED').toContain('ERR_JWS_SIGNATURE_VERIFICATION_FAILED');

    // (٤): لا الرمز ولا أيّ جزء منه في السجلّ
    // الرمز JWT له 3 أجزاء مفصولة بـ`.` — نتحقّق من عدم ظهور أيّ منها
    const tokenParts = forgedToken.split('.');
    for (const part of tokenParts) {
      if (part.length < 20) continue; // header/short parts قد تكون شائعة
      expect(newLogs, `token part '${part.slice(0, 12)}...' يجب ألّا يظهر في السجلّ`).not.toContain(part);
    }
    // فحص شامل: الرمز الكامل ليس في السجلّ
    expect(newLogs).not.toContain(forgedToken);
  });

  it('missing Bearer ⇒ 401 · TOKEN_INVALID (أو UNAUTHORIZED) · بلا سرّ في السجلّ', async () => {
    const startIdx = logLines.length;
    const r = await fastify.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      // بلا header
    });
    expect(r.statusCode).toBe(401);

    const newLogs = logLines.slice(startIdx).join('');
    // لا سرّ في السجلّ — لا Bearer ولا JWT parts
    expect(newLogs).not.toContain('Bearer ');
    expect(newLogs).not.toContain(forgedToken);
  });

  it('404 route ⇒ NOT_FOUND · لا يُسجَّل (ضجيج · اقتراح §٤)', async () => {
    const startIdx = logLines.length;
    const r = await fastify.inject({
      method: 'GET',
      url: '/v1/nonexistent-endpoint-xxx',
    });
    expect(r.statusCode).toBe(404);

    const newLogs = logLines.slice(startIdx).join('');
    // NOT_FOUND مستَبعَد من warn logging (نص code في error-handler)
    expect(newLogs).not.toContain('api error');
  });
});
