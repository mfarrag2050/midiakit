// البند 4 · عقد الخطّ الثاني في PATCH /v1/brand-kits/:id.
//
// اختبار (4) المُجاز: `fonts.secondary.licenseAck` ⇒ 400 IMMUTABLE_FIELD.
// ومعه ما يثبت أنّ العقد يُحفَظ كما هو، وأنّ `familyKeys` يشمل secondary
// (assetId بلا متريكات ⇒ 422 INVALID_FONT_METRICS كما في primary).
//
// **كيف يموت:** حذف 'fonts.secondary.licenseAck' من BLOCKED_PATHS ⇒ (4) أحمر.
// حذف 'secondary' من familyKeys ⇒ اختبار الـ422 أحمر (يمرّ بـ200).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { findBuiltinFont } from '@pf-mediakit/shared';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
let accessToken: string;
let bkId: string;

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
      email: `p4sec-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `P4SEC-TEST-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  accessToken = J<{ session: { accessToken: string } }>(su as { body: string })!.session.accessToken;
  const create = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: { name: 'p4sec-test-bk' },
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

describe('البند 4 · fonts.secondary + typography.<role>.family', () => {
  it('(4) fonts.secondary.licenseAck ⇒ 400 IMMUTABLE_FIELD', async () => {
    const r = await patch({ fonts: { secondary: { licenseAck: true } } });
    expect(r.statusCode).toBe(400);
    const body = J<{ error: { code: string; field?: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('IMMUTABLE_FIELD');
    expect(body.error.field).toBe('fonts.secondary.licenseAck');
  });

  it('secondary مدمَج + دور يختاره ⇒ 200 ويُحفَظ · primary لا يُمَسّ', async () => {
    const naskh = findBuiltinFont('Noto Naskh Arabic')!;
    const before = await fastify.inject({
      method: 'GET', url: `/v1/brand-kits/${bkId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const primaryBefore = J<{ config: { fonts: { primary: { family: string } } } }>(before as { body: string })!
      .config.fonts.primary.family;

    const r = await patch({
      fonts: {
        secondary: {
          family: naskh.family,
          source: 'builtin',
          weights: {
            light: { value: naskh.weights.light.value, metrics: naskh.weights.light.metrics },
            regular: { value: naskh.weights.regular.value, metrics: naskh.weights.regular.metrics },
            bold: { value: naskh.weights.bold.value, metrics: naskh.weights.bold.metrics },
          },
        },
      },
      typography: { source: { family: 'secondary' } },
    });
    expect(r.statusCode, r.body).toBe(200);
    const cfg = J<{ config: {
      fonts: { primary: { family: string }; secondary: { family: string; source: string } };
      typography: { source: { family: string; size: number }; breaking: { family?: string } };
    } }>(r as { body: string })!.config;
    expect(cfg.fonts.secondary.family).toBe(naskh.family);
    expect(cfg.fonts.secondary.source).toBe('builtin');
    expect(cfg.fonts.primary.family).toBe(primaryBefore);
    expect(cfg.typography.source.family).toBe('secondary');
    expect(typeof cfg.typography.source.size).toBe('number'); // الدمج العميق أبقى بقيّة الدور
    expect(cfg.typography.breaking.family).toBeUndefined();   // دورٌ لم يُمَسّ ⇒ primary ضمناً
  });

  it('familyKeys يشمل secondary: assetId غير موجود ⇒ 422 INVALID_FONT_METRICS', async () => {
    const r = await patch({
      fonts: { secondary: { weights: { regular: { assetId: '00000000-0000-0000-0000-000000000004' } } } },
    });
    expect(r.statusCode, r.body).toBe(422);
    expect(J<{ error: { code: string } }>(r as { body: string })!.error.code).toBe('INVALID_FONT_METRICS');
  });
});
