// 250-TENANT-DATA-EXPORT · isolation + smoke tests
//
// **الادّعاء المُختبَر**:
//   1. GET /v1/tenant/data-export لمستأجر (ب) لا يحمل أيّ id/name/email
//      من مستأجر (أ) — RLS نافذ داخل CURSOR.
//   2. الملفّ NDJSON صالح: كل سطر JSON مستقلّ · أوّل سطر `meta` · آخر `end`.
//   3. أسرارٌ لا تظهر أبداً: password_hash · api_key_encrypted · token_hash.
//   4. Content-Type + Content-Disposition صحيحان.
//   5. 401 بلا Bearer.
//
// **L-46**: عدّل المسار مؤقّتاً إلى getPlatformPool() (يعبر RLS) ⇒
// اختبار العزل يفشل ذاكراً id من A مسرَّب. الاستعادة تُعيده أخضر.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

interface ExportLine { type: string; data?: Record<string, unknown>; counts?: Record<string, number>; tenantId?: string; version?: number; exportedAt?: string; exportedBy?: string; sections?: string[]; code?: string; message?: string; }

function parseNdjson(body: string): ExportLine[] {
  return body.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l) as ExportLine);
}

let fastify: FastifyInstance;
const suffix = String(Date.now());

let tenantAId: string;
let tenantBId: string;
let tokenA: string;
let tokenB: string;
let brandKitAId: string;
let projectAId: string;

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  // مستأجر A بمحتوى (brand_kit + project + asset)
  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `dx-a-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `DX-A-${suffix}`,
    },
  });
  if (suA.statusCode !== 201) throw new Error(`signup A: ${suA.body}`);
  const ctxA = J<{ tenant: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  tokenA = ctxA.session.accessToken;

  // brand_kit لـA (name وحده · باقي config يُملأ من DEFAULT_BRAND)
  const bkA = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: { name: `bk-a-${suffix}` },
  });
  if (bkA.statusCode !== 201) throw new Error(`bk A: ${bkA.body}`);
  brandKitAId = J<{ id: string }>(bkA as { body: string })!.id;

  // مشروع لـA (يحتاج template — نستعمل الأوّل من list)
  const tplList = await fastify.inject({
    method: 'GET', url: '/v1/templates',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const tpls = J<{ data: Array<{ id: string }> }>(tplList as { body: string })!;
  const tplId = tpls.data[0]!.id;

  const projA = await fastify.inject({
    method: 'POST', url: '/v1/projects',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    payload: {
      title: `proj-a-${suffix}`,
      brand_kit_id: brandKitAId,
      template_id: tplId,
      locale: 'ar',
      content: { headline: 'محتوى مستأجر أ', tokens: [] },
    },
  });
  if (projA.statusCode !== 201) throw new Error(`proj A: ${projA.body}`);
  projectAId = J<{ id: string }>(projA as { body: string })!.id;

  // مستأجر B (بلا محتوى إضافيّ — signup يخلق tenant + user واحد)
  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `dx-b-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `DX-B-${suffix}`,
    },
  });
  if (suB.statusCode !== 201) throw new Error(`signup B: ${suB.body}`);
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;
});

