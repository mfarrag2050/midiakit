/**
 * A21 — منح كتابة control_plane_user على subscriptions + tenants.
 *
 * السياق: webhook Paddle يستقبل حدث ثمّ يُحدّث subscriptions و tenants.plan
 * (docs/17 §A21). العامل: `getPlatformPool()` = control_plane_user.
 * A26/A27 منحاه SELECT فقط على هذين — كافٍ لواجهة الأدمن، غير كافٍ للـwebhook.
 *
 * قرار: توسيع الحقّ داخل نفس الدور (control plane هو من يكتب الاشتراكات
 * سواء من الأدمن يدوياً أو webhook تلقائياً — كلاهما «مسؤولية المنصّة»).
 * التسريب المضاف: صفر — الدور موجود بسياساته الكاملة.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    GRANT INSERT, UPDATE, DELETE ON subscriptions TO control_plane_user;
    GRANT UPDATE ON tenants TO control_plane_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM control_plane_user;
    REVOKE UPDATE ON tenants FROM control_plane_user;
  `);
}
