// 240-EXPORT-LIMITS · L-46 · لكل حدّ: تجاوز → رمز مسمّى · عند الحدّ → ينجح.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());
let tokenA: string;
let tenantAId: string;
let userAId: string;

async function migQuery(tenantId: string | null, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); await pool.end(); }
}

async function makeProject(content: Record<string, unknown>): Promise<string> {
  const bk = await migQuery(tenantAId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'lim-bk', '{}'::jsonb) RETURNING id`,
    [tenantAId]);
  const tpl = await migQuery(tenantAId,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'lim-tpl-${Math.random().toString(36).slice(2, 8)}', $2::jsonb) RETURNING id`,
    [tenantAId, JSON.stringify({ id: 't', name: 'n', kind: 'static', sizes: ['x'], layers: [] })]);
  const prj = await migQuery(tenantAId,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, content, created_by)
     VALUES ($1, $2, $3, 'lim-prj', 'draft', $4::jsonb, $5) RETURNING id`,
    [tenantAId, bk.rows[0].id, tpl.rows[0].id, JSON.stringify(content), userAId]);
  return prj.rows[0].id;
}

async function postRender(projectId: string, size = 'x', format = 'png'): Promise<{ statusCode: number; code?: string; id?: string }> {
  const r = await fastify.inject({
    method: 'POST', url: '/v1/renders',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { project_id: projectId, size, format },
  });
  const body = J<{ id?: string; error?: { code: string } }>(r as { body: string });
  return { statusCode: r.statusCode, code: body?.error?.code, id: body?.id };
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `lim-${suffix}@t.local`, password: 'strong_password_1234!',
      tenantName: `LIM-${suffix}`,
    },
  });
  const ctx = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
  tenantAId = ctx.tenant.id;
  userAId = ctx.user.id;
  tokenA = ctx.session.accessToken;

  // ارفع plan حدّاً كافياً لألا نصدم QUOTA_EXCEEDED_RENDERS قبل rate limit
  const pool = getPlatformPool();
  await pool.query(
    `UPDATE tenants SET plan_overrides='{"concurrent_renders_limit":100,"videos_per_month_limit":1000}'::jsonb WHERE id=$1`,
    [tenantAId]);
});

afterAll(async () => {
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT app_set_tenant($1::uuid)`, [tenantAId]);
    await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
      VALUES ($1, $2, 'hard', '240-test cleanup')`, [tenantAId, `LIM-${suffix}`]);
    await c.query(`DELETE FROM tenants WHERE id=$1`, [tenantAId]);
    await c.query('COMMIT');
  } catch { await c.query('ROLLBACK').catch(() => {}); }
  finally { c.release(); }

  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('240 · حدود التصدير', () => {
  it('HEADLINE_TOO_LONG · 201 حرف ⇒ 422 · الرمز مسمّى', async () => {
    const longHeadline = 'أ'.repeat(201);
    const prj = await makeProject({ headline: longHeadline });
    const r = await postRender(prj);
    expect(r.statusCode).toBe(422);
    expect(r.code).toBe('HEADLINE_TOO_LONG');
  });

  it('HEADLINE عند الحدّ · 200 حرف ⇒ 202 (ينجح)', async () => {
    const atLimitHeadline = 'ب'.repeat(200);
    const prj = await makeProject({ headline: atLimitHeadline });
    const r = await postRender(prj);
    expect(r.statusCode).toBe(202);
    expect(r.id).toBeTruthy();
  });

  it('SOURCE_TOO_LONG · 101 حرف ⇒ 422 · الرمز مسمّى', async () => {
    const longSource = 'ص'.repeat(101);
    const prj = await makeProject({ source: longSource });
    const r = await postRender(prj);
    expect(r.statusCode).toBe(422);
    expect(r.code).toBe('SOURCE_TOO_LONG');
  });

  it('SOURCE عند الحدّ · 100 حرف ⇒ 202', async () => {
    const atLimit = 'ص'.repeat(100);
    const prj = await makeProject({ source: atLimit });
    const r = await postRender(prj);
    expect(r.statusCode).toBe(202);
  });

  it('size خارج القائمة البيضاء ⇒ 400 VALIDATION_FAILED (zod enum)', async () => {
    const prj = await makeProject({ headline: 'ok' });
    const r = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: { project_id: prj, size: 'giant', format: 'png' },
    });
    expect(r.statusCode).toBe(400);
    const b = J<{ error: { code: string } }>(r as { body: string })!;
    expect(b.error.code).toBe('VALIDATION_FAILED');
  });

  it('size من القائمة البيضاء ⇒ 202', async () => {
    const prj = await makeProject({ headline: 'ok' });
    for (const size of ['x', 'instagram', 'feed', 'reel']) {
      const r = await postRender(prj, size, 'png');
      // 202 أو 429 rate limit إن تراكم — نقبل الاثنين (الاختبار السابع يفحص rate)
      expect([202, 429]).toContain(r.statusCode);
    }
  });

  it('EXPORTS_RATE_LIMIT · طلب 21 في دقيقة ⇒ رمز مسمّى', async () => {
    // نُنشئ tenant منفصل لتجنّب تلوّث الاختبار السابع بـmargin
    const suRate = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: {
        email: `lim-rate-${suffix}@t.local`, password: 'strong_password_1234!',
        tenantName: `LIM-RATE-${suffix}`,
      },
    });
    const ctxR = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suRate as { body: string })!;
    const tokR = ctxR.session.accessToken;
    const tidR = ctxR.tenant.id;
    const uidR = ctxR.user.id;

    // ارفع حصّة plan
    await getPlatformPool().query(
      `UPDATE tenants SET plan_overrides='{"concurrent_renders_limit":100,"videos_per_month_limit":1000}'::jsonb WHERE id=$1`,
      [tidR]);

    // مشروع سريع
    const bk = await migQuery(tidR,
      `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'r-bk', '{}'::jsonb) RETURNING id`, [tidR]);
    const tpl = await migQuery(tidR,
      `INSERT INTO templates(scope, tenant_id, kind, name, definition)
       VALUES ('tenant', $1, 'static', 'r-tpl', $2::jsonb) RETURNING id`,
      [tidR, JSON.stringify({ id: 't', name: 'n', kind: 'static', sizes: ['x'], layers: [] })]);
    const prjR = await migQuery(tidR,
      `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, content, created_by)
       VALUES ($1, $2, $3, 'r-prj', 'draft', '{}'::jsonb, $4) RETURNING id`,
      [tidR, bk.rows[0].id, tpl.rows[0].id, uidR]);
    const prjRid = prjR.rows[0].id;

    let lastCode: string | undefined;
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const r = await fastify.inject({
        method: 'POST', url: '/v1/renders',
        headers: { authorization: `Bearer ${tokR}`, 'content-type': 'application/json' },
        payload: { project_id: prjRid, size: 'x', format: 'png' },
      });
      lastStatus = r.statusCode;
      const b = J<{ error?: { code: string } }>(r as { body: string });
      lastCode = b?.error?.code;
      if (r.statusCode === 429) break;
    }
    expect(lastStatus).toBe(429);
    expect(lastCode).toBe('EXPORTS_RATE_LIMIT');

    // نظّف
    const p = getPlatformPool();
    const c = await p.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tidR]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '240-rate cleanup')`, [tidR, `LIM-RATE-${suffix}`]);
      await c.query(`DELETE FROM tenants WHERE id=$1`, [tidR]);
      await c.query('COMMIT');
    } catch { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  }, 30000);
});
