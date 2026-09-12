/**
 * _AMEND-242-TENANT-LOG-POLICY — RLS + control_plane policy لجدول tenant_deletion_log.
 *
 * ── العطب الذي نُغلقه ──────────────────────────────
 * الهجرة 20260912000000_tenant-deletion-log أنشأت الجدول + منحت SELECT/INSERT
 * لـcontrol_plane_user و migration_user · **لكنّها لم تُفعّل RLS · لم
 * تُنشئ سياسة control_plane_all**. نتيجة: `check-control-plane-policies`
 * يسقط: «tenant_deletion_log: جدول جديد بلا إعلان».
 *
 * الجدول لا يحمل tenant scope بمعنى RLS (المستأجر محذوف حين يُسجَّل الصفّ)
 * — هو سجلّ منصّة. لكنّ **قاعدة المشروع صارمة**: كل جدول في public يحمل
 * RLS + FORCE، وسياسة تسمّي المستفيد. الجدول بلا RLS ⇒ NOBYPASSRLS يقرأ 0
 * صفوف · الحذف يبدو ناجحاً لكنّ الأثر لا يُقرأ. **صمت بالانحياز إلى
 * الأمان** — وهو خطأ هنا: نريد أثراً يُقرَأ عند مراجعة الحذف.
 *
 * ── الحلّ ────────────────────────────────────────────
 * 1. ENABLE + FORCE RLS.
 * 2. سياسة control_plane_all: كل الأدوار التي تُقيَّم بـcontrol_plane_user
 *    (اسم CURRENT_USER) تعبر بحريّة — قراءة + كتابة كاملتان.
 * 3. سياسة migration_user_all: للصيانة (backfill · repair · إن لزم).
 *
 * ── سبب استبعاد app_user policy ────────────────────
 * البيانات ليست ملك مستأجر بعد الحذف (المستأجر ذهب). سياسة tenant_isolation
 * على tenant_id تعني: كل app_user session بلا set_config يرى 0 · مع
 * set_config يرى صفوف مستأجر لم يعد له session أصلاً. **قصور صريح · لا
 * سياسة أفضل من سياسة مضلِّلة**. control_plane_user وحده يستطيع مراجعة
 * سجلّ الحذف · وهذا الصحيح معماريّاً.
 *
 * ── L-46 (اختبار حياة · مُنجَز قبل commit) ──────────
 *   RED: `check-control-plane-policies` قبل الهجرة ⇒ tenant_deletion_log
 *        مدرَج كـانحراف. exit=1.
 *   GREEN: بعد الهجرة + تحديث EXPECTED_TABLES ⇒ 29 جدول محميّ. exit=0.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE tenant_deletion_log ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE tenant_deletion_log FORCE ROW LEVEL SECURITY`);

  pgm.sql(`
    CREATE POLICY tenant_deletion_log_control_plane_all ON tenant_deletion_log
      AS PERMISSIVE FOR ALL
      USING (CURRENT_USER = 'control_plane_user')
      WITH CHECK (CURRENT_USER = 'control_plane_user')
  `);

  pgm.sql(`
    CREATE POLICY tenant_deletion_log_migration_user_all ON tenant_deletion_log
      AS PERMISSIVE FOR ALL
      USING (CURRENT_USER = 'migration_user')
      WITH CHECK (CURRENT_USER = 'migration_user')
  `);

  // VERIFY (نمط _AMEND-231): نقرأ الحالة النهائيّة · نفشل إن لم تُطابق.
  pgm.sql(`
    DO $$
    DECLARE
      rls_enabled boolean;
      rls_forced boolean;
      policy_count int;
    BEGIN
      SELECT relrowsecurity, relforcerowsecurity INTO rls_enabled, rls_forced
      FROM pg_class WHERE relname = 'tenant_deletion_log' AND relnamespace = 'public'::regnamespace;

      IF NOT rls_enabled OR NOT rls_forced THEN
        RAISE EXCEPTION 'MIGRATION_VERIFY_FAILED: tenant_deletion_log RLS state (enabled=%, forced=%) لم يُطبَّق', rls_enabled, rls_forced;
      END IF;

      SELECT count(*) INTO policy_count FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'tenant_deletion_log'
        AND policyname IN ('tenant_deletion_log_control_plane_all', 'tenant_deletion_log_migration_user_all');

      IF policy_count <> 2 THEN
        RAISE EXCEPTION 'MIGRATION_VERIFY_FAILED: تُوقّع سياستان · وُجدت %', policy_count;
      END IF;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP POLICY IF EXISTS tenant_deletion_log_migration_user_all ON tenant_deletion_log`);
  pgm.sql(`DROP POLICY IF EXISTS tenant_deletion_log_control_plane_all ON tenant_deletion_log`);
  pgm.sql(`ALTER TABLE tenant_deletion_log NO FORCE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE tenant_deletion_log DISABLE ROW LEVEL SECURITY`);
}
