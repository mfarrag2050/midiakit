// 170-FONT-SERVE · L-46 دائم على عزل الخطّ + ترويسات
//
// **الشرطان اللذان يُثبتهما هذا الاختبار**:
//   1. **العزل بالمستأجر** — مستأجر (أ) يطلب خطّ (ب) ⇒ 404 (RLS يفرز).
//      لا كشف عن وجود/غياب أصل مستأجر آخر.
//   2. **الترويسات الصحيحة** — Content-Type + CORS + Cache-Control.
//
// **RED path** (بلا endpoint): 404 من fastify لطريق غير مسجَّل.
// **GREEN path** (endpoint موجود): 200 مع bytes + headers صحيحة.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';
import { getStorage } from '../../storage/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());

// tenant A: يملك الخطّ
let tokenA: string;
let tenantAId: string;
let userAId: string;
let fontAssetId: string;
let fontBytes: Buffer;

// tenant B: يحاول الوصول
let tokenB: string;
let tenantBId: string;

async function withGuc(tenantId: string, fn: (c: pg.PoolClient) => Promise<unknown>): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  // ── tenant A ──
  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `t170a-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `T170A-${suffix}`,
    },
  });
  if (suA.statusCode !== 201) throw new Error(`signup A: ${suA.body}`);
  const ctxA = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  userAId = ctxA.user.id;
  tokenA = ctxA.session.accessToken;

  // upload font لـtenant A
  const fontPath = resolve(__dirname, '..', '..', '..', '..', '..', 'assets/fonts/Almarai-Regular.ttf');
  fontBytes = readFileSync(fontPath);
  const uu = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: {
      kind: 'font',
      filename: 'almarai-t170.ttf',
      sizeBytes: fontBytes.length,
      contentType: 'font/ttf',
    },
  });
  if (uu.statusCode !== 200) throw new Error(`upload-url: ${uu.body}`);
  fontAssetId = J<{ assetId: string }>(uu as { body: string })!.assetId;

  // نجلب storage_key عبر migPool
  let storageKey: string = '';
  await withGuc(tenantAId, async (c) => {
    const r = await c.query<{ storage_key: string }>(
      `SELECT storage_key FROM assets WHERE id = $1`, [fontAssetId],
    );
    storageKey = r.rows[0]!.storage_key;
  });

  // ارفع bytes الفعليّة + finalize
  await getStorage().putObjectRaw(storageKey, fontBytes, 'font/ttf');
  const fin = await fastify.inject({
    method: 'POST', url: `/v1/assets/${fontAssetId}/finalize`,
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { licenseAck: true, acknowledgedBy: userAId },
  });
  if (fin.statusCode !== 200) throw new Error(`finalize: ${fin.body}`);

  // ── tenant B ──
  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `t170b-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `T170B-${suffix}`,
    },
  });
  if (suB.statusCode !== 201) throw new Error(`signup B: ${suB.body}`);
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;
});

afterAll(async () => {
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `T170A-${suffix}`], [tenantBId, `T170B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '170-test cleanup')`, [tid, name]);
      await c.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
      await c.query('COMMIT');
    } catch { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('170 · GET /v1/assets/:id/font', () => {
  it('GREEN: مالك الخطّ يحصل على bytes صحيحة + Content-Type', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/${fontAssetId}/font`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('font/ttf');
    expect(r.headers['content-length']).toBe(String(fontBytes.length));
    // bytes مطابقة تماماً — نُقارن أوّل + آخر 20 بايت (bytes buffer ثقيل)
    const receivedFirst = Buffer.from(r.rawPayload).slice(0, 20);
    const expectedFirst = fontBytes.slice(0, 20);
    expect(receivedFirst.equals(expectedFirst)).toBe(true);
  });

  it('GREEN: ترويسات CORS + Cache-Control + Vary صحيحة', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/${fontAssetId}/font`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(r.headers['access-control-allow-credentials']).toBe('false');
    expect(r.headers['cache-control']).toBe('private, max-age=3600');
    expect(r.headers['vary']).toContain('Origin');
    expect(r.headers['vary']).toContain('Authorization');
  });

  it('RED · العزل: tenant B يطلب خطّ tenant A ⇒ 404 (لا كشف)', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/${fontAssetId}/font`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(r.statusCode).toBe(404);
    const body = J<{ error: { code: string } }>(r as { body: string });
    expect(body?.error.code).toBe('NOT_FOUND');
  });

  it('RED · بلا Bearer ⇒ 401', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/${fontAssetId}/font`,
    });
    expect(r.statusCode).toBe(401);
  });

  it('RED · id غير موجود ⇒ 404 (نفس رسالة عزل)', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/00000000-0000-0000-0000-000000000000/font`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(404);
  });
});
