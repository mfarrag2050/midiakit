// 180-EXPORT-FLOW · L-46 دائم على تدفّق التصدير الكامل
//
// **العطب الذي نُثبت أنّه مُغلَق**: mkst تحتاج زرّ «تصدير» يأخذ بطاقة
// وينتج ملفاً. الـpipeline موجود: POST /v1/renders → BullMQ → worker →
// MinIO → GET /output. هذا الاختبار يُثبت التدفّق end-to-end + الحالات
// المسمّاة عند الفشل.
//
// **لا endpoint ثانٍ** (شرط 180): نستعمل POST /v1/renders الموجود ·
// نُشغّل worker inline كما في verify-renders.mjs Layer 7 · محرّك واحد.
//
// **الحالات المُختبَرة**:
//   GREEN: POST → worker inline → succeeded → GET output → fetch → PNG bytes
//   RED (request-time): brand يحمل URL خارجيّ ⇒ 400 UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS
//   RED (worker-time): worker يرمي ⇒ status='failed' + error_code · لا output URL
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues, getRedis } from '../../queues/index.js';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());
let token: string;
let tenantId: string;
let userId: string;
let projectId: string;
let projectIdExt: string; // مشروع بـbrand-kit فيه URL خارجيّ (لـUNSUPPORTED)

