/**
 * A14 — Projects: إغلاق الفجوات مقابل docs/16 §7.
 *
 * ── الفجوات المُغلَقة ────────────────────────────────
 *   state          — §7.1 filter[state]، §7.5 draft-only حذف
 *   assignee_id    — §7.1 filter[assignee]، §7.1 currentState.assigneeId
 *   locale         — §7.3 body input («ar|en|fr|tr|es|de»)
 *   deleted_at     — soft delete (اتّساقاً مع A13)
 *
 * ── قيود ──────────────────────────────────────────
 *   locale CHECK: القائمة السداسية من §7.3
 *   state    text (بلا CHECK — workflow يحدّد القيم في A15)
 *   assignee_id FK إلى users(id) ON DELETE SET NULL
 *   default state='draft' (نقطة انطلاق workflow)
 *
 * ── السياسة ──────────────────────────────────────
 * projects_tenant_isolation (ALL) القائمة كافية — لا global scope
 * كما في templates. المشاريع كلها tenant-scoped. لا تغيير.
 *
 * ── التفرّد ──────────────────────────────────────
 * فحص NULL (L-62): title (name عندنا) نصّ حرّ، لا يُلزم بتفرّد على
 * مستوى المستأجر (نفس اسم مشروع مقبول — يُميَّز بـid). لا UNIQUE.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE projects
      ADD COLUMN state       text NOT NULL DEFAULT 'draft',
      ADD COLUMN assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN locale      text NOT NULL DEFAULT 'ar',
      ADD COLUMN deleted_at  timestamptz
  `);

  pgm.sql(`
    ALTER TABLE projects ADD CONSTRAINT projects_locale_check
      CHECK (locale IN ('ar', 'en', 'fr', 'tr', 'es', 'de'))
  `);

  pgm.sql(`CREATE INDEX projects_state_idx ON projects(tenant_id, state)`);
  pgm.sql(`CREATE INDEX projects_assignee_idx ON projects(tenant_id, assignee_id) WHERE assignee_id IS NOT NULL`);
  pgm.sql(`CREATE INDEX projects_created_by_idx ON projects(tenant_id, created_by) WHERE created_by IS NOT NULL`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS projects_created_by_idx`);
  pgm.sql(`DROP INDEX IF EXISTS projects_assignee_idx`);
  pgm.sql(`DROP INDEX IF EXISTS projects_state_idx`);
  pgm.sql(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_locale_check`);
  pgm.sql(`
    ALTER TABLE projects
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS locale,
      DROP COLUMN IF EXISTS assignee_id,
      DROP COLUMN IF EXISTS state
  `);
}
