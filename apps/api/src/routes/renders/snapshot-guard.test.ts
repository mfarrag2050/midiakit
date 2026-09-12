// 160-SNAPSHOT-REPAIR · L-46 دائم على snapshot guard
//
// trigger `renders_snapshot_guard` (migration 20260912010000) يرفض INSERT/UPDATE
// حين status='succeeded' وbrand_snapshot ينقصه fonts أو colors. error-handler
// في apps/api يترجم SQLSTATE='54K01' إلى 422 RENDER_SNAPSHOT_INCOMPLETE.
//
// **RED path** (بلا الـtrigger · لو حُذف): INSERT بـstatus='succeeded' +
//   brand_snapshot='{}' يمرّ · 143 عاد.
// **GREEN path** (الحاليّ): 422 RENDER_SNAPSHOT_INCOMPLETE.
//
// نختبر مباشرة على DB (لا نمرّ بـendpoint لأنّ POST /renders يكتب queued
// لا succeeded; الـsuccess يأتي من worker UPDATE — نُحاكي عبر SQL).
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
let tenantId: string;
let projectId: string;
let brandKitId: string;
const suffix = String(Date.now());

async function withGuc<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await fn(c);
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
      email: `t160-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `T160-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const ctx = J<{ tenant: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
  tenantId = ctx.tenant.id;

  const bk = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { authorization: `Bearer ${ctx.session.accessToken}`, 'content-type': 'application/json' },
    payload: { name: 't160-bk' },
  });
  if (bk.statusCode !== 201) throw new Error(`bk: ${bk.body}`);
  brandKitId = J<{ id: string }>(bk as { body: string })!.id;

  // project لتربطه بـrender
  projectId = randomUUID();
  await withGuc(async (c) => {
    const tpl = await c.query<{ id: string }>(`SELECT id FROM templates WHERE scope='global' LIMIT 1`);
    await c.query(
      `INSERT INTO projects(id, tenant_id, brand_kit_id, template_id, name, state, content)
       VALUES ($1, $2, $3, $4, 't160-p', 'draft', '{}'::jsonb)`,
      [projectId, tenantId, brandKitId, tpl.rows[0]!.id],
    );
  });
});

afterAll(async () => {
  // نظّف عبر control_plane_user (له policy _control_plane_all + DELETE grant من 151)
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT app_set_tenant($1::uuid)`, [tenantId]);
    await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
      VALUES ($1, $2, 'hard', '160-test cleanup')`, [tenantId, `T160-${suffix}`]);
    await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    // eslint-disable-next-line no-console
    console.warn('cleanup failed:', (e as Error).message);
  } finally {
    c.release();
  }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('160 · snapshot guard على renders', () => {
  it('RED: INSERT renders بـsucceeded + snapshot فارغ ⇒ SQLSTATE 54K01', async () => {
    let caught: unknown = null;
    try {
      await withGuc(async (c) => {
        await c.query(
          `INSERT INTO renders(id, tenant_id, project_id, size, format, status, brand_snapshot)
           VALUES ($1, $2, $3, 'feed', 'mp4', 'succeeded', '{}'::jsonb)`,
          [randomUUID(), tenantId, projectId],
        );
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect((caught as { code?: string }).code).toBe('54K01');
    expect(String((caught as Error).message)).toContain('RENDER_SNAPSHOT_INCOMPLETE');
  });

  it('RED: UPDATE renders إلى succeeded بـsnapshot ناقص ⇒ 54K01', async () => {
    const rid = randomUUID();
    await withGuc(async (c) => {
      await c.query(
        `INSERT INTO renders(id, tenant_id, project_id, size, format, status)
         VALUES ($1, $2, $3, 'feed', 'mp4', 'queued')`,
        [rid, tenantId, projectId],
      );
    });
    let caught: unknown = null;
    try {
      await withGuc(async (c) => {
        await c.query(`UPDATE renders SET status='succeeded' WHERE id = $1`, [rid]);
      });
    } catch (e) { caught = e; }
    expect((caught as { code?: string })?.code).toBe('54K01');
  });

  it('GREEN: INSERT بـsucceeded + snapshot يحمل fonts+colors ⇒ ينجح', async () => {
    const rid = randomUUID();
    await withGuc(async (c) => {
      await c.query(
        `INSERT INTO renders(id, tenant_id, project_id, size, format, status, brand_snapshot)
         VALUES ($1, $2, $3, 'feed', 'mp4', 'succeeded', $4::jsonb)`,
        [rid, tenantId, projectId, JSON.stringify({ fonts: { primary: {} }, colors: { text: '#fff' } })],
      );
    });
    // نُثبت بالقراءة أنّ الصفّ موجود
    const r = await withGuc(async (c) => c.query(`SELECT status FROM renders WHERE id = $1`, [rid]));
    expect(r.rows[0]?.status).toBe('succeeded');
  });

  it('GREEN: status غير succeeded يمرّ بلا فحص (queued/failed/invalid)', async () => {
    for (const status of ['queued', 'failed', 'invalid']) {
      const rid = randomUUID();
      await withGuc(async (c) => {
        await c.query(
          `INSERT INTO renders(id, tenant_id, project_id, size, format, status, brand_snapshot)
           VALUES ($1, $2, $3, 'feed', 'mp4', $4, '{}'::jsonb)`,
          [rid, tenantId, projectId, status],
        );
      });
    }
  });
});
