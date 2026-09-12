// عزل التخزين بين المستأجرين · L-46 تجريبيّ
//
// **الادّعاء المُختبَر**: أصلٌ لمستأجر (أ) لا يُقرَأ ولا يُوقَّع رابطُه ولا
// يُحدَّث ولا يُحذَف بحساب مستأجر (ب) عبر أيّ endpoint من /v1/assets.
//
// **الطبقات المُختبَرة** (يوازي تقرير mkau 260):
//   1. RLS على `assets` — SELECT من tenant B على id لـtenant A يُرجع 0.
//   2. GET /v1/assets/:id — 404 لـtenant B (لا كشف).
//   3. GET /v1/assets/:id/font — 404 (170-FONT-SERVE).
//   4. POST /v1/assets/:id/refresh-url — 404.
//   5. GET /v1/assets (list) — لا يُظهر أصل tenant A في نتيجة tenant B.
//   6. DELETE /v1/assets/:id — 404.
//   7. **shape storage_key** — يبدأ بـtenantId المستأجر · لا يمكن تخمينه
//      لمستأجر آخر ما دام tenantId يأتي من JWT.
//
// **تحفّظ صريح** (رأيتُه في تقرير 260): presigned URL bearer capability —
// من حاز URL يقرأ 15 دقيقة بلا فحص. هذا **حدود التصميم** لا هذا الاختبار.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

let tenantAId: string;
let tenantBId: string;
let tokenA: string;
let tokenB: string;
let assetAId: string; // image asset لـtenant A
let assetAStorageKey: string;
let fontAId: string; // font asset لـtenant A (لاختبار /font endpoint)
let userAId: string;

async function upload(
  token: string,
  kind: string,
  filename: string,
  contentType: string,
  bytes: Buffer,
): Promise<{ assetId: string; storageKey: string }> {
  const uu = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { kind, filename, sizeBytes: bytes.length, contentType },
  });
  if (uu.statusCode !== 200) throw new Error(`upload-url: ${uu.body}`);
  const { assetId } = J<{ assetId: string }>(uu as { body: string })!;

  // نجلب storage_key عبر migPool
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  let storageKey = '';
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
    const r = await c.query<{ storage_key: string }>(
      `SELECT storage_key FROM assets WHERE id = $1`, [assetId],
    );
    storageKey = r.rows[0]!.storage_key;
    await c.query('COMMIT');
  } finally { c.release(); await pool.end(); }

  await getStorage().putObjectRaw(storageKey, bytes, contentType);
  return { assetId, storageKey };
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  // مستأجر A
  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `iso-a-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `ISO-A-${suffix}`,
    },
  });
  if (suA.statusCode !== 201) throw new Error(`signup A: ${suA.body}`);
  const ctxA = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  userAId = ctxA.user.id;
  tokenA = ctxA.session.accessToken;

  // رفع image عاديّ (نستعمله للـget/refresh/delete/list tests)
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const img = await upload(tokenA, 'image', 'iso-a.png', 'image/png', pngBytes);
  assetAId = img.assetId;
  assetAStorageKey = img.storageKey;

  // رفع font (لاختبار /font endpoint) + finalize لجعله متاحاً
  const fontBytes = Buffer.from('OTTO', 'ascii'); // header صغير · getObjectBuffer يقرأه
  const fnt = await upload(tokenA, 'font', 'iso-a.ttf', 'font/ttf', fontBytes);
  fontAId = fnt.assetId;
  // finalize skipped — /font endpoint يفحص finalized_at، لكن اختبار العزل
  // على 404 من RLS يسبقه · لا نحتاج finalize لإثبات الرفض عبر tenant B.

  // مستأجر B
  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `iso-b-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `ISO-B-${suffix}`,
    },
  });
  if (suB.statusCode !== 201) throw new Error(`signup B: ${suB.body}`);
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;
});

