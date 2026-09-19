// 400 §٣ · حزامٌ ثانٍ فوق RLS — إثبات الطبقة الموجودة سلوكيّاً.
//
// **الفرضيّة المُختبَرة (audit 820):**
//   - العزل الحاليّ = طبقة واحدة: `app_user NOBYPASSRLS` + `SET LOCAL
//     app.tenant_id` + `FORCE ROW LEVEL SECURITY` على كلّ جدول مستأجر.
//   - لا `WHERE tenant_id = $n` صريح فوقها في مسارات القراءة بالمعرِّف.
//   - إن سقطت الطبقة (اتّصالٌ أُعيد استعماله بلا SET LOCAL جديد ·
//     RLS عُطّلت لأيّ سبب) فلا حاجزَ ثانٍ.
//
// **ما يُثبته هذا الملفّ:**
//   ١. اتّصال `app_user` بلا `app_set_tenant` ⇒ `SELECT ... FROM
//      brand_kits` يعيد **صفر صفوف**. لا استثناء غامض · لا صفوف من
//      أيّ مستأجر آخر.
//   ٢. مستأجر A نشط ⇒ استعلام صفٍّ يخصّ B بمعرِّفه الصريح ⇒ **صفر
//      صفوف** (المسار API يترجم إلى NOT_FOUND).
//   ٣. إعادة استعمال نفس `client` لمستأجرَين متتاليَين ⇒ الأوّل **لا
//      يتسرّب** إلى الثاني بعد `SET LOCAL` جديد.
//
// **L-46 (يدويّ · لأنّه يعطّل RLS على DB مشتركة):**
//   بعد تشغيل الاختبار خضراء:
//     docker exec pf-mediakit-ci-pg psql -U postgres -d mediakit_ci \
//       -c "ALTER TABLE brand_kits NO FORCE ROW LEVEL SECURITY;
//           ALTER TABLE brand_kits DISABLE ROW LEVEL SECURITY;"
//     pnpm vitest run apps/api/src/plugins/rls-belt.test.ts
//     # ⇒ الاختبارات الثلاثة حمراء (رأى صفوفاً حين لا يجب)
//     docker exec ... -c "ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
//                          ALTER TABLE brand_kits FORCE ROW LEVEL SECURITY;"
//     pnpm vitest run apps/api/src/plugins/rls-belt.test.ts   # ⇒ خضراء
//
// **لا لمسَ للشوروم الحيّ.** DATABASE_URL يقصد قاعدة اختبار ملكها لـmk-ci.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// عناوين الاتصال — نفس نمط بقيّة الاختبارات (auth-boundary.test.ts).
// mk-ci يحقن DATABASE_URL كـmigration_user. app_user يُشتقّ بتبديل المستخدم +
// كلمة السرّ (نفس نمط check-plan-sync.mjs).
const MIGRATION_URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.DATABASE_URL_APP ??
  MIGRATION_URL?.replace('migration_user:dev_migration_pass', 'app_user:dev_app_pass');

