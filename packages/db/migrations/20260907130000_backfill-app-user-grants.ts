/**
 * BACKFILL — منح app_user على الجداول الموروثة.
 *
 * السياق: init/01-roles.sql كان يحمل ALTER DEFAULT PRIVILEGES يمنح
 * app_user كل DML على الجداول الجديدة. SEC-1 (20260905100000) ألغاها
 * لأنها كانت تسرّب على pgmigrations.
 *
 * المشكلة: بعد db:reset -v، init يعمل من جديد بلا default privileges،
 * فالجداول الـ18 التي تنشئها initial-schema-and-rls (20260904141100)
 * تظهر بلا أي منح لـapp_user → signup يفشل بـ42501.
 *
 * الحل: هجرة idempotent تمنح صراحةً. الجداول المُنشأة بعد SEC-1
 * (invitations · plans · platform_*) تمنح في هجراتها. هذه للـ18 القديمة.
 *
 * لا هجرة قديمة تُعدَّل (L-57 — التاريخ المدفوع لا يُعاد كتابته).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// الجداول الـ18 من initial-schema-and-rls (2026-09-04).
// invitations أُضيف في هجرة لاحقة → منحه في هجرته نفسها.
const LEGACY_TABLES_DML = [
  'tenants', 'users', 'sessions', 'brand_kits', 'templates',
  'assets', 'workflows', 'projects', 'project_state', 'transitions',
  'annotations', 'renders', 'revisions', 'ai_integrations',
  'subscriptions', 'usage', 'password_reset_tokens',
];

// login_attempts — INSERT فقط (SEC-1)
const LEGACY_TABLES_INSERT_ONLY = ['login_attempts'];

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const t of LEGACY_TABLES_DML) {
    // GRANT idempotent — إعادة GRANT بلا تأثير إن كانت موجودة أصلاً
    pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${t} TO app_user`);
  }
  for (const t of LEGACY_TABLES_INSERT_ONLY) {
    pgm.sql(`GRANT INSERT ON TABLE ${t} TO app_user`);
  }
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // لا reverse — REVOKE قد يكسر البيئات القائمة. هذه backfill idempotent.
}