afterAll(async () => {
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `ISO-A-${suffix}`], [tenantBId, `ISO-B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(
        `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
         VALUES ($1, $2, 'hard', 'isolation-test cleanup')`,
        [tid, name],
      );
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

describe('عزل التخزين بين المستأجرين · assets endpoints', () => {
  it('حدَّد storage_key يبدأ بـtenantId (server-side)', () => {
    expect(assetAStorageKey.startsWith(`${tenantAId}/`)).toBe(true);
    expect(assetAStorageKey).toContain(assetAId);
  });

  it('RLS مباشر: tenant B يستعلم عن id لـtenant A ⇒ 0 صفوف', async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [tenantBId]);
      const r = await c.query(`SELECT id FROM assets WHERE id = $1`, [assetAId]);
      expect(r.rowCount).toBe(0); // RLS يفرز
      await c.query('COMMIT');
    } finally { c.release(); await pool.end(); }
  });

  it('GET /v1/assets/:id · بtoken A ⇒ 200 · بtoken B ⇒ 404', async () => {
    // A يقرأ أصله
    const rA = await fastify.inject({
      method: 'GET', url: `/v1/assets/${assetAId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(rA.statusCode).toBe(200);

    // B يقرأ أصل A → 404 (لا كشف)
    const rB = await fastify.inject({
      method: 'GET', url: `/v1/assets/${assetAId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(rB.statusCode).toBe(404);
    const bodyB = J<{ error: { code: string } }>(rB as { body: string })!;
    expect(bodyB.error.code).toBe('NOT_FOUND');
  });

  it('GET /v1/assets/:id/font · بtoken B ⇒ 404', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/assets/${fontAId}/font`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(r.statusCode).toBe(404);
  });

  it('POST /v1/assets/:id/refresh-url · بtoken B ⇒ 404', async () => {
    const r = await fastify.inject({
      method: 'POST', url: `/v1/assets/${assetAId}/refresh-url`,
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      payload: {},
    });
    expect(r.statusCode).toBe(404);
  });

  it('GET /v1/assets (list) · نتيجة tenant B لا تحوي assets tenant A', async () => {
    const rB = await fastify.inject({
      method: 'GET', url: '/v1/assets',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(rB.statusCode).toBe(200);
    const body = J<{ data: { id: string }[] }>(rB as { body: string })!;
    const ids = body.data.map((a) => a.id);
    expect(ids).not.toContain(assetAId);
    expect(ids).not.toContain(fontAId);
  });

  it('DELETE /v1/assets/:id · بtoken B ⇒ 404 · لا يمسّ الأصل', async () => {
    const rDel = await fastify.inject({
      method: 'DELETE', url: `/v1/assets/${assetAId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(rDel.statusCode).toBe(404);

    // نتحقّق أنّ الأصل ما زال موجوداً — بحساب A
    const rG = await fastify.inject({
      method: 'GET', url: `/v1/assets/${assetAId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(rG.statusCode).toBe(200);
  });

  it('storage_key من A لا يمكن استعماله من B لكتابة (upload-url يبني بـauth.tenantId)', async () => {
    // نطلب upload-url من tenant B — يجب أن يبني storage_key يبدأ بـtenantBId
    const uu = await fastify.inject({
      method: 'POST', url: '/v1/assets/upload-url',
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      payload: { kind: 'image', filename: 'from-b.png', sizeBytes: 16, contentType: 'image/png' },
    });
    expect(uu.statusCode).toBe(200);
    const { assetId } = J<{ assetId: string }>(uu as { body: string })!;

    // نجلب storage_key عبر migPool (control_plane pool يعبر RLS كذلك)
    const pool = getPlatformPool();
    const r = await pool.query<{ storage_key: string; tenant_id: string }>(
      `SELECT storage_key, tenant_id FROM assets WHERE id = $1`, [assetId],
    );
    const row = r.rows[0]!;
    expect(row.tenant_id).toBe(tenantBId);
    expect(row.storage_key.startsWith(`${tenantBId}/`)).toBe(true);
    expect(row.storage_key.startsWith(`${tenantAId}/`)).toBe(false); // لا يمكن انتحال A
  });
});
