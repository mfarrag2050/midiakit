// 526 · حارس السباق «الردّ قبل الالتزام» — L-46.
//
// قبل الإصلاح (COMMIT في onResponse): POST/PATCH متتاليان فوريّان على نفس
// المورد ⇒ الطلب الثاني يفتح txn قبل COMMIT الأوّل، وsnapshot تحت READ
// COMMITTED لا يرى INSERT الأخير ⇒ 404.
//
// L-46 (إثبات الإصلاح):
//   • أعِد onResponse القديم في `plugins/tenant-tx.ts` (وأخرج commitTx من
//     handlers): يجب أن يفشل هذا الاختبار.
//   • أعِد الإصلاح: يجب أن يمرّ 200/200.
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';

// 200 طلبات متوازية تتجاوز حدّ 20/دقيقة الافتراضيّ — عطّل الحدَّ لهذا الاختبار.
process.env.RATE_LIMIT_DISABLE = '1';

import { buildServer } from '../server.js';
import { closePool, closePlatformPool } from '../db.js';
import { closeQueues } from '../queues/index.js';

const RUN_ID = randomUUID().slice(0, 8);

async function migQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { return await pool.query(sql, params); }
  finally { await pool.end(); }
}

async function migQueryAsTenant(tenantId: string, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } finally { c.release(); await pool.end(); }
}

async function signup(fastify: FastifyInstance): Promise<{ token: string; tenantId: string }> {
  const uid = randomUUID().slice(0, 8);
  await migQuery(`DELETE FROM login_attempts WHERE email LIKE $1`, [`race-${RUN_ID}-${uid}@%`]);
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `race-${RUN_ID}-${uid}@t.local`,
      password: 'strong_password_1234!',
      tenantName: `RACE-${RUN_ID}-${uid}`,
    },
  });
  if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
  const body = JSON.parse(r.body) as { tenant: { id: string }; session: { accessToken: string } };
  return { token: body.session.accessToken, tenantId: body.tenant.id };
}

describe('526 · COMMIT قبل الاستجابة — سباق tenant-tx (L-46)', () => {
  it('brand-kits: POST ثمّ PATCH فوراً × 200 متوازياً ⇒ صفر 404', async () => {
    const fastify = await buildServer();
    await fastify.ready();
    try {
      const { token, tenantId } = await signup(fastify);
      await migQueryAsTenant(tenantId,
        `UPDATE tenants SET plan_overrides='{"brand_kits_limit":500}'::jsonb WHERE id=$1`,
        [tenantId],
      );
      const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

      // 200 دورة متوازية: كلّ دورة تعمل POST ثمّ PATCH ثمّ DELETE فوراً.
      // DELETE على كائنٍ أُنشئ قبل ~1ms أشدّ استفزازاً للسباق من PATCH.
      const tasks = Array.from({ length: 200 }, (_, i) => (async () => {
        const created = await fastify.inject({
          method: 'POST', url: '/v1/brand-kits',
          headers: H, payload: { name: `race-bk-${i}` },
        });
        expect(created.statusCode, `POST ${i}: ${created.body}`).toBe(201);
        const kitId = (JSON.parse(created.body) as { id: string }).id;

        const patched = await fastify.inject({
          method: 'PATCH', url: `/v1/brand-kits/${kitId}`,
          headers: H, payload: { name: `race-bk-${i}-renamed` },
        });
        if (patched.statusCode !== 200) return { i, op: 'PATCH', status: patched.statusCode, body: patched.body };

        const deleted = await fastify.inject({
          method: 'DELETE', url: `/v1/brand-kits/${kitId}`, headers: H,
        });
        return { i, op: 'DELETE', status: deleted.statusCode, body: deleted.body };
      })());

      const results = await Promise.all(tasks);
      const bad = results.filter((r) => r.status !== 200 && r.status !== 204);
      expect(bad, `${bad.length}/200 فشلت — sample: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([]);
    } finally {
      await fastify.close();
    }
  }, 60_000);

  afterAll(async () => {
    await migQuery(`DELETE FROM tenants WHERE name LIKE $1`, [`RACE-${RUN_ID}-%`]);
    await closeQueues();
    await closePool();
    await closePlatformPool();
  });
});
