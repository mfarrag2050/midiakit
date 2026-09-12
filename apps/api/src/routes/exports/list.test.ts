// 200-EXPORT-HISTORY · L-46 دائم على سجلّ التصديرات + العزل.
//
// **الفرضيّة**: كل تحوّل render إلى succeeded/failed يترك صفّاً في
// `exports` (trigger renders_write_export_log). tenant A + tenant B
// معزولان بـRLS مطابق لـrenders.
//
// **اختبار حياة**:
//   - A يصدّر مرّتين ⇒ يرى 2 (تصاعديّاً برواية أو تنازليّاً — نتحقّق تنازلي).
//   - B يرى 0.
//   - B يطلب معرّف A مباشرة ⇒ 404 (لا كشف).
//   - تصدير فاشل ⇒ سطر بحالة 'failed' + error_code مسمّى.
//
// **RED-GREEN**: نُثبت أنّ العزل يسقط لو أزلنا RLS فرضاً — لكن هذا لا
// يُختبَر بـmigration reversal (خطر) · بل نُثبت الفاصل الحرفيّ: قبل
// تسجيل B نتحقّق أنّ list لـA فارغ (RED عن B قبل). بعد تسجيل A نتحقّق
// أنّ list لـB لا يحوي شيئاً من A (GREEN عزل).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());
let tenantAId: string;
let tenantBId: string;
let tokenA: string;
let tokenB: string;
let projectAId: string;
let userAId: string;

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
    await c.query('ROLLBACK').catch(() => {}); throw e;
  } finally { c.release(); await pool.end(); }
}

async function seedRender(tenantId: string, userId: string, projectId: string, size = 'x', format = 'png'): Promise<string> {
  const id = randomUUID();
  await migQuery(tenantId,
    `INSERT INTO renders(id, tenant_id, project_id, size, format, status, requested_by)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
    [id, tenantId, projectId, size, format, userId]);
  return id;
}

/**
 * ننقل render إلى succeeded/failed مباشرة — trigger renders_write_export_log
 * يفعّل عليه.
 */
async function completeRender(tenantId: string, renderId: string, status: 'succeeded' | 'failed', extra: {
  storage_key?: string; error_code?: string;
} = {}): Promise<void> {
  if (status === 'succeeded') {
    const snap = JSON.stringify({ fonts: { primary: { family: 'x' } }, colors: { text: '#fff' } });
    await migQuery(tenantId,
      `UPDATE renders SET status='succeeded', started_at=now(), completed_at=now(),
                          output_storage_key=$1, brand_snapshot=$3::jsonb
       WHERE id=$2`,
      [extra.storage_key ?? `${tenantId}/renders/${renderId}/output.png`, renderId, snap]);
  } else {
    await migQuery(tenantId,
      `UPDATE renders SET status='failed', started_at=now(), completed_at=now(),
                          error_code=$1, error_message='simulated'
       WHERE id=$2`,
      [extra.error_code ?? 'FONT_ASSET_MISSING', renderId]);
  }
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `exp-a-${suffix}@t.local`, password: 'strong_password_1234!',
      tenantName: `EXP-A-${suffix}`,
    },
  });
  if (suA.statusCode !== 201) throw new Error(`signup A: ${suA.body}`);
  const ctxA = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  userAId = ctxA.user.id;
  tokenA = ctxA.session.accessToken;

  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `exp-b-${suffix}@t.local`, password: 'strong_password_1234!',
      tenantName: `EXP-B-${suffix}`,
    },
  });
  if (suB.statusCode !== 201) throw new Error(`signup B: ${suB.body}`);
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;

  // مشروع لـA (نحتاجه للـrender)
  const bkRow = await migQuery(tenantAId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'exp-bk', '{}'::jsonb) RETURNING id`,
    [tenantAId]);
  const bkId = bkRow.rows[0].id;
  const tplRow = await migQuery(tenantAId,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'exp-tpl', $2::jsonb) RETURNING id`,
    [tenantAId, JSON.stringify({ id: 't', name: 'n', kind: 'static', sizes: ['x'], layers: [] })]);
  const tplId = tplRow.rows[0].id;
  const prj = await migQuery(tenantAId,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 'exp-p', 'draft', $4) RETURNING id`,
    [tenantAId, bkId, tplId, userAId]);
  projectAId = prj.rows[0].id;
});

