/**
 * app_set_tenant(uuid) — الدالة الرسمية لضبط app.tenant_id في المعاملة.
 *
 * لماذا SQL function وليس SET LOCAL خام في التطبيق؟
 *   1. اسم واحد قابل للـgrep عبر المستودع.
 *   2. توقيع مُلزَم: uuid — قيمة نصّية غير صالحة تفشل في PG لا في التطبيق.
 *   3. GRANT صريح: app_user يستدعيها، migration_user يستدعيها في seeds.
 *      لا PUBLIC.
 *
 * قاعدة استعمال (توثَّق في middleware A7):
 *   كل معاملة تبدأ بـSELECT app_set_tenant(<uuid>) قبل أوّل query.
 *   SET LOCAL خارج معاملة = no-op (يُبتلع صامتاً — راجع pg docs).
 *
 * signed URLs (docs/17 A3): مسارات مخرجات renders/assets تُبنى signed
 * بانتهاء صلاحية — لا معرّفات متسلسلة، لا مسارات قابلة للتخمين. يُنفَّذ
 * في A11 (assets) و A18 (renders). هنا فقط توثيق المبدأ.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE FUNCTION app_set_tenant(p_tenant_id uuid)
    RETURNS void
    LANGUAGE sql
    AS $$
      SELECT set_config('app.tenant_id', p_tenant_id::text, true);
    $$;

    COMMENT ON FUNCTION app_set_tenant(uuid) IS
      'يضبط app.tenant_id على مستوى المعاملة (is_local=true). يجب أن تسبقه BEGIN وإلا لا أثر له.';

    REVOKE ALL ON FUNCTION app_set_tenant(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app_set_tenant(uuid) TO app_user;
    GRANT EXECUTE ON FUNCTION app_set_tenant(uuid) TO migration_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP FUNCTION IF EXISTS app_set_tenant(uuid)`);
}
