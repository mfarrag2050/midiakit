/**
 * 321 · مَنحُ EXECUTE على أغلفة GUC لـ control_plane_user.
 *
 * ── لماذا ───────────────────────────────────────────────────
 * سطران، حاجتان مقيستان:
 *
 * (1) `app_set_actor` — `apps/api/src/plugins/platform-auth-guard.ts:47`
 *     يستدعيها لضبط GUC `app.actor_id` كي تُنسَب أفعالُ لوحة التحكّم في
 *     `revisions.actor_id`. بلا المنح: كلّ طلبٍ يمرّ الحارس بجواز صحيح
 *     يُردّ بـ 401 (permission denied ⇒ catch العامّ ⇒ UNAUTHORIZED).
 *
 * (2) `app_set_tenant` — `apps/api/src/routes/platform/tenants/hard-delete.ts:93`
 *     يستدعيها قبل `DELETE FROM tenants`. الشرح في السطر 88-92: CASCADE
 *     يشعل triggers `log_revision` على الأبناء؛ triggers `SECURITY DEFINER`
 *     تجعل `CURRENT_USER = migration_user`، فسياسة `revisions_control_plane_all`
 *     لا تنطبق، تسقط RLS إلى `revisions_tenant_isolation` (`tenant_id =
 *     current_setting('app.tenant_id'...)`) ⇒ يلزم ضبطُ GUC قبل الـDELETE.
 *
 * ── لماذا آمن ─────────────────────────────────────────────
 * كلتا الدالّتَين جسمُها `PERFORM set_config('app.<name>', ..., true)` — كتابةٌ
 * في GUC محلّيَّ المعاملة، لا قراءةَ جدول، لا تجاوزَ RLS.
 *
 * وقياسٌ إضافيّ (٢٠٢٦-٠٩-٢٢): `set_config('app.*', ...)` يعمل من
 * `control_plane_user` بلا أيّ منح — الأغلفة `REVOKE ALL FROM PUBLIC` +
 * `GRANT EXECUTE` **انضباطٌ (توجيه المستدعي إلى قناة مركزيّة) لا حاجزٌ
 * أمنيّ**. المنحُ هنا يُتيح النداءَ بالاسم المركزيّ — لا يفتح صلاحيّةً
 * جديدة على GUC.
 *
 * ── L-46 ──────────────────────────────────────────────────
 * REVOKE يدويّاً لكلٍّ من الدالّتَين ⇒ hard-delete يعود أحمر بنفس رسالة
 * `permission denied for function app_set_<name>` ⇒ إعادة GRANT ⇒ أخضر.
 * المخرَجات في تقرير 321.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`GRANT EXECUTE ON FUNCTION app_set_actor(uuid)  TO control_plane_user;`);
  pgm.sql(`GRANT EXECUTE ON FUNCTION app_set_tenant(uuid) TO control_plane_user;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`REVOKE EXECUTE ON FUNCTION app_set_tenant(uuid) FROM control_plane_user;`);
  pgm.sql(`REVOKE EXECUTE ON FUNCTION app_set_actor(uuid)  FROM control_plane_user;`);
}
