/**
 * A27 — مستوى التحكّم: control_plane_user + platform_users/sessions + سياسات.
 *
 * ── الحدّ الثاني ─────────────────────────────────────────────
 * دور جديد `control_plane_user`:
 *   NOSUPERUSER NOBYPASSRLS NOINHERIT LOGIN
 *   يعبر RLS بسياسات صريحة، لا بتجاوز. جدول بلا سياسة control_plane
 *   ⇒ 0 صفوف للمالك (صمت بالانحياز للأمان — L-61 معكوساً بالوعي).
 *
 * ── الجداول الجديدة (منفصلة عن users/sessions) ─────────────
 * platform_users:      identity منفصل تماماً عن tenants
 * platform_sessions:   جلسات المنصّة (لا اختلاط بـsessions للمستأجرين)
 * كلاهما بـFORCE RLS + سياسة تقصر الوصول على control_plane_user.
 *
 * ── منح control_plane_user (تُعلَن + تُختبَر) ──────────────
 * قراءة عبر السياسات على 18 جدولاً tenant-scoped (يرى الكلّ لكل مستأجر).
 * كتابة مقيَّدة:
 *   • plans: DML كامل (إدارة الكتالوج — بديل migration_user لعمليات runtime)
 *   • tenants: UPDATE على العمودَين (plan, plan_overrides) عبر Column-level GRANT
 *   • platform_users, platform_sessions: DML كامل (المجال الخاص)
 * القراءة فقط على الباقي — لا يعدّل بيانات مستأجرين.
 *
 * ── حارس check-control-plane-policies ─────────────────────
 * يقارن جداول public بقائمة معلَنة (`CONTROL_PLANE_EXPECTED_TABLES`
 * في scripts/check-control-plane-policies.mjs)، ويسقط عند جدول
 * بلا سياسة `<table>_control_plane_all`. مضاف إلى سلسلة test.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// 18 جدول tenant-scoped يحتاج سياسة control_plane_user
const TENANT_TABLES = [
  'tenants', 'users', 'sessions', 'brand_kits', 'templates',
  'assets', 'workflows', 'projects', 'project_state', 'transitions',
  'annotations', 'renders', 'revisions', 'ai_integrations',
  'subscriptions', 'usage', 'password_reset_tokens', 'invitations',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── دور control_plane_user ───────────────────────────
  // مُنشأ في infra/postgres/init/01-roles.sql (bootstrap postgres).
  // migration_user NOCREATEROLE — لا يستطيع CREATE ROLE هنا.
  // بيئات جديدة (fresh docker init) تحصل عليه مباشرة. البيئات القائمة
  // تحتاج db:reset لمرة واحدة (dev only، prod بلا مشكلة).
  //
  // نتحقّق أن الدور موجود قبل استعماله:
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'control_plane_user') THEN
        RAISE EXCEPTION 'control_plane_user role missing — run db:reset (init/01-roles.sql updated for A27)';
      END IF;
    END $$
  `);

  // ── platform_users ───────────────────────────────────
  pgm.sql(`
    CREATE TABLE platform_users (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email          citext NOT NULL UNIQUE,
      password_hash  text NOT NULL,
      platform_role  text NOT NULL CHECK (platform_role IN ('owner', 'admin', 'viewer')),
      is_active      boolean NOT NULL DEFAULT true,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE TRIGGER platform_users_set_updated_at BEFORE UPDATE ON platform_users
           FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  // ── platform_sessions ─────────────────────────────────
  pgm.sql(`
    CREATE TABLE platform_sessions (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      platform_user_id  uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      refresh_token_hash text NOT NULL UNIQUE,
      user_agent        text,
      ip_address        inet,
      is_active         boolean NOT NULL DEFAULT true,
      expires_at        timestamptz NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      last_used_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX platform_sessions_user_id_idx ON platform_sessions(platform_user_id)`);

  // ── FORCE RLS على المنصّة ──────────────────────────
  for (const t of ['platform_users', 'platform_sessions']) {
    pgm.sql(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    pgm.sql(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    pgm.sql(`
      CREATE POLICY ${t}_control_plane_all ON ${t}
        FOR ALL
        USING (current_user = 'control_plane_user')
        WITH CHECK (current_user = 'control_plane_user')
    `);
  }
  // GRANT DML كامل لـcontrol_plane_user على جداول المنصّة
  for (const t of ['platform_users', 'platform_sessions']) {
    pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO control_plane_user`);
  }
  // app_user + auth_lookup + migration_user لا يحصلون على شيء على platform_*
  // (صراحةً — لا نضيف grants لهم)

  // ── سياسات control_plane_user على 18 جدولاً tenant-scoped ─
  // كل جدول يحصل على policy إضافية تسمح بالكل لـcontrol_plane_user.
  // لا تُعطّل السياسات الموجودة — تُضاف بجانبها. PostgreSQL يقيّم OR بينها.
  for (const t of TENANT_TABLES) {
    pgm.sql(`
      CREATE POLICY ${t}_control_plane_all ON ${t}
        FOR ALL
        USING (current_user = 'control_plane_user')
        WITH CHECK (current_user = 'control_plane_user')
    `);
  }

  // ── GRANTs لـcontrol_plane_user ──────────────────────
  // قراءة على كل جداول المستأجرين + revisions (للتحقيق)
  for (const t of TENANT_TABLES) {
    pgm.sql(`GRANT SELECT ON ${t} TO control_plane_user`);
  }
  // Column-level UPDATE على tenants — فقط plan + plan_overrides
  pgm.sql(`GRANT UPDATE (plan, plan_overrides) ON tenants TO control_plane_user`);
  // Full DML على plans (إدارة الكتالوج من runtime)
  pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON plans TO control_plane_user`);
  // plans policies: أضِف policies لـcontrol_plane_user
  pgm.sql(`
    CREATE POLICY plans_control_plane_write ON plans
      FOR ALL
      USING (current_user = 'control_plane_user')
      WITH CHECK (current_user = 'control_plane_user')
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const t of TENANT_TABLES) {
    pgm.sql(`DROP POLICY IF EXISTS ${t}_control_plane_all ON ${t}`);
  }
  pgm.sql(`DROP POLICY IF EXISTS plans_control_plane_write ON plans`);
  pgm.sql(`DROP TABLE IF EXISTS platform_sessions`);
  pgm.sql(`DROP TABLE IF EXISTS platform_users`);
  pgm.sql(`DROP OWNED BY control_plane_user`);
  pgm.sql(`DROP ROLE IF EXISTS control_plane_user`);
}