if (!MIGRATION_URL || !APP_URL) {
  // بلا env لا نستطيع الاختبار — نتخطّى بحذر (شبيه بـcheck-plan-sync
  // في dev بلا DB). في mk-ci دائماً مضبوطة.
  describe.skip('rls-belt (skipped — DATABASE_URL missing)', () => {
    it('no-op', () => {});
  });
} else {
  describe('400 §٣ · حزامُ RLS الثاني — إثبات سلوكيّ', () => {
    let migPool: pg.Pool;
    let appPool: pg.Pool;

    let tenantAId: string;
    let tenantBId: string;
    let bkAId: string;
    let bkBId: string;

    const suffix = `rls-belt-${process.pid}-${Date.now()}`;

    beforeAll(async () => {
      migPool = new pg.Pool({ connectionString: MIGRATION_URL, max: 2 });
      appPool = new pg.Pool({ connectionString: APP_URL, max: 2 });

      // نولِّد الـUUIDs في Node حتى نضبط `app_set_tenant` قبل الإدراج —
      // trigger `tenants_log_revision` يكتب إلى `revisions` (RLS مفروضة عليه)
      // فيلزم `app.tenant_id = <tenant_id>` قبل INSERT.
      tenantAId = randomUUID();
      tenantBId = randomUUID();
      bkAId = randomUUID();
      bkBId = randomUUID();

      const seed = await migPool.connect();
      try {
        // مستأجر A + brand_kit A في معاملة واحدة تحت سياقه.
        await seed.query('BEGIN');
        await seed.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        await seed.query(`INSERT INTO tenants(id, name) VALUES ($1, $2)`, [
          tenantAId,
          `A-${suffix}`,
        ]);
        await seed.query(
          `INSERT INTO brand_kits(id, tenant_id, name, config) VALUES ($1, $2, $3, '{}'::jsonb)`,
          [bkAId, tenantAId, `bk-A-${suffix}`],
        );
        await seed.query('COMMIT');

        // مستأجر B + brand_kit B — معاملة منفصلة (SET LOCAL محبوس بها).
        await seed.query('BEGIN');
        await seed.query('SELECT app_set_tenant($1::uuid)', [tenantBId]);
        await seed.query(`INSERT INTO tenants(id, name) VALUES ($1, $2)`, [
          tenantBId,
          `B-${suffix}`,
        ]);
        await seed.query(
          `INSERT INTO brand_kits(id, tenant_id, name, config) VALUES ($1, $2, $3, '{}'::jsonb)`,
          [bkBId, tenantBId, `bk-B-${suffix}`],
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
      // تنظيف — كلّ مستأجرٍ في معاملة تحت سياقه (RLS DELETE يقصر على tenant الحاليّ).
      const cleanup = await migPool.connect();
      try {
        for (const tid of [tenantAId, tenantBId]) {
          await cleanup.query('BEGIN');
          await cleanup.query('SELECT app_set_tenant($1::uuid)', [tid]);
          await cleanup.query(`DELETE FROM brand_kits WHERE tenant_id = $1`, [tid]);
          await cleanup.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
          await cleanup.query('COMMIT');
        }
      } catch {
        await cleanup.query('ROLLBACK').catch(() => {});
      } finally {
        cleanup.release();
      }
      await migPool.end();
      await appPool.end();
    });

    it('١ · اتّصال app_user بلا app_set_tenant ⇒ SELECT يعيد صفراً (لا استثناء)', async () => {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        // لا `SELECT app_set_tenant(...)`. `current_setting('app.tenant_id', true)`
        // = NULL ⇒ RLS يفلتر كلّ صفوف الجدول.
        const r = await c.query<{ id: string }>(`SELECT id FROM brand_kits`);
        expect(r.rowCount).toBe(0);
        // ولا رفض نحويّ — الاستعلام يمرّ، ينتج مجموعةً فارغة.
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    });

    it('٢ · مستأجر A نشط ⇒ صفّ B بمعرّفه الصريح ⇒ صفر صفوف (⇒ NOT_FOUND في المسار)', async () => {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        const r = await c.query<{ id: string }>(
          `SELECT id FROM brand_kits WHERE id = $1`,
          [bkBId],
        );
        expect(r.rowCount).toBe(0);
        // ولا يكشف الوجود بأيّ رسالة — نفس ردّ ID غير موجود أصلاً.
        const r2 = await c.query<{ id: string }>(
          `SELECT id FROM brand_kits WHERE id = '00000000-0000-0000-0000-000000000000'`,
        );
        expect(r2.rowCount).toBe(0);
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
    });

    it('٣ · إعادة استعمال نفس client لـA ثمّ B ⇒ لا تسرّب صفوف A إلى B', async () => {
      const c = await appPool.connect();
      try {
        // معاملة A
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        const ra = await c.query<{ id: string }>(`SELECT id FROM brand_kits`);
        expect(ra.rows.some((r) => r.id === bkAId)).toBe(true);
        expect(ra.rows.some((r) => r.id === bkBId)).toBe(false);
        await c.query('COMMIT');

        // نفس client، معاملة B
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantBId]);
        const rb = await c.query<{ id: string }>(`SELECT id FROM brand_kits`);
        expect(rb.rows.some((r) => r.id === bkBId)).toBe(true);
        // الحاسم: صفّ A **لا يظهر** في نتيجة B رغم مشاركة الـclient.
        expect(rb.rows.some((r) => r.id === bkAId)).toBe(false);
        await c.query('COMMIT');
      } finally {
        c.release();
      }
    });

    it('٤ · بعد ROLLBACK لمعاملة A، استعلام على نفس client خارج معاملة ⇒ صفر (SET LOCAL انتهى)', async () => {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantAId]);
        await c.query('COMMIT');
        // SET LOCAL انتهى مع COMMIT ⇒ app.tenant_id = NULL ⇒ RLS يفلتر الكلّ.
        const r = await c.query<{ id: string }>(`SELECT id FROM brand_kits WHERE id = $1`, [bkAId]);
        expect(r.rowCount).toBe(0);
      } finally {
        c.release();
      }
    });
  });
}
