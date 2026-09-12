// 144-PATCH-DEEP-MERGE · L-46 دائم على parser المُعلَن في العقد
//
// **العطب المُغلَق**: Fastify افتراضاً لا يعرف `application/merge-patch+json` —
// يرمي FST_ERR_CTP_INVALID_MEDIA_TYPE (415 → 500 عبر معالج الأخطاء).
// docs/16 §5.4 تُعلن هذا الـcontent-type لـPATCH /v1/brand-kits/:id،
// فمن يتّبع العقد يُرفَض. الإصلاح: `addContentTypeParser` في `server.ts`.
//
// **RED historique** (رأيتُه في 144 probe يوم 2026-09-11):
//   statusCode=500 · body='{"error":{"code":"INTERNAL_ERROR",...}}'
//   err: FST_ERR_CTP_INVALID_MEDIA_TYPE
//
// **GREEN دائم** (هذا الاختبار):
//   PATCH بـ`application/merge-patch+json` يُعالَج عبر parser JSON نفسه.
//   الدمج deep (شرط RFC 7396): الحقول الأخرى تبقى.
//
// **كيف يموت هذا الاختبار**: إن حُذف `addContentTypeParser('application/merge-patch+json', ...)`
// من `server.ts`، هذا الاختبار يفشل في FST_ERR_CTP_INVALID_MEDIA_TYPE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
let accessToken: string;
let bkId: string;
let initialSurface: string | undefined;

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const suffix = String(Date.now());
  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `p144test-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `P144-TEST-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const ctx = J<{ session: { accessToken: string } }>(su as { body: string })!;
  accessToken = ctx.session.accessToken;

  const create = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: { name: 'p144-test-bk' },
  });
  if (create.statusCode !== 201) throw new Error(`create: ${create.body}`);
  const bk = J<{ id: string; config: { colors: Record<string, string> } }>(create as { body: string })!;
  bkId = bk.id;
  initialSurface = bk.config.colors.surface;
});

afterAll(async () => {
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('144 · PATCH /v1/brand-kits/:id · content-type parser', () => {
  it('application/merge-patch+json يُعالَج (لا 415/500)', async () => {
    const r = await fastify.inject({
      method: 'PATCH', url: `/v1/brand-kits/${bkId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/merge-patch+json',
      },
      payload: JSON.stringify({ colors: { accent: '#123456' } }),
    });
    expect(r.statusCode).toBe(200);
  });

  it('الدمج deep — تعديل حقل واحد لا يمحو الباقي (RFC 7396)', async () => {
    const r = await fastify.inject({
      method: 'PATCH', url: `/v1/brand-kits/${bkId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/merge-patch+json',
      },
      payload: JSON.stringify({ colors: { accent: '#ABCDEF' } }),
    });
    expect(r.statusCode).toBe(200);
    const body = J<{ config: { colors: Record<string, string> } }>(r as { body: string })!;
    expect(body.config.colors.accent).toBe('#ABCDEF');
    // surface من DEFAULT_BRAND — يجب أن يظلّ · لم يُلمَس في PATCH
    expect(body.config.colors.surface).toBe(initialSurface);
  });

  it('application/json (الافتراضيّ) يبقى يعمل — لا نكوص', async () => {
    const r = await fastify.inject({
      method: 'PATCH', url: `/v1/brand-kits/${bkId}`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ colors: { accent: '#FEDCBA' } }),
    });
    expect(r.statusCode).toBe(200);
  });
});
