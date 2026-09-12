// 151-TENANT-DELETE-BUILD · L-46 دائم على hard-delete
//
// **العطب المُغلَق**: `tenants_log_revision` كان يُفشل حذف tenant لأنّ
// trigger يحاول INSERT في `revisions` بـtenant_id محذوف · FK يرمي.
// **الحلّ**: migration 20260912000000 أضاف `tenant_deletion_log` وعدّل
// log_revision ليقفز عن DELETE tenants. Endpoint hard-delete يسجّل الحذف
// صريحاً + يمسح التخزين + يحذف tenant (CASCADE يمسح الأبناء).
//
// **شرط 151 الحاسم**: كل جدول → 0 صفوف · و`tenant_deletion_log` يبقى.
// «الحذف الذي يمحو أثره ليس حذفاً بل تستّر».
//
// **مستأجر test من صنعنا** (شرط 151 §2): اسم يحمل `T151-` + timestamp.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hash as argonHash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildServer } from '../../../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../../../db.js';
import { closeQueues } from '../../../queues/index.js';
import { getStorage } from '../../../storage/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
let tenantId: string;
let tenantName: string;
let userId: string;
let assetKey: string;
let renderKey: string;
let platformUserId: string;
let platformToken: string;
const testStartTs = Date.now();
const suffix = String(testStartTs);

// نمرّر عبر migration_user (يعبر RLS عبر migration_user_all policy)
async function migPool(): Promise<pg.PoolClient> {
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return await p.connect();
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  // (1) أنشئ platform_user (owner) — نستعمله في hard-delete
  const platformPool = getPlatformPool();
  const puId = randomUUID();
  const passwordHash = await argonHash('platform_test_pass_1234!');
  await platformPool.query(
    `INSERT INTO platform_users(id, email, password_hash, platform_role, is_active)
     VALUES ($1, $2, $3, 'owner', true)`,
    [puId, `pu-t151-${suffix}@t.local`, passwordHash],
  );
  platformUserId = puId;

  // (2) login → token
  const login = await fastify.inject({
    method: 'POST', url: '/v1/platform/auth/login',
    payload: { email: `pu-t151-${suffix}@t.local`, password: 'platform_test_pass_1234!' },
  });
  if (login.statusCode !== 200) throw new Error(`platform login: ${login.body}`);
  const loginBody = J<{ session: { accessToken: string } }>(login as { body: string })!;
  platformToken = loginBody.session.accessToken;

  // (3) أنشئ tenant اختباريّ عبر signup (نفس مسار الإنتاج)
  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `t151-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `T151-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const suBody = J<{
    tenant: { id: string; name: string };
    user: { id: string };
    session: { accessToken: string };
  }>(su as { body: string })!;
  tenantId = suBody.tenant.id;
  tenantName = suBody.tenant.name;
  userId = suBody.user.id;

  const t = suBody.session.accessToken;
  const H = { authorization: `Bearer ${t}` };

  // (4) brand-kit
  const bkRes = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: { ...H, 'content-type': 'application/json' },
    payload: { name: 't151-bk' },
  });
  if (bkRes.statusCode !== 201) throw new Error(`bk: ${bkRes.body}`);

  // (5) asset — عبر presigned URL + putObjectRaw مباشر (يحاكي رفع العميل)
  const uu = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: { ...H, 'content-type': 'application/json' },
    payload: {
      kind: 'image',
      filename: 't151.png',
      sizeBytes: 100,
      contentType: 'image/png',
    },
  });
  if (uu.statusCode !== 200) throw new Error(`upload-url: ${uu.body}`);
  const uuBody = J<{ assetId: string }>(uu as { body: string })!;

  const mc = await migPool();
  await mc.query('BEGIN');
  await mc.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
  const skRow = await mc.query<{ storage_key: string }>(
    `SELECT storage_key FROM assets WHERE id = $1`, [uuBody.assetId],
  );
  assetKey = skRow.rows[0]!.storage_key;
  await mc.query('COMMIT');
  mc.release();

  await getStorage().putObjectRaw(assetKey, Buffer.alloc(100, 0xff), 'image/png');

  // (6) render — INSERT مباشر (نُحاكي فيديو ناجح · fixture)
  const mc2 = await migPool();
  await mc2.query('BEGIN');
  await mc2.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
  // نحتاج project أوّلاً
  const bkRow = await mc2.query<{ id: string; template_id: string | null }>(
    `SELECT bk.id, (SELECT id FROM templates WHERE scope='global' LIMIT 1) AS template_id
     FROM brand_kits bk WHERE bk.tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  const bkId = bkRow.rows[0]!.id;
  const tplId = bkRow.rows[0]!.template_id!;
  const prjRow = await mc2.query<{ id: string }>(
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, created_by, state, content, name)
     VALUES ($1, $2, $3, $4, 'draft', '{}'::jsonb, 't151-proj') RETURNING id`,
    [tenantId, bkId, tplId, userId],
  );
  const prjId = prjRow.rows[0]!.id;
  renderKey = `${tenantId}/renders/t151-render/output.mp4`;
  await mc2.query(
    `INSERT INTO renders(tenant_id, project_id, size, format, status,
                         output_storage_key, brand_snapshot, template_snapshot, requested_by)
     VALUES ($1, $2, 'feed', 'mp4', 'succeeded', $3, '{}'::jsonb, '{}'::jsonb, $4)`,
    [tenantId, prjId, renderKey, userId],
  );
  await mc2.query('COMMIT');
  mc2.release();

  await getStorage().putObjectRaw(renderKey, Buffer.alloc(200, 0xaa), 'video/mp4');
});

