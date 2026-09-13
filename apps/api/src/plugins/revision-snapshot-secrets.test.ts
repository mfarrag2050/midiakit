// _AMEND-244-REVISION-SNAPSHOT-SECRETS · حارس مصدر يمنع كتابة سرّ في snapshot.
//
// **الادّعاء المُختبَر**: signup ⇒ trigger `log_revision` يكتب صفّاً في
// `revisions` (resource_type='user', action='create'). snapshot يجب أن
// لا يحمل `password_hash` أبداً · ولا `api_key_encrypted` · ولا
// `api_key_ref` · ولا `token_hash` · ولا `refresh_token_hash`.
//
// **قبل _AMEND-244**: password_hash يظهر (RED). بعد الهجرة: يختفي (GREEN).
//
// **مقياس مستقلّ عن مسار القراءة**: هذا الاختبار يفحص ما هو **مكتوب في
// DB**، لا ما يُقرأ عبر endpoint. sanitize في 250 يعمل على القراءة ·
// هذا يعمل على المصدر.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../db.js';
import { closeQueues } from '../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

const SECRET_KEYS = [
  'password_hash',
  'api_key_encrypted',
  'api_key_ref',
  'token_hash',
  'refresh_token_hash',
];

let fastify: FastifyInstance;
const suffix = String(Date.now());
let tenantId: string;

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const su = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `rs-secret-${suffix}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `RS-SECRET-${suffix}`,
    },
  });
  if (su.statusCode !== 201) throw new Error(`signup: ${su.body}`);
  const ctx = J<{ tenant: { id: string }; user: { id: string } }>(su as { body: string })!;
  tenantId = ctx.tenant.id;
});

afterAll(async () => {
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT app_set_tenant($1::uuid)`, [tenantId]);
    await c.query(
      `INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
       VALUES ($1, $2, 'hard', '_AMEND-244 test cleanup')`,
      [tenantId, `RS-SECRET-${suffix}`],
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

describe('_AMEND-244 · log_revision trigger لا يكتب أسراراً في snapshot', () => {
  it('user create revision · لا password_hash ولا api_key_encrypted ولا api_key_ref ولا token_hash ولا refresh_token_hash', async () => {
    // نقرأ عبر platform pool (يعبر RLS · لا يعتمد على sanitize في 250)
    const pool = getPlatformPool();
    const r = await pool.query<{ snapshot_keys: string[] }>(
      `SELECT ARRAY(SELECT jsonb_object_keys(snapshot)) AS snapshot_keys
       FROM revisions
       WHERE tenant_id = $1 AND resource_type = 'user' AND action = 'create'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    expect(r.rowCount).toBe(1);
    const keys = r.rows[0]!.snapshot_keys;

    for (const secret of SECRET_KEYS) {
      expect(keys, `snapshot يحمل ${secret} — المصدر يُسرِّب`).not.toContain(secret);
    }
  });

  it('tenant create revision · لا يحمل أيّ مفتاح من القائمة السرّيّة', async () => {
    const pool = getPlatformPool();
    const r = await pool.query<{ snapshot_keys: string[] }>(
      `SELECT ARRAY(SELECT jsonb_object_keys(snapshot)) AS snapshot_keys
       FROM revisions
       WHERE tenant_id = $1 AND resource_type = 'tenant' AND action = 'create'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    expect(r.rowCount).toBe(1);
    const keys = r.rows[0]!.snapshot_keys;

    for (const secret of SECRET_KEYS) {
      expect(keys, `tenant snapshot يحمل ${secret} — انتشار غير متوقّع`).not.toContain(secret);
    }
  });

  it('كل صفوف revisions في DB (بلا استثناء) لا تحمل أيّ مفتاح سرّيّ', async () => {
    // مقياس شامل: بعد الهجرة · 0 صفوف حاملة لأيّ من الخمسة.
    const pool = getPlatformPool();
    const r = await pool.query<{ n: string; key: string }>(
      `SELECT k AS key, count(*)::text AS n
       FROM revisions, unnest($1::text[]) AS k
       WHERE snapshot ? k
       GROUP BY k`,
      [SECRET_KEYS],
    );
    if (r.rowCount && r.rowCount > 0) {
      const detail = r.rows.map((row) => `${row.key}=${row.n}`).join(', ');
      throw new Error(`revisions rows carrying secret keys: ${detail}`);
    }
    // rowCount === 0 (0 groups) ⇒ 0 صفوف
  });
});