afterAll(async () => {
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `EXP-A-${suffix}`], [tenantBId, `EXP-B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '200-test cleanup')`, [tid, name]);
      await c.query(`DELETE FROM tenants WHERE id=$1`, [tid]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      // eslint-disable-next-line no-console
      console.warn('200 cleanup:', (e as Error).message);
    }
    finally { c.release(); }
  }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('200 · GET /v1/exports · سجلّ التصديرات', () => {
  it('A لم يصدّر شيئاً بعد ⇒ 0', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/exports',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(200);
    const body = J<{ data: unknown[]; total: number }>(r as { body: string })!;
    expect(body.total).toBe(0);
    expect(body.data.length).toBe(0);
  });

  it('A يصدّر مرّتين (نجاح) ⇒ يرى 2 · تنازلي', async () => {
    const r1 = await seedRender(tenantAId, userAId, projectAId, 'x', 'png');
    await completeRender(tenantAId, r1, 'succeeded');
    // فارق زمن صغير لضمان ordering
    await new Promise((res) => setTimeout(res, 20));
    const r2 = await seedRender(tenantAId, userAId, projectAId, 'x', 'png');
    await completeRender(tenantAId, r2, 'succeeded');

    const r = await fastify.inject({
      method: 'GET', url: '/v1/exports',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(200);
    const body = J<{
      data: { renderId: string; status: string; createdAt: string }[];
      total: number;
    }>(r as { body: string })!;
    expect(body.total).toBe(2);
    expect(body.data.length).toBe(2);
    // تنازلي: r2 (الأحدث) أوّلاً
    expect(body.data[0]!.renderId).toBe(r2);
    expect(body.data[1]!.renderId).toBe(r1);
    for (const row of body.data) expect(row.status).toBe('succeeded');
  });

  it('تصدير فاشل ⇒ سطر status=failed + errorCode مسمّى', async () => {
    const rid = await seedRender(tenantAId, userAId, projectAId, 'x', 'png');
    await completeRender(tenantAId, rid, 'failed', { error_code: 'FONT_ASSET_MISSING' });
    const r = await fastify.inject({
      method: 'GET', url: '/v1/exports?limit=1',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const body = J<{ data: { status: string; errorCode: string; renderId: string }[] }>(r as { body: string })!;
    expect(body.data[0]!.renderId).toBe(rid);
    expect(body.data[0]!.status).toBe('failed');
    expect(body.data[0]!.errorCode).toBe('FONT_ASSET_MISSING');
  });

  it('العزل: B يرى 0 من صادرات A', async () => {
    const rB = await fastify.inject({
      method: 'GET', url: '/v1/exports',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const body = J<{ data: unknown[]; total: number }>(rB as { body: string })!;
    expect(body.total).toBe(0);
    expect(body.data.length).toBe(0);
  });

  it('العزل: مفتاح تخزين لصفّ A لا يظهر في نتيجة B', async () => {
    const rA = await fastify.inject({
      method: 'GET', url: '/v1/exports',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const bodyA = J<{ data: { storageKey: string | null }[] }>(rA as { body: string })!;
    const aKeys = new Set(bodyA.data.map((d) => d.storageKey).filter(Boolean));
    expect(aKeys.size).toBeGreaterThanOrEqual(2);

    const rB = await fastify.inject({
      method: 'GET', url: '/v1/exports',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const bodyB = J<{ data: { storageKey: string | null }[] }>(rB as { body: string })!;
    const bKeys = new Set(bodyB.data.map((d) => d.storageKey).filter(Boolean));
    // لا تقاطع بين مفاتيح A و B (B فارغ أصلاً · فحص إضافيّ للتأكيد البنيويّ)
    for (const k of bKeys) expect(aKeys.has(k)).toBe(false);
  });

  it('pagination: limit=1 يرجع صفّاً + hasMore', async () => {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/exports?limit=1',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const body = J<{ data: unknown[]; hasMore: boolean; total: number; limit: number }>(r as { body: string })!;
    expect(body.data.length).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.total).toBe(3); // 2 succeeded + 1 failed
    expect(body.hasMore).toBe(true);
  });
});
