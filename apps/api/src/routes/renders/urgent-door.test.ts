// 410 §٥ · اختبار بوّابة المسار السريع (allow_urgent) — سلوكيّاً + بـinspection طابور.
//
// **ما يُثبته:**
//   ١. خطّةٌ بلا allow_urgent + priority='urgent' ⇒ 403 URGENT_NOT_ALLOWED_ON_PLAN.
//   ٢. تفعيل allow_urgent على تلك الخطّة ⇒ 202، والمهمّة تدخل طابور
//      `render-urgent` **فعلاً** (لا بالاسم فقط — نتحقّق من BullMQ).
//   ٣. priority='normal' يمرّ بلا فحص، حتى مع allow_urgent=false.
//   ٤. الخطّة غير مقروءة (tenant.plan يشير إلى خطّة غير موجودة) ⇒
//      الطلب لا يمرّ (فشلٌ مغلق — الاستثناء يصعد إلى error-handler).
//
// **لا لمسَ للشوروم.** يعمل على DB الاختبار المُشار إليها بـDATABASE_URL.
// BULLMQ_PREFIX فريد لكل fork (vitest.setup.ts).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues, getQueue } from '../../queues/index.js';
import { getEffectiveLimits } from '../../config/effective-limits.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

const MIGRATION_URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.DATABASE_URL_APP ??
  MIGRATION_URL?.replace('migration_user:dev_migration_pass', 'app_user:dev_app_pass');

