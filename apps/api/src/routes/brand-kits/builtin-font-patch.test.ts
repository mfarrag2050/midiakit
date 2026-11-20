// 547 · PATCH /v1/brand-kits/:id بخطّ مدمَج — قياسٌ لا افتراض.
//
// **البلاغ (542 §1):** PATCH بـ`config.fonts.primary.family="Cairo"`
// (source:"builtin") ردّ 400 VALIDATION_FAILED بـ`field=config`.
//
// **ما يقيسه هذا الملفّ:**
//   (أ) الشكل الصحيح حسب العقد (docs/16 §5.4) — `fonts` في الجذر، كما
//       يرسله محرّر الاستوديو — يُقبَل لكلّ خطّ في BUILTIN_FONTS ويُحفَظ.
//   (ب) شكل 542 الحرفيّ — `{ config: { fonts } }` — يُرفَض بـ
//       VALIDATION_FAILED/field=config، لأنّ `config` ليس مفتاحاً في
//       BrandKit (حارس BK-NUMERALS). هذا سلوكٌ مقصود لا عيب.
//
// **كيف يموت:** إن رفض الـAPI خطّاً مدمَجاً بالشكل الصحيح ⇒ (أ) أحمر.
// إن ابتلع الـAPI مفتاح `config` صامتاً ⇒ (ب) أحمر.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BUILTIN_FONTS } from '@pf-mediakit/shared';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
let accessToken: string;
let bkId: string;

function fontsPatch(f: (typeof BUILTIN_FONTS)[number]) {
  return {
    fonts: {
      primary: {
        family: f.family,
        source: 'builtin',
        weights: {
          light: { value: f.weights.light.value, metrics: f.weights.light.metrics },
          regular: { assetId: null, value: f.weights.regular.value, metrics: f.weights.regular.metrics },
          bold: { value: f.weights.bold.value, metrics: f.weights.bold.metrics },
        },
      },
    },
  };
}

function patch(payload: unknown) {
  return fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${bkId}`,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  });
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const suffix = String(Date.now());
  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `p547test-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `P547-TEST-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  accessToken = J<{ session: { accessToken: string } }>(su as { body: string })!.session.accessToken;

  const create = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: { name: 'p547-test-bk' },
  });
  if (create.statusCode !== 201) throw new Error(`create: ${create.body}`);
  bkId = J<{ id: string }>(create as { body: string })!.id;
});

afterAll(async () => {
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('547 · PATCH brand-kit بخطّ مدمَج', () => {
  for (const f of BUILTIN_FONTS) {
    it(`(أ) fonts.primary = ${f.family} (builtin) ⇒ 200 ويُحفَظ`, async () => {
      const r = await patch(fontsPatch(f));
      expect(r.statusCode, r.body).toBe(200);
      const body = J<{ config: { fonts: { primary: { family: string; source: string } } } }>(r as { body: string })!;
      expect(body.config.fonts.primary.family).toBe(f.family);
      expect(body.config.fonts.primary.source).toBe('builtin');
    });
  }

  it('(ب) شكل 542 الحرفيّ { config: { fonts } } ⇒ 400 VALIDATION_FAILED field=config', async () => {
    const cairo = BUILTIN_FONTS.find((f) => f.family === 'Cairo')!;
    const r = await patch({ config: fontsPatch(cairo) });
    expect(r.statusCode).toBe(400);
    const body = J<{ error: { code: string; field?: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.field).toBe('config');
  });
});
