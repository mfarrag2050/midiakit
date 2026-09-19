// 420 §٢+§٤ · بوّابة STORAGE_QUOTA_EXCEEDED — الفرضُ المفقود منذ إعلان الرمز.
//
// **ما يُثبته:**
//   ١. plan بلا storage_quota_bytes ⇒ الرفع يمرّ حتى مع مجموعٍ كبير (backward-compat).
//   ٢. plan بحصّة 1 MB + مجموع مستعمَل 900 KB + طلب 200 KB ⇒ 422 STORAGE_QUOTA_EXCEEDED.
//   ٣. plan بحصّة 1 MB + طلب 100 KB (بلا مجموع سابق) ⇒ يمرّ.
//   ٤. الحصّة يقصر عليها SUM(size_bytes) على المستأجر الحاليّ (RLS) — لا يخلط
//      استعمال مستأجرَين.
//
// **L-46 (يدويّ · للتقرير):** علّق شرط `if (currentBytes + parsed.sizeBytes >
// limits.storageQuotaBytes)` في upload-url.ts — اختبار ٢ يفشل بـ200 بدل 422.
// أعِد الشرط ⇒ 4/4 خضراء.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

const MIGRATION_URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.DATABASE_URL_APP ??
  MIGRATION_URL?.replace('migration_user:dev_migration_pass', 'app_user:dev_app_pass');