afterAll(async () => {
  // نظّف platform_user (لا يمرّ بـtrigger revisions لأنّه في platform pool)
  const platformPool = getPlatformPool();
  await platformPool.query(`DELETE FROM platform_users WHERE id = $1`, [platformUserId]);
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

// helpers: نُعدّ عبر control_plane pool (policy _control_plane_all يعطيه رؤية أفقيّة)
async function countRows(tbl: string, id: string): Promise<number> {
  const col = tbl === 'tenants' ? 'id' : 'tenant_id';
  const r = await getPlatformPool().query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${tbl} WHERE ${col} = $1`, [id],
  );
  return Number(r.rows[0]!.n);
}

describe('151 · POST /v1/platform/tenants/:id/hard-delete', () => {
  it('BEFORE: كل الجداول تحمل صفوفاً للمستأجر', async () => {
    const rows: Record<string, number> = {};
    for (const tbl of ['tenants', 'users', 'brand_kits', 'projects', 'assets', 'renders']) {
      rows[tbl] = await countRows(tbl, tenantId);
    }
    expect(rows.tenants).toBe(1);
    expect(rows.users).toBeGreaterThanOrEqual(1);
    expect(rows.brand_kits).toBeGreaterThanOrEqual(1);
    expect(rows.projects).toBeGreaterThanOrEqual(1);
    expect(rows.assets).toBeGreaterThanOrEqual(1);
    expect(rows.renders).toBeGreaterThanOrEqual(1);
  });

  it('hard-delete: 200 · مخرَج يحمل عدّاد التخزين', async () => {
    const r = await fastify.inject({
      method: 'POST', url: `/v1/platform/tenants/${tenantId}/hard-delete`,
      headers: {
        authorization: `Bearer ${platformToken}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ reason: 'L-46 test · 151-TENANT-DELETE-BUILD' }),
    });
    expect(r.statusCode).toBe(200);
    const body = J<{
      tenantId: string; tenantName: string;
      storageKeys: number; storagePurged: number; storageErrors: number;
    }>(r as { body: string })!;
    expect(body.tenantId).toBe(tenantId);
    expect(body.tenantName).toBe(tenantName);
    expect(body.storageKeys).toBeGreaterThanOrEqual(2); // asset + render
    expect(body.storagePurged).toBe(body.storageKeys);
    expect(body.storageErrors).toBe(0);
  });

  it('AFTER: كل جدول tenant-scoped = 0 صفوف للمستأجر', async () => {
    const rows: Record<string, number> = {};
    for (const tbl of [
      'tenants', 'users', 'sessions', 'brand_kits', 'templates',
      'assets', 'workflows', 'projects', 'project_state', 'transitions',
      'annotations', 'renders', 'revisions', 'ai_integrations',
      'subscriptions', 'usage', 'password_reset_tokens', 'invitations',
      'checkout_sessions', 'license_acks',
    ]) {
      rows[tbl] = await countRows(tbl, tenantId);
    }
    for (const [tbl, n] of Object.entries(rows)) {
      expect(n, `جدول ${tbl} يجب أن يكون 0 · وجد ${n}`).toBe(0);
    }
  });

  it('AUDIT بقي: tenant_deletion_log يحمل صفّاً واحداً بالاسم + الوقت', async () => {
    const pool = getPlatformPool();
    const r = await pool.query<{
      tenant_id: string; tenant_name: string; deleted_by: string;
      deletion_type: string; reason: string | null; deleted_at: Date;
    }>(
      `SELECT tenant_id, tenant_name, deleted_by, deletion_type, reason, deleted_at
       FROM tenant_deletion_log WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(r.rowCount).toBe(1);
    const row = r.rows[0]!;
    expect(row.tenant_id).toBe(tenantId);
    expect(row.tenant_name).toBe(tenantName);
    expect(row.deletion_type).toBe('hard');
    expect(row.reason).toBe('L-46 test · 151-TENANT-DELETE-BUILD');
    expect(row.deleted_by).toBe(platformUserId);
    expect(row.deleted_at.getTime()).toBeGreaterThanOrEqual(testStartTs);
  });
});
