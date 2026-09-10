/**
 * A18 — Renders: إغلاق الفجوات مقابل docs/16 §8.
 *
 * الجدول موجود من A2. §8 يتطلّب ثلاثة أعمدة إضافية:
 *   template_snapshot  — لقطة القالب المستعمَل (§8.6). موازية لـbrand_snapshot.
 *   started_at         — لحظة انتقال إلى running (§8.2 response).
 *   completed_at       — لحظة انتقال إلى succeeded/failed (§8.2 response).
 *   cancel_requested_at — علم للـcancel (§8.8) — العامل يقرأه ويوقف.
 *
 * الحالة `cancelling` (§8.8 response) — غير موجودة في CHECK.
 * نُضيفها لتلائم الشكل «قابل للإلغاء لكن لم يُوقف بعد».
 *
 * السياسة `renders_tenant_isolation` (ALL) القائمة كافية.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE renders
      ADD COLUMN template_snapshot     jsonb,
      ADD COLUMN started_at            timestamptz,
      ADD COLUMN completed_at          timestamptz,
      ADD COLUMN cancel_requested_at   timestamptz
  `);
  // إضافة 'cancelling' إلى قائمة الحالات المسموحة
  pgm.sql(`ALTER TABLE renders DROP CONSTRAINT renders_status_check`);
  pgm.sql(`
    ALTER TABLE renders ADD CONSTRAINT renders_status_check
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'cancelling'))
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE renders DROP CONSTRAINT renders_status_check`);
  pgm.sql(`
    ALTER TABLE renders ADD CONSTRAINT renders_status_check
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled'))
  `);
  pgm.sql(`
    ALTER TABLE renders
      DROP COLUMN IF EXISTS cancel_requested_at,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS started_at,
      DROP COLUMN IF EXISTS template_snapshot
  `);
}
