// 280-EMPTY-LAYERS-BURST · الإنشاء يفشل حيث يقع لا بعد سفره.
//
// **الادّعاء المُختبَر**: POST /v1/renders على مشروع يشير إلى قالب بـ
// `layers: []` (فارغ) يُرفَض بـ422 · code=TEMPLATE_SNAPSHOT_INVALID ·
// field='layers'. **لا يُقبَل ثمّ يفشل في العامل**.
//
// **L-46**: قبل الإصلاح كان POST /v1/renders يُرجع 202 (queued) · ثمّ
// العامل يفشل بـTEMPLATE_SNAPSHOT_INVALID. مكافئ صنف «يُبلغ عن نجاحٍ
// ولم يفعل». هذا الاختبار كان يفشل باعتيادي (POST يُقبَل بـ202 بدل 422).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

async function migQuery<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rowCount: number; rows: T[] }> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    const r = await c.query<T>(sql, params);
    return { rowCount: r.rowCount ?? 0, rows: r.rows };
  } finally { c.release(); await pool.end(); }
}

async function migSetTenant<T = unknown>(tenantId: string, sql: string, params: unknown[] = []): Promise<{ rowCount: number; rows: T[] }> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query<T>(sql, params);
    await c.query('COMMIT');
    return { rowCount: r.rowCount ?? 0, rows: r.rows };
  } finally { c.release(); await pool.end(); }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());

let tenantId: string;
let token: string;
let userId: string;
let brandKitId: string;

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `el-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `EL-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const ctx = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
  tenantId = ctx.tenant.id;
  userId = ctx.user.id;
  token = ctx.session.accessToken;

  const bk = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: { name: `bk-el-${suffix}` },
  });
  if (bk.statusCode !== 201) throw new Error(`bk: ${bk.body}`);
  brandKitId = J<{ id: string }>(bk as { body: string })!.id;
});

afterAll(async () => {
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    await c.query(
      `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
       VALUES ($1, $2, 'hard', '280-empty-layers test cleanup')`,
      [tenantId, `EL-${suffix}`],
    );
    await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await c.query('COMMIT');
  } catch { await c.query('ROLLBACK').catch(() => {}); }
  finally { c.release(); }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('280 · POST /v1/renders يرفض قالباً بلقطةٍ غير صالحة', () => {
  it('layers فارغ ⇒ 422 · TEMPLATE_SNAPSHOT_INVALID · field=layers · بلا INSERT إلى renders', async () => {
    // نُدرج قالباً بـlayers فارغ مباشرةً في DB (بتجاوز validation الطبيعيّ
    // — كما تفعل بعض tests · وكما قد يحدث من bulk migrations).
    const tpl = await migSetTenant<{ id: string }>(tenantId,
      `INSERT INTO templates(scope, tenant_id, kind, name, definition)
       VALUES ('tenant', $1, 'static', 'el-tpl-${suffix}', $2::jsonb) RETURNING id`,
      [tenantId, JSON.stringify({ id: 't', name: 'n', kind: 'static', sizes: ['x'], layers: [] })]);
    const tplId = tpl.rows[0]!.id;

    const prj = await migSetTenant<{ id: string }>(tenantId,
      `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, content, created_by)
       VALUES ($1, $2, $3, 'el-prj', 'draft', $4::jsonb, $5) RETURNING id`,
      [tenantId, brandKitId, tplId, JSON.stringify({ headline: 'اختبار' }), userId]);
    const projectId = prj.rows[0]!.id;

    // عدد renders قبل — للتأكّد أنّ الرفض عند القرار لا بعد INSERT
    const beforeR = await migQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM renders WHERE tenant_id = $1`, [tenantId],
    );
    const before = Number(beforeR.rows[0]!.n);

    const r = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { project_id: projectId, size: 'x', format: 'png' },
    });

    expect(r.statusCode).toBe(422);
    const body = J<{ error: { code: string; field: string | null } }>(r as { body: string })!;
    expect(body.error.code).toBe('TEMPLATE_SNAPSHOT_INVALID');
    expect(body.error.field).toBe('layers');

    // لا صفّ جديد في renders — الفشل حيث يقع لا بعد INSERT
    const afterR = await migQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM renders WHERE tenant_id = $1`, [tenantId],
    );
    const after = Number(afterR.rows[0]!.n);
    expect(after, 'INSERT إلى renders حصل رغم رفض القالب').toBe(before);
  });

  it('layers[0] بلا type ⇒ 422 · field يذكر المسار داخل layers', async () => {
    const tpl = await migSetTenant<{ id: string }>(tenantId,
      `INSERT INTO templates(scope, tenant_id, kind, name, definition)
       VALUES ('tenant', $1, 'static', 'el-tpl2-${suffix}', $2::jsonb) RETURNING id`,
      [tenantId, JSON.stringify({ id: 't2', name: 'n2', kind: 'static', sizes: ['x'], layers: [{ fill: '#000' }] })]);
    const tplId = tpl.rows[0]!.id;

    const prj = await migSetTenant<{ id: string }>(tenantId,
      `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, content, created_by)
       VALUES ($1, $2, $3, 'el-prj2', 'draft', $4::jsonb, $5) RETURNING id`,
      [tenantId, brandKitId, tplId, JSON.stringify({ headline: 'اختبار' }), userId]);
    const projectId = prj.rows[0]!.id;

    const r = await fastify.inject({
      method: 'POST', url: '/v1/renders',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { project_id: projectId, size: 'x', format: 'png' },
    });

    expect(r.statusCode).toBe(422);
    const body = J<{ error: { code: string; field: string | null } }>(r as { body: string })!;
    expect(body.error.code).toBe('TEMPLATE_SNAPSHOT_INVALID');
    // field من TemplateValidationError.path — ينبغي أن يحوي «layers»
    expect(body.error.field).toContain('layers');
  });
});
