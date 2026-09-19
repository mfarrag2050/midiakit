// 420 §١+§٤ · حدّ حجم projects.content يُفرض على المسارَين (POST + PATCH).
//
// **ما يُثبته:** نقطة الفحص الموحّدة `serializeAndCheckContentSize` تُستدعى
// من `create.ts` و`update.ts` كليهما. لا يستطيع مستأجرٌ إنشاءَ مشروعٍ صغيرٍ
// ثمّ حقنَ حمولةٍ ضخمة عبر PATCH (audit 850 · L-138).
//
// **L-46 (يدويّ · معلّق للتقرير):** أزل استدعاء `serializeAndCheckContentSize`
// من `update.ts` أو استبدله بـ`JSON.stringify(body.content)` — الاختبار
// الثاني (PATCH) يفشل بـ200 بدل 413. أعِد الاستدعاء ⇒ 4/4 خضراء.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildServer } from '../../server.js';
import { closePool, closePlatformPool } from '../../db.js';
import { closeQueues } from '../../queues/index.js';
import { CONTENT_MAX_BYTES } from './shared/content-size.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

const MIGRATION_URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.DATABASE_URL_APP ??
  MIGRATION_URL?.replace('migration_user:dev_migration_pass', 'app_user:dev_app_pass');

if (!MIGRATION_URL || !APP_URL) {
  describe.skip('content-size-cap (skipped — DATABASE_URL missing)', () => { it('no-op', () => {}); });
} else {
  describe('420 §١ · حدّ حجم projects.content على POST + PATCH', () => {
    let fastify: FastifyInstance;
    let migPool: pg.Pool;

    const suffix = `csz-${process.pid}-${Date.now()}`;
    let tenantId: string;
    let token: string;
    let bkId: string;
    let templateId: string;
    let smallProjectId: string;

    // نصّ يتجاوز الحدّ (~260 KB بايت-حرف صرف · UTF-8 كامل).
    // 'a'.repeat يعطي بايتاً لكلّ حرف · نصّ صغير + JSON overhead يبقى ضمن الحدّ.
    const overLimit = 'a'.repeat(CONTENT_MAX_BYTES + 1);

    beforeAll(async () => {
      fastify = await buildServer();
      await fastify.ready();
      migPool = new pg.Pool({ connectionString: MIGRATION_URL, max: 2 });

      const su = await fastify.inject({
        method: 'POST', url: '/v1/auth/signup',
        payload: {
          email: `csz-${suffix}@t.local`,
          password: 'strong_password_1234!',
          tenantName: `CSZ-${suffix}`,
        },
      });
      const ctx = J<{ tenant: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
      tenantId = ctx.tenant.id;
      token = ctx.session.accessToken;

      const seed = await migPool.connect();
      try {
        const tpl = await seed.query<{ id: string }>(
          `SELECT id FROM templates WHERE tenant_id IS NULL AND name = 'بطاقة عاجل' LIMIT 1`,
        );
        templateId = tpl.rows[0]!.id;

        bkId = randomUUID();
        await seed.query('BEGIN');
        await seed.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
        await seed.query(
          `INSERT INTO brand_kits(id, tenant_id, name, config) VALUES ($1, $2, $3, '{}'::jsonb)`,
          [bkId, tenantId, `bk-${suffix}`],
        );
        await seed.query('COMMIT');
      } catch (e) {
        await seed.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        seed.release();
      }

      // مشروع صغير سليم — سنستعمله كهدف PATCH.
      const cr = await fastify.inject({
        method: 'POST', url: '/v1/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: `p-${suffix}`,
          brand_kit_id: bkId,
          template_id: templateId,
          content: { headline: 'قصير' },
        },
      });
      const p = J<{ id: string }>(cr as { body: string })!;
      smallProjectId = p.id;
    });

    afterAll(async () => {
      const c = await migPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
        await c.query(`DELETE FROM projects WHERE tenant_id = $1`, [tenantId]);
        await c.query(`DELETE FROM brand_kits WHERE tenant_id = $1`, [tenantId]);
        await c.query(`DELETE FROM sessions WHERE tenant_id = $1`, [tenantId]);
        await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
        await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
                       VALUES ($1, $2, 'hard', '420-csz cleanup')`, [tenantId, `CSZ-${suffix}`]);
        await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
        await c.query('COMMIT');
      } catch { await c.query('ROLLBACK').catch(() => {}); }
      finally { c.release(); }
      await migPool.end();
      await fastify.close();
      await closeQueues();
      await closePool();
      await closePlatformPool();
    });

    it('POST /v1/projects بـcontent فوق الحدّ ⇒ 413 CONTENT_TOO_LARGE', async () => {
      const r = await fastify.inject({
        method: 'POST', url: '/v1/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: `pl-${suffix}`,
          brand_kit_id: bkId,
          template_id: templateId,
          content: { headline: overLimit },
        },
      });
      expect(r.statusCode).toBe(413);
      const body = J<{ error: { code: string; field: string | null } }>(r as { body: string })!;
      expect(body.error.code).toBe('CONTENT_TOO_LARGE');
      expect(body.error.field).toBe('content');
    });

    it('PATCH /v1/projects/:id بـcontent فوق الحدّ ⇒ 413 CONTENT_TOO_LARGE (الثقب المسدود)', async () => {
      const r = await fastify.inject({
        method: 'PATCH', url: `/v1/projects/${smallProjectId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: { headline: overLimit } },
      });
      expect(r.statusCode).toBe(413);
      const body = J<{ error: { code: string; field: string | null } }>(r as { body: string })!;
      expect(body.error.code).toBe('CONTENT_TOO_LARGE');
      expect(body.error.field).toBe('content');
    });

    it('PATCH بلا content (تعديل حقل آخر) يمرّ حتى إن كان الحقل الآخر عاديّاً', async () => {
      const r = await fastify.inject({
        method: 'PATCH', url: `/v1/projects/${smallProjectId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'اسم جديد قصير' },
      });
      expect(r.statusCode).toBe(200);
    });

    it('PATCH بـcontent صغير مسموح — البابُ لا يمنع الحقيقيّ', async () => {
      const r = await fastify.inject({
        method: 'PATCH', url: `/v1/projects/${smallProjectId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: { headline: 'عنوان بديل قصير', source: 'مصدر' } },
      });
      expect(r.statusCode).toBe(200);
    });
  });
}
