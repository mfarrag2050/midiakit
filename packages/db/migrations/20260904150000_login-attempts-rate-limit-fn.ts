/**
 * A8+ — إغلاق ثغرة login_attempts + SECURITY DEFINER ثانية.
 *
 * **الثغرة المُصلَحة:** الجدول بلا RLS + GRANT SELECT لـapp_user يعني أن
 * جلسة tenant_A تستطيع قراءة محاولات دخول tenant_B (email + IP + user_id).
 *
 * **الحل — قصر القراءة على دالة SECURITY DEFINER:**
 *   • REVOKE SELECT من app_user (يبقى INSERT للتسجيل)
 *   • GRANT SELECT إلى auth_lookup (نفس الدور المستعمل لـfind_user_by_email)
 *   • CREATE FUNCTION count_failed_login_attempts SECURITY DEFINER
 *     — يعيد عددَي فشل (email + ip) داخل نافذة، لا صفوفاً خامة
 *   • GRANT EXECUTE لـapp_user
 *
 * **قرار المالك 2026-09-04:** موافقة على SECURITY DEFINER ثانية بشرط:
 *   • نفس الدور المالك (auth_lookup) — نفس حدّ الثقة
 *   • تعيد اختزالاً (عددان) لا صفوفاً — لا PII، لا هوية
 *   • grep guard في G-P4-2 يشمل هذه الدالة ضمن نفس السياسة
 *
 * PHASES-api.md §القاعدة الثالثة يُحدَّث: SECURITY DEFINER الآن دالتان،
 * كلتاهما ضمن auth_lookup، كلتاهما تعيد اختزالاً لا PII.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- 1. app_user يفقد SELECT (يبقى INSERT فقط)
    REVOKE SELECT ON TABLE login_attempts FROM app_user;

    -- 2. auth_lookup يستطيع SELECT (لتنفيذ الدالة SECURITY DEFINER)
    GRANT SELECT ON TABLE login_attempts TO auth_lookup;

    -- 3. الدالة — تعيد عددَي فشل (لا صفوف). المدخلات nullable — إن كان
    --    email NULL نتخطّى العدّ لذلك المفتاح.
    CREATE FUNCTION count_failed_login_attempts(
      p_email citext,
      p_ip inet,
      p_since timestamptz
    )
    RETURNS TABLE(email_count bigint, ip_count bigint)
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
    AS $$
      SELECT
        CASE
          WHEN p_email IS NULL THEN 0::bigint
          ELSE (SELECT count(*) FROM login_attempts
                WHERE email = p_email AND success = false AND attempted_at > p_since)
        END AS email_count,
        CASE
          WHEN p_ip IS NULL THEN 0::bigint
          ELSE (SELECT count(*) FROM login_attempts
                WHERE ip_address = p_ip AND success = false AND attempted_at > p_since)
        END AS ip_count;
    $$;

    COMMENT ON FUNCTION count_failed_login_attempts(citext, inet, timestamptz) IS
      'SECURITY DEFINER الثانية. تعيد عددَي محاولات فاشلة (email + ip) داخل نافذة. لا صفوف خامة → لا PII → لا تسرّب. مالك auth_lookup — نفس حدّ الثقة لـfind_user_by_email.';

    -- 4. نقل الملكية إلى auth_lookup
    ALTER FUNCTION count_failed_login_attempts(citext, inet, timestamptz) OWNER TO auth_lookup;

    -- 5. GRANT EXECUTE
    REVOKE ALL ON FUNCTION count_failed_login_attempts(citext, inet, timestamptz) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION count_failed_login_attempts(citext, inet, timestamptz) TO app_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP FUNCTION IF EXISTS count_failed_login_attempts(citext, inet, timestamptz);
    REVOKE SELECT ON TABLE login_attempts FROM auth_lookup;
    GRANT SELECT ON TABLE login_attempts TO app_user;
  `);
}
