/**
 * A5 — schema المصادقة (docs/17 §3.2).
 *
 * قرار المالك 2026-09-04:
 *   • عضوية جمعية مؤجَّلة (schema يبقى 1:1، تُفعَّل عند حاجة فعلية).
 *   • الواجهة single-tenant للإصدار الأوّل.
 *   • find_user_by_email هو SECURITY DEFINER الوحيد في المنظومة —
 *     أيّ ثانٍ يمرّ بموافقة المالك (سُجّل في PHASES-api.md).
 *
 * قيود ADR-011 على SECURITY DEFINER (مطبَّقة أدناه):
 *   1. يعيد الحد الأدنى لـauth — لا PII (اسم، هاتف، أيّ حقل شخصي).
 *      الحقول المُعادة: user_id, tenant_id, role, password_hash, is_active.
 *      كلها إما بيانات اعتماد أو metadata لازمة للجلسة — لا شخصية.
 *   2. الاستجابة لا تكشف وجود الحساب — 0 صفوف لبريد غير موجود، لكن
 *      auth/session.ts يفرض توقيتاً ثابتاً بمقارنة hash وهمي.
 *   3. auth_lookup: NOLOGIN NOSUPERUSER NOBYPASSRLS + سياسة SELECT-فقط
 *      على users فقط (لا صلاحية على أيّ جدول آخر).
 *   4. `SET search_path = pg_catalog, public` — يمنع اختطاف المسار.
 *
 * تعديلات users:
 *   • UNIQUE(email) عالمياً (بدل tenant-scoped) — يدعم مسار مستقبلي
 *     للعضوية الجمعية بلا refactor إضافي.
 *   • last_login_at, is_active جديدَان.
 *
 * login_attempts:
 *   • **الاستثناء الوحيد بلا RLS** — عابر للمستأجرين بطبعه.
 *   • user_id قبل email في ترتيب الأعمدة: تفضيل التسجيل بـid على
 *     البريد الخام يقلّل تعداد الحسابات من السجل نفسه.
 *   • GRANT INSERT + SELECT فقط لـapp_user — لا DELETE ولا UPDATE.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ═══════════════════════════════════════════════════════════════
  //  1. users — UNIQUE(email) عالمياً + is_active + last_login_at
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    -- إسقاط UNIQUE(tenant_id, email) لصالح UNIQUE(email) عالمياً.
    -- لا بيانات، آمن.
    ALTER TABLE users DROP CONSTRAINT users_tenant_id_email_key;
    CREATE UNIQUE INDEX users_email_unique ON users(email);

    ALTER TABLE users ADD COLUMN last_login_at timestamptz;
    ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  `);

  // ═══════════════════════════════════════════════════════════════
  //  2. password_reset_tokens — RLS+FORCE كباقي الجداول
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE password_reset_tokens (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash    text NOT NULL,
      expires_at    timestamptz NOT NULL,
      used_at       timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX password_reset_tokens_tenant_id_idx
      ON password_reset_tokens(tenant_id);
    CREATE INDEX password_reset_tokens_user_id_idx
      ON password_reset_tokens(user_id);
    -- رمز نشط واحد لكل مستخدم في لحظة (فهرس فريد جزئي).
    CREATE UNIQUE INDEX password_reset_tokens_active_per_user
      ON password_reset_tokens(user_id)
      WHERE used_at IS NULL;

    ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
    ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
    CREATE POLICY password_reset_tokens_tenant_isolation
      ON password_reset_tokens
      FOR ALL
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  `);

  // ═══════════════════════════════════════════════════════════════
  //  3. login_attempts — الاستثناء الوحيد بلا RLS (موثَّق)
  //
  //  ترتيب الأعمدة: user_id قبل email — يفضّل التسجيل بالمعرّف على
  //  البريد الخام. عند login بحساب معروف: user_id مأخوذ + email NULL.
  //  عند login ببريد مفقود: user_id NULL + email محفوظ (لـrate limit).
  //  الأثر: DB compromise يكشف محاولات فاشلة على «بريد X» فقط حين
  //  البريد لم يوجد في users — يقلّل سطح تعداد الحسابات.
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE login_attempts (
      id             bigserial PRIMARY KEY,
      user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
      email          citext,
      ip_address     inet,
      success        boolean NOT NULL,
      attempted_at   timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX login_attempts_user_id_time_idx
      ON login_attempts(user_id, attempted_at DESC)
      WHERE user_id IS NOT NULL;
    CREATE INDEX login_attempts_email_time_idx
      ON login_attempts(email, attempted_at DESC)
      WHERE email IS NOT NULL;
    CREATE INDEX login_attempts_ip_time_idx
      ON login_attempts(ip_address, attempted_at DESC)
      WHERE ip_address IS NOT NULL;

    COMMENT ON TABLE login_attempts IS
      'استثناء موثّق بلا RLS. سجلّ محاولات دخول عابر للمستأجرين لحماية rate-limit. user_id قبل email لتقليل تعداد الحسابات. GRANT INSERT+SELECT فقط لـapp_user.';

    -- app_user يقرأ+يكتب فقط. لا DELETE ولا UPDATE (السجلّ محمي من التلاعب).
    REVOKE ALL ON TABLE login_attempts FROM app_user;
    GRANT INSERT, SELECT ON TABLE login_attempts TO app_user;
    GRANT USAGE ON SEQUENCE login_attempts_id_seq TO app_user;
  `);

  // ═══════════════════════════════════════════════════════════════
  //  4. سياسة auth_lookup على users
  //
  //  auth_lookup يستطيع SELECT على users بلا قيد مستأجر — عبر الدالة
  //  فقط (NOLOGIN فلا اتصال مباشر ممكن).
  //  **لا صلاحية أخرى** — لا SELECT على brand_kits أو أيّ جدول آخر.
  //  G-P4-2 يتحقّق صراحةً أن الدور لا يستطيع قراءة brand_kits.
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    GRANT SELECT ON TABLE users TO auth_lookup;
    CREATE POLICY users_auth_lookup ON users
      FOR SELECT
      TO auth_lookup
      USING (true);
  `);

  // ═══════════════════════════════════════════════════════════════
  //  5. find_user_by_email(citext) — SECURITY DEFINER الوحيد
  //
  //  الحقول المُعادة (بيانات اعتماد + metadata لازمة، لا PII):
  //    • user_id       — للجلسة
  //    • tenant_id     — للـSET LOCAL بعد التحقّق (single-tenant الآن؛
  //                       عند تفعيل العضوية الجمعية يُستبدل بـmemberships)
  //    • role          — لـJWT claim
  //    • password_hash — لـargon2 verify
  //    • is_active     — لرفض الحسابات المعطّلة
  //
  //  **حقول ممنوعة** (PII): email (المتّصل يعرفه أصلاً)، name، phone،
  //  أيّ حقل شخصي. أيّ إضافة تحتاج مراجعة أمنية.
  //
  //  search_path = pg_catalog, public — يمنع اختطاف المسار (لو أنشأ
  //  مستخدم دالة/جدولاً باسم users في schema يسبق public).
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE FUNCTION find_user_by_email(p_email citext)
    RETURNS TABLE(
      user_id        uuid,
      tenant_id      uuid,
      role           text,
      password_hash  text,
      is_active      boolean
    )
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = pg_catalog, public
    AS $$
      SELECT id, tenant_id, role, password_hash, is_active
      FROM users
      WHERE email = p_email
      LIMIT 1;
    $$;

    COMMENT ON FUNCTION find_user_by_email(citext) IS
      'SECURITY DEFINER الوحيد. يبحث عن مستخدم بالبريد cross-tenant لـlogin. يعمل بصلاحيات auth_lookup — سياسة users_auth_lookup تسمح بـSELECT فقط. لا PII في المُعاد.';

    -- REVOKE + GRANT قبل نقل الملكية (migration_user لا يزال owner فيقدر).
    -- بعد ALTER OWNER يفقد migration_user حق تعديل صلاحيات الدالة.
    REVOKE ALL ON FUNCTION find_user_by_email(citext) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION find_user_by_email(citext) TO app_user;

    -- نقل الملكية أخيراً — SECURITY DEFINER يعمل بصلاحيات auth_lookup.
    ALTER FUNCTION find_user_by_email(citext) OWNER TO auth_lookup;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`REVOKE EXECUTE ON FUNCTION find_user_by_email(citext) FROM app_user`);
  pgm.sql(`DROP FUNCTION IF EXISTS find_user_by_email(citext)`);
  pgm.sql(`DROP POLICY IF EXISTS users_auth_lookup ON users`);
  pgm.sql(`REVOKE SELECT ON TABLE users FROM auth_lookup`);
  pgm.sql(`DROP TABLE IF EXISTS login_attempts CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS password_reset_tokens CASCADE`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_active`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS last_login_at`);
  pgm.sql(`DROP INDEX IF EXISTS users_email_unique`);
  pgm.sql(`ALTER TABLE users ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email)`);
}