async function migQuery(tenantId: string, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
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

  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `t180-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `T180-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const ctx = J<{
    tenant: { id: string }; user: { id: string }; session: { accessToken: string };
  }>(su as { body: string })!;
  tenantId = ctx.tenant.id;
  userId = ctx.user.id;
  token = ctx.session.accessToken;

  // بذر: brand_kit clean + brand_kit مع URL خارجيّ + template + مشروعان
  const bkClean = (await migQuery(tenantId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 't180-bk', '{"fonts":{"primary":{"family":"IBM Plex Sans Arabic","source":"builtin"}}}'::jsonb) RETURNING id`,
    [tenantId])).rows[0].id;
  const bkExt = (await migQuery(tenantId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 't180-bk-ext', '{"logo":{"url":"https://evil.com/logo.png"}}'::jsonb) RETURNING id`,
    [tenantId])).rows[0].id;
  const tpl = (await migQuery(tenantId,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 't180-tpl', $2::jsonb) RETURNING id`,
    [tenantId, JSON.stringify({
      id: 't', name: 'n', kind: 'static', sizes: ['x'],
      layers: [{ type: 'solid', fill: '#000000' }],
    })])).rows[0].id;
  projectId = (await migQuery(tenantId,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 't180-p', 'draft', $4) RETURNING id`,
    [tenantId, bkClean, tpl, userId])).rows[0].id;
  projectIdExt = (await migQuery(tenantId,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 't180-p-ext', 'draft', $4) RETURNING id`,
    [tenantId, bkExt, tpl, userId])).rows[0].id;

  // A21 — trial قد يحدّ concurrent_renders. نرفع الحدّ لمشروع الاختبار.
  const platformPool = getPlatformPool();
  await platformPool.query(
    `UPDATE tenants SET plan_overrides = '{"concurrent_renders_limit":10,"videos_per_month_limit":100}'::jsonb WHERE id = $1`,
    [tenantId],
  );
});

afterAll(async () => {
  // نظّف عبر hard-delete (تعلَّمنا في 151)
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT app_set_tenant($1::uuid)`, [tenantId]);
    await c.query(
      `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
       VALUES ($1, $2, 'hard', '180-test cleanup')`,
      [tenantId, `T180-${suffix}`],
    );
    await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    // eslint-disable-next-line no-console
    console.warn('180 cleanup failed:', (e as Error).message);
  } finally { c.release(); }

  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('180 · تدفّق التصدير · POST /v1/renders → worker → GET output', () => {
  it('GREEN: POST → worker inline → succeeded → output URL → fetch bytes', async () => {
    // (1) POST — يعيد 202 queued
    const rC = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { project_id: projectId, size: 'x', format: 'png' },
    });
    expect(rC.statusCode).toBe(202);
    const created = J<{ id: string; status: string }>(rC as { body: string })!;
    expect(created.status).toBe('queued');
    const rid = created.id;

    // (2) worker inline يعالج job واحداً — يرفع bytes + UPDATE succeeded
    const uploadedKey = `${tenantId}/renders/${rid}/output.png`;
    await new Promise<void>((resolve, reject) => {
      const worker = new Worker('render-normal', async (job: { data: { tenantId: string; renderId: string } }) => {
        const pngBytes = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
        ]);
        await getStorage().putObjectRaw(uploadedKey, pngBytes, 'image/png');
        // brand_snapshot كامل — trigger 160 لا يرفض
        const snapshot = JSON.stringify({
          fonts: { primary: { family: 'IBM Plex Sans Arabic' } },
          colors: { text: '#fff' },
        });
        await migQuery(job.data.tenantId,
          `UPDATE renders SET status='succeeded', started_at=now(), completed_at=now(),
                              output_storage_key=$1, duration_ms=100,
                              brand_snapshot=$3::jsonb
           WHERE id=$2`,
          [uploadedKey, job.data.renderId, snapshot],
        );
        return { ok: true };
      }, {
        connection: getRedis(),
        prefix: config.BULLMQ_PREFIX,
        concurrency: 1,
      });
      worker.on('completed', async () => { await worker.close(); resolve(); });
      worker.on('failed', async (_j, err) => { await worker.close(); reject(err); });
      setTimeout(async () => { await worker.close(); reject(new Error('worker timeout')); }, 10000);
    });

    // (3) GET /output → 200 + URL
    const rO = await fastify.inject({
      method: 'GET', url: `/v1/renders/${rid}/output`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rO.statusCode).toBe(200);
    const outBody = J<{ url: string; expiresAt: string }>(rO as { body: string })!;
    expect(outBody.url).toMatch(/^(mem|http):/);

    // (4) fetch على URL — يعيد PNG bytes
    const dl = await fetch(outBody.url);
    expect(dl.status).toBe(200);
    const buf = Buffer.from(await dl.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  }, 20000);

  it('RED · request-time: brand يحمل URL خارجيّ ⇒ 400 UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS', async () => {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { project_id: projectIdExt, size: 'x', format: 'png' },
    });
    expect(r.statusCode).toBe(400);
    const body = J<{ error: { code: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS');
  });

  it('RED · worker-time: render يفشل ⇒ status=failed + error_code · لا output URL', async () => {
    const rC = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { project_id: projectId, size: 'x', format: 'png' },
    });
    expect(rC.statusCode).toBe(202);
    const rid = J<{ id: string }>(rC as { body: string })!.id;

    // worker يمثِّل فشلاً — UPDATE مباشر (لا snapshot ناقص · نستعمل status=failed
    // مع error_code مسمّى · trigger 160 لا يرفض لأنّ status != succeeded)
    await new Promise<void>((resolve, reject) => {
      const worker = new Worker('render-normal', async (job: { data: { tenantId: string; renderId: string } }) => {
        await migQuery(job.data.tenantId,
          `UPDATE renders SET status='failed', started_at=now(), completed_at=now(),
                              error_code='FONT_ASSET_MISSING', error_message='simulated worker failure'
           WHERE id=$1`,
          [job.data.renderId],
        );
        return { ok: false };
      }, {
        connection: getRedis(),
        prefix: config.BULLMQ_PREFIX,
        concurrency: 1,
      });
      worker.on('completed', async () => { await worker.close(); resolve(); });
      worker.on('failed', async (_j, err) => { await worker.close(); reject(err); });
      setTimeout(async () => { await worker.close(); reject(new Error('worker timeout')); }, 10000);
    });

    // GET /:id — يجب أن يعيد status=failed + error_code
    const rG = await fastify.inject({
      method: 'GET', url: `/v1/renders/${rid}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rG.statusCode).toBe(200);
    const g = J<{ status: string; error?: { code: string; message: string | null } }>(rG as { body: string })!;
    expect(g.status).toBe('failed');
    expect(g.error?.code).toBe('FONT_ASSET_MISSING');

    // GET /output — لا URL (OUTPUT_NOT_READY لأنّ status != succeeded)
    const rO = await fastify.inject({
      method: 'GET', url: `/v1/renders/${rid}/output`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(rO.statusCode).toBe(404);
    const oB = J<{ error: { code: string } }>(rO as { body: string })!;
    expect(oB.error.code).toBe('OUTPUT_NOT_READY');
  }, 20000);
});
