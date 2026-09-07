/**
 * A24 — عمود api_key_encrypted (AES-256-GCM) على ai_integrations.
 *
 * قرار المالك 2026-09-08: مفاتيح BYO-key مشفَّرة في القاعدة بمفتاح env
 * AI_KEY_ENCRYPTION_KEY (64 hex = 32 بايت). التنسيق:
 *   bytea = nonce(12) || auth_tag(16) || ciphertext(N)
 *
 * `api_key_ref` (موجود من A2) يبقى كمرجع نصّي (kref_{uuid}) — لا يعرض
 * القيمة أبداً. `api_key_encrypted` يحمل السرّ.
 *
 * الأعمدة الجديدة:
 *   • api_key_encrypted bytea NOT NULL — الشيفرة المضمَّنة
 *   • enabled boolean NOT NULL DEFAULT true — §15.1 يعيده
 *   • configured_by uuid — من ضبطه (للـaudit)
 *
 * ضياع AI_KEY_ENCRYPTION_KEY = كل مفاتيح العملاء دائمة الفقدان.
 * انظر PHASES-api.md §A24 لبند التشغيل.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // sanity: صفوف موجودة بلا شيفرة تُبطل الهجرة (يجب هجرتها يدوياً أوّلاً).
  // ai_integrations = 0 صفوف في المستودع الحالي — الفحص هنا يحمي من نشر
  // بعد استعمال حقيقي في المستقبل.
  const rowCount = await pgm.db.query(`SELECT count(*)::int AS n FROM ai_integrations`);
  const n = Number((rowCount as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0);
  if (n > 0) {
    throw new Error(
      `A24 migration: ${n} صفّ في ai_integrations — يجب حذفها أو هجرتها يدوياً (شيفرة jsonb موجودة أصلاً في api_key_ref).`,
    );
  }

  pgm.sql(`
    ALTER TABLE ai_integrations
      ADD COLUMN api_key_encrypted bytea NOT NULL,
      ADD COLUMN enabled boolean NOT NULL DEFAULT true,
      ADD COLUMN configured_by uuid;

    -- control_plane_user كان يملك SELECT فقط (A27). يحتاج CRUD للأدمن
    -- panel المستقبلي (يمسح مفاتيح مسرَّبة، يعطّل مزوّداً معطوباً).
    GRANT INSERT, UPDATE, DELETE ON ai_integrations TO control_plane_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE ai_integrations
      DROP COLUMN IF EXISTS api_key_encrypted,
      DROP COLUMN IF EXISTS enabled,
      DROP COLUMN IF EXISTS configured_by;
  `);
}