afterAll(async () => {
  // تنظيف على نمط asset-isolation.test.ts
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `DX-A-${suffix}`], [tenantBId, `DX-B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(
        `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
         VALUES ($1, $2, 'hard', 'data-export test cleanup')`,
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

describe('GET /v1/tenant/data-export', () => {
  it('401 بلا Bearer', async () => {
    const r = await fastify.inject({ method: 'GET', url: '/v1/tenant/data-export' });
    expect(r.statusCode).toBe(401);
  });

  it('Content-Type = application/x-ndjson · Content-Disposition = attachment', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/tenant/data-export',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/x-ndjson');
    expect(String(r.headers['content-disposition'] ?? '')).toMatch(/^attachment; filename=".+\.ndjson"$/);
    expect(r.headers['x-mk-export-version']).toBe('1');
  });

  it('meta أوّل سطر · end آخر سطر · counts معلَنة', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/tenant/data-export',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const lines = parseNdjson(r.body);
    expect(lines[0]!.type).toBe('meta');
    expect(lines[0]!.tenantId).toBe(tenantAId);
    expect(lines[0]!.version).toBe(1);
    expect(Array.isArray(lines[0]!.sections)).toBe(true);
    expect(lines[lines.length - 1]!.type).toBe('end');
    expect(typeof lines[lines.length - 1]!.counts).toBe('object');
  });

  it('محتوى A: tenant=1 · user≥1 · brand_kit≥1 · project≥1', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/tenant/data-export',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const lines = parseNdjson(r.body);
    const counts = (lines[lines.length - 1]!.counts) ?? {};
    expect(counts.tenant).toBe(1);
    expect(counts.user).toBeGreaterThanOrEqual(1);
    expect(counts.brand_kit).toBeGreaterThanOrEqual(1);
    expect(counts.project).toBeGreaterThanOrEqual(1);

    // brand_kit_id ذاته يظهر
    const bkLine = lines.find((l) => l.type === 'brand_kit' && (l.data as { id?: string } | undefined)?.id === brandKitAId);
    expect(bkLine).toBeDefined();

    // project ذاته يظهر
    const prjLine = lines.find((l) => l.type === 'project' && (l.data as { id?: string } | undefined)?.id === projectAId);
    expect(prjLine).toBeDefined();
  });

  it('أسرار مُستَبعَدة: password_hash · api_key_encrypted · api_key_ref · token_hash', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/tenant/data-export',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    // فحص خام على النصّ · لا يمكن ظهور هذه المفاتيح بأيّ شكل
    expect(r.body).not.toContain('password_hash');
    expect(r.body).not.toContain('api_key_encrypted');
    expect(r.body).not.toContain('api_key_ref');
    expect(r.body).not.toContain('token_hash');
  });

  it('عزل: export لمستأجر B لا يحوي أيّ id/name/email من A', async () => {
    const rB = await fastify.inject({
      method: 'GET', url: '/v1/tenant/data-export',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(rB.statusCode).toBe(200);
    const body = rB.body;

    // فحص خام على bytes: أيّ سلسلة من A يجب أن تكون غائبة
    const leaks = [
      { label: `tenantAId`, needle: tenantAId },
      { label: `brandKitAId`, needle: brandKitAId },
      { label: `projectAId`, needle: projectAId },
      { label: `email A`, needle: `dx-a-${suffix}@t.local` },
      { label: `tenantName A`, needle: `DX-A-${suffix}` },
    ];
    for (const { label, needle } of leaks) {
      expect(body, `تسرّب ${label} (${needle}) في export لـtenant B`).not.toContain(needle);
    }

    // meta.tenantId يجب أن يكون B
    const lines = parseNdjson(body);
    expect(lines[0]!.tenantId).toBe(tenantBId);
  });

  it('عزل RLS مباشر: control-plane pool يرى A · req.dbClient (RLS) يرى B فقط', async () => {
    // نتحقّق أنّ الفارق حقيقيّ · لا نعتمد فقط على absence
    const platformPool = getPlatformPool();
    const rAll = await platformPool.query<{ n: string }>(
      `SELECT count(*)::bigint AS n FROM brand_kits WHERE tenant_id IN ($1, $2)`,
      [tenantAId, tenantBId],
    );
    expect(Number(rAll.rows[0]!.n)).toBeGreaterThanOrEqual(1); // A أنشأ واحداً

    // نفس السؤال عبر req.dbClient لـtenant B (بـtoken B)
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [tenantBId]);
      const rB = await c.query<{ id: string }>(`SELECT id FROM brand_kits`);
      const bkIdsForB = rB.rows.map((r) => r.id);
      expect(bkIdsForB).not.toContain(brandKitAId);
      await c.query('COMMIT');
    } finally { c.release(); await pool.end(); }
  });
});
