/**
 * SEC-1 البند 1(أ) + Option B من 1(ب) — قفل صلاحيات app_user.
 *
 * المشكلة: infra/postgres/init/01-roles.sql يحمل ALTER DEFAULT PRIVILEGES
 * تمنح app_user كل DML على أيّ جدول جديد في public. node-pg-migrate
 * أنشأ pgmigrations فورث الصلاحيات → app_user يستطيع UPDATE/DELETE
 * على سجلّ الهجرات. أيّ أداة مستقبلية تُنشئ جدولاً في public سترث المثل.
 *
 * القرار (2026-09-05): Option B — إلغاء ALTER DEFAULT PRIVILEGES.
 * كل migration جدول تطبيقي جديد يجب أن يمنح app_user صراحة.
 * فحص G-SEC-2 (في verify-isolation.mjs) يكشف الجداول المنسية أو
 * المنحة خارج القائمة.
 *
 * الجداول الموجودة (18) لم تتأثّر — REVOKE default لا يُزيل منحاً سابقاً.
 * فقط pgmigrations يُنزَع منه المنح المسرّب.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- 1. إلغاء الافتراضيات: جداول مستقبلية لن ترث DML لـapp_user.
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM app_user;

    -- 2. إزالة المنح المسرّب على pgmigrations (سجلّ node-pg-migrate).
    REVOKE ALL ON TABLE pgmigrations FROM app_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pgmigrations TO app_user;
  `);
}
