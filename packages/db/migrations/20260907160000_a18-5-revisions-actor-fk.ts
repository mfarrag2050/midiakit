/**
 * A18.5 fix — إزالة FK على revisions.actor_id.
 *
 * السياق: revisions.actor_id كان REFERENCES users(id). A27 أدخل
 * platform_users (منفصلة عن users). تعديل المالك على tenants يُنتج
 * revision بـactor_id = platform_user.id — يخالف FK.
 *
 * الحل: إزالة FK. actor_id يبقى uuid nullable للتوثيق.
 * NULL = system. UUID لا يشير لجدول واحد بعينه — سلوك dual-source
 * (users || platform_users) موثَّق في التعليق.
 *
 * البدائل المرفوضة:
 *   - FK مركّب (users OR platform_users): PG لا يدعم OR-FK
 *   - عمود actor_type + actor_id: تعقيد للتوثيق فقط
 *   - جدولان revisions منفصلان: يكسر §10 (نمط عام على 6 موارد)
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE revisions DROP CONSTRAINT revisions_actor_id_fkey`);
  pgm.sql(`
    COMMENT ON COLUMN revisions.actor_id IS
      'UUID لـactor. قد يشير إلى users.id (تعديل tenant) أو
       platform_users.id (تعديل مالك). لا FK لدعم الدلالة المزدوجة.
       NULL = system (migrations/workers بلا app.actor_id).'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE revisions ADD CONSTRAINT revisions_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  `);
}