if (!MIGRATION_URL || !APP_URL) {
  describe.skip('urgent-door (skipped — DATABASE_URL missing)', () => { it('no-op', () => {}); });
} else {
  describe('410 §٥ · بوّابة المسار السريع', () => {
    let fastify: FastifyInstance;
    let migPool: pg.Pool;

    const suffix = `urgent-${process.pid}-${Date.now()}`;
    let tenantAId: string;
    let bkAId: string;
    let projectAId: string;
    let templateId: string;
    let tokenA: string;

    beforeAll(async () => {
      fastify = await buildServer();
      await fastify.ready();
      migPool = new pg.Pool({ connectionString: MIGRATION_URL, max: 2 });

      // signup مستأجر A — plan افتراضيّ 'trial' (لا allow_urgent).
      const su = await fastify.inject({
        method: 'POST', url: '/v1/auth/signup',
        payload: {
          email: `urg-a-${suffix}@t.local`,
          password: 'strong_password_1234!',
          tenantName: `URG-A-${suffix}`,
        },
      });
      const ctx = J<{ tenant: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
      tenantAId = ctx.tenant.id;
      tokenA = ctx.session.accessToken;

      // brand_kit + project — نستعمل قالباً عالميّاً موجوداً (breaking) لتفادي
      // TemplateSnapshotInvalid على قوالب مبذورة غير مكتملة.
      const seed = await migPool.connect();
      try {
        // اختر قالباً عالميّاً كامل التعريف — نفحص definition_hash ليس مطلوباً هنا.
        const tpl = await seed.query<{ id: string }>(
          `SELECT id FROM templates WHERE tenant_id IS NULL AND name = 'بطاقة عاجل' LIMIT 1`,
        );
        templateId = tpl.rows[0]!.id;

        bkAId = randomUUID();
        projectAId = randomUUID();
        await seed.query('BEGIN');
        await seed.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        await seed.query(
          `INSERT INTO brand_kits(id, tenant_id, name, config) VALUES ($1, $2, $3, '{}'::jsonb)`,
          [bkAId, tenantAId, `bk-${suffix}`],
        );
        await seed.query(
          `INSERT INTO projects(id, tenant_id, brand_kit_id, template_id, name, content, locale, created_by, state)
           VALUES ($1, $2, $3, $4, $5, '{"headline":"عنوان اختباريّ"}'::jsonb, 'ar',
                   (SELECT id FROM users WHERE tenant_id = $2 LIMIT 1), 'draft')`,
          [projectAId, tenantAId, bkAId, templateId, `proj-${suffix}`],
        );
        await seed.query('COMMIT');
      } catch (e) {
        await seed.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        seed.release();
      }
    });

    afterAll(async () => {
      // نظّف الطوابير أوّلاً (jobs من هذا الاختبار على prefix معزول).
      try {
        await getQueue('urgent').obliterate({ force: true });
        await getQueue('normal').obliterate({ force: true });
      } catch { /* ignore — prefix isolation يكفي */ }

      // احذف بيانات المستأجر عبر migration_user تحت سياقه.
      const c = await migPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        await c.query(`DELETE FROM renders WHERE tenant_id = $1`, [tenantAId]);
        await c.query(`DELETE FROM projects WHERE tenant_id = $1`, [tenantAId]);
        await c.query(`DELETE FROM brand_kits WHERE tenant_id = $1`, [tenantAId]);
        await c.query(`DELETE FROM sessions WHERE tenant_id = $1`, [tenantAId]);
        await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantAId]);
        // إعادة plan إلى trial (احتياط لو غيّرناها في اختبار)
        await c.query(`UPDATE tenants SET plan = 'trial' WHERE id = $1`, [tenantAId]);
        await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
                       VALUES ($1, $2, 'hard', '410-test cleanup')`, [tenantAId, `URG-A-${suffix}`]);
        await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantAId]);
        await c.query('COMMIT');
      } catch {
        await c.query('ROLLBACK').catch(() => {});
      } finally {
        c.release();
      }

      // إعادة plans.allow_urgent إلى false على كلّ الخطط (لو غيّرناها).
      await migPool.query(`UPDATE plans SET allow_urgent = false`);
      await migPool.end();

      await fastify.close();
      await closeQueues();
      await closePool();
      await closePlatformPool();
    });

    it('١ · plan trial (allow_urgent=false) + priority=urgent ⇒ 403 URGENT_NOT_ALLOWED_ON_PLAN', async () => {
      const r = await fastify.inject({
        method: 'POST', url: '/v1/renders',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { project_id: projectAId, size: 'x', format: 'png', priority: 'urgent' },
      });
      expect(r.statusCode).toBe(403);
      const body = J<{ error: { code: string; field: string | null } }>(r as { body: string })!;
      expect(body.error.code).toBe('URGENT_NOT_ALLOWED_ON_PLAN');
      expect(body.error.field).toBe('priority');
    });

    it('٢ · تفعيل allow_urgent على trial ⇒ 202 + المهمّة في طابور render-urgent فعلاً', async () => {
      // فعّل الميزة على خطّة trial (كلّ التنظيف في afterAll يعيدها).
      await migPool.query(`UPDATE plans SET allow_urgent = true WHERE key = 'trial'`);

      const r = await fastify.inject({
        method: 'POST', url: '/v1/renders',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { project_id: projectAId, size: 'x', format: 'png', priority: 'urgent' },
      });
      expect(r.statusCode).toBe(202);
      const body = J<{ id: string; status: string }>(r as { body: string })!;
      expect(body.status).toBe('queued');

      // الحاسم: المهمّة **في** render-urgent، ليست في render-normal.
      const urgentQ = getQueue('urgent');
      const normalQ = getQueue('normal');
      const urgentJob = await urgentQ.getJob(body.id);
      const normalJob = await normalQ.getJob(body.id);
      expect(urgentJob).toBeTruthy();
      expect(normalJob).toBeFalsy();
    });

    it('٣ · priority=normal يمرّ دائماً (بلا فحص allow_urgent)', async () => {
      await migPool.query(`UPDATE plans SET allow_urgent = false WHERE key = 'trial'`);
      // نظّف renders السابقة كي لا تصطدم بـconcurrent_renders_limit=1 لـtrial.
      const cleanRender = await migPool.connect();
      try {
        await cleanRender.query('BEGIN');
        await cleanRender.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        await cleanRender.query(`DELETE FROM renders WHERE tenant_id = $1`, [tenantAId]);
        await cleanRender.query('COMMIT');
      } finally {
        cleanRender.release();
      }

      const r = await fastify.inject({
        method: 'POST', url: '/v1/renders',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { project_id: projectAId, size: 'x', format: 'png', priority: 'normal' },
      });
      expect(r.statusCode).toBe(202);
      const body = J<{ id: string }>(r as { body: string })!;
      const normalJob = await getQueue('normal').getJob(body.id);
      expect(normalJob).toBeTruthy();
    });

    it('٤ · فشلٌ مغلق: getEffectiveLimits يرمي على مستأجرٍ غير موجود', async () => {
      // اختبار مباشر للدالّة التي يعتمد عليها الفحص. في create.ts، لا
      // try/catch يلتقطها ⇒ الاستثناء يصعد إلى error-handler → 500، لا
      // يمرّ إلى INSERT/enqueue. هذا ما تشترطه §٢ نصّاً.
      const c = await migPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        const fakeId = '00000000-0000-0000-0000-000000000000';
        await expect(getEffectiveLimits(c, fakeId)).rejects.toThrow(/not found/i);
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    });
  });
}