if (!MIGRATION_URL || !APP_URL) {
  describe.skip('storage-quota (skipped — DATABASE_URL missing)', () => { it('no-op', () => {}); });
} else {
  describe('420 §٢ · بوّابة STORAGE_QUOTA_EXCEEDED', () => {
    let fastify: FastifyInstance;
    let migPool: pg.Pool;

    const suffix = `sq-${process.pid}-${Date.now()}`;
    let tenantAId: string;
    let tokenA: string;
    let tenantBId: string;

    // نبني على حصّة 1 MB — رقم صغيرٌ يسهّل الحساب.
    const QUOTA_MB = 1;
    const ONE_KB = 1024;

    beforeAll(async () => {
      fastify = await buildServer();
      await fastify.ready();
      migPool = new pg.Pool({ connectionString: MIGRATION_URL, max: 2 });

      // مستأجر A + مستأجر B (لاختبار عزل SUM).
      const suA = await fastify.inject({
        method: 'POST', url: '/v1/auth/signup',
        payload: {
          email: `sqa-${suffix}@t.local`,
          password: 'strong_password_1234!',
          tenantName: `SQA-${suffix}`,
        },
      });
      const ctxA = J<{ tenant: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
      tenantAId = ctxA.tenant.id;
      tokenA = ctxA.session.accessToken;

      const suB = await fastify.inject({
        method: 'POST', url: '/v1/auth/signup',
        payload: {
          email: `sqb-${suffix}@t.local`,
          password: 'strong_password_1234!',
          tenantName: `SQB-${suffix}`,
        },
      });
      const ctxB = J<{ tenant: { id: string } }>(suB as { body: string })!;
      tenantBId = ctxB.tenant.id;

      // ابذر 900 KB مستعمَلة في مستأجر A (finalized) — 9 صفوف بـ100 KB.
      // مستأجر B: 500 KB مستعمَلة — يجب ألّا تدخل في حساب A.
      const seed = await migPool.connect();
      try {
        for (const [tid, count, sizeKb] of [[tenantAId, 9, 100], [tenantBId, 5, 100]] as const) {
          await seed.query('BEGIN');
          await seed.query('SELECT app_set_tenant($1::uuid)', [tid]);
          for (let i = 0; i < count; i++) {
            await seed.query(
              `INSERT INTO assets(tenant_id, kind, storage_key, filename, size_bytes, content_type, finalized_at)
               VALUES ($1, 'image', $2, $3, $4, 'image/png', now())`,
              [tid, `${tid}/seed-${i}/f.png`, `seed-${i}.png`, sizeKb * ONE_KB],
            );
          }
          await seed.query('COMMIT');
        }
      } catch (e) {
        await seed.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        seed.release();
      }
    });

    afterAll(async () => {
      // أعِد plans إلى الحالة الأصليّة (كلّها NULL) + نظّف المستأجرَين.
      await migPool.query(`UPDATE plans SET storage_quota_bytes = NULL`);
      for (const tid of [tenantAId, tenantBId]) {
        const c = await migPool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT app_set_tenant($1::uuid)', [tid]);
          await c.query(`DELETE FROM assets WHERE tenant_id = $1`, [tid]);
          await c.query(`DELETE FROM sessions WHERE tenant_id = $1`, [tid]);
          await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tid]);
          await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
                         VALUES ($1, $2, 'hard', '420-sq cleanup')`, [tid, `SQ-${tid}-${suffix}`]);
          await c.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
          await c.query('COMMIT');
        } catch { await c.query('ROLLBACK').catch(() => {}); }
        finally { c.release(); }
      }
      await migPool.end();
      await fastify.close();
      await closeQueues();
      await closePool();
      await closePlatformPool();
    });

    it('١ · plan بلا حصّة (storage_quota_bytes=NULL) ⇒ الرفع يمرّ مهما تراكم', async () => {
      await migPool.query(`UPDATE plans SET storage_quota_bytes = NULL WHERE key = 'trial'`);
      const r = await fastify.inject({
        method: 'POST', url: '/v1/assets/upload-url',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { kind: 'image', filename: 'x1.png', sizeBytes: 500 * ONE_KB, contentType: 'image/png' },
      });
      expect(r.statusCode).toBe(200);
    });

    it('٢ · حصّة 1 MB + مستعمَل 900 KB + طلب 200 KB ⇒ 422 STORAGE_QUOTA_EXCEEDED', async () => {
      await migPool.query(
        `UPDATE plans SET storage_quota_bytes = $1 WHERE key = 'trial'`,
        [QUOTA_MB * ONE_KB * ONE_KB],
      );
      const r = await fastify.inject({
        method: 'POST', url: '/v1/assets/upload-url',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { kind: 'image', filename: 'over.png', sizeBytes: 200 * ONE_KB, contentType: 'image/png' },
      });
      expect(r.statusCode).toBe(422);
      const body = J<{ error: { code: string } }>(r as { body: string })!;
      expect(body.error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    });

    it('٣ · حصّة 10 MB + مستعمَل 900 KB + طلب 100 KB ⇒ يمرّ (بحدود واسعة)', async () => {
      await migPool.query(
        `UPDATE plans SET storage_quota_bytes = $1 WHERE key = 'trial'`,
        [10 * ONE_KB * ONE_KB],
      );
      const r = await fastify.inject({
        method: 'POST', url: '/v1/assets/upload-url',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { kind: 'image', filename: 'ok.png', sizeBytes: 100 * ONE_KB, contentType: 'image/png' },
      });
      expect(r.statusCode).toBe(200);
    });

    it('٤ · SUM يعزل المستأجر — استعمال B لا يُحسب على حصّة A', async () => {
      // نضع حصّة 800 KB — مستأجر A مستعمَل 900 KB (لو ملأنا في اختبار ٣)
      // لكن اختبار ٣ أضاف 100 KB فقط عبر presign · presign لا يُغيّر assets
      // (UPDATE مع finalized_at يحدث بعد UPLOAD الفعليّ). فمستعمَل A = 900 KB.
      // نضبط الحصّة على 950 KB — طلب A بـ40 KB يعبر (900 + 40 = 940 < 950).
      // ولو كان B مستعمَل يُحسب لكانت A تحمل 900+500=1400 > 950 ⇒ يفشل.
      await migPool.query(
        `UPDATE plans SET storage_quota_bytes = $1 WHERE key = 'trial'`,
        [950 * ONE_KB],
      );
      const r = await fastify.inject({
        method: 'POST', url: '/v1/assets/upload-url',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { kind: 'image', filename: 'isolate.png', sizeBytes: 40 * ONE_KB, contentType: 'image/png' },
      });
      expect(r.statusCode).toBe(200);
    });
  });
}
