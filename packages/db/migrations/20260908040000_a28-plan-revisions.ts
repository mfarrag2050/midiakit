/**
 * A28 — جدول plan_revisions + trigger على plans.
 *
 * السياق: تحرير باقة من لوحة المالك يمسّ كل مستأجريها ويجب أن يُسجَّل.
 * `revisions` القائم يفترض `tenant_id NOT NULL` (RLS) و `plans` جدول
 * عالمي بلا tenant. الحلّ الأنظف: جدول منفصل `plan_revisions` تحت
 * حماية control_plane_all حصراً — فصل قانوني معنويّ صحيح (تدقيق منصّة
 * ≠ تدقيق مستأجر).
 *
 * القيود:
 *   - FORCE RLS + policy control_plane_all
 *   - control_plane_user: DELETE/INSERT/SELECT/UPDATE
 *   - app_user: صفر منح (كما platform_users)
 *   - trigger `plans_log_platform_revision` AFTER INSERT/UPDATE/DELETE ON plans
 *   - actor_id nullable (نظير revisions.actor_id — INSERT من bootstrap
 *     الأوّل بلا platform user فاعل)
 *
 * check-control-plane-policies + APP_USER_EXPECTED_GRANTS يُحدَّثان في
 * سكربتَي guard (خارج migration).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE plan_revisions (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_key     text NOT NULL,
      actor_id     uuid,                                -- platform_user.id (nullable لـbootstrap)
      action       text NOT NULL CHECK (action IN ('create','update','delete')),
      snapshot     jsonb NOT NULL,                      -- الصفّ الكامل قبل/بعد التغيير
      created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX plan_revisions_plan_key_created_at_idx
      ON plan_revisions(plan_key, created_at DESC);
    CREATE INDEX plan_revisions_actor_id_idx
      ON plan_revisions(actor_id) WHERE actor_id IS NOT NULL;

    ALTER TABLE plan_revisions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plan_revisions FORCE ROW LEVEL SECURITY;

    -- سياسة تسمح لكاتبَي المصدر فقط: control_plane_user (runtime endpoint)
    -- و migration_user (bootstrap seed + هجرات لاحقة). app_user يبقى صفر
    -- منح على مستوى GRANT (أدناه) فلا يصل هذه السياسة أصلاً.
    CREATE POLICY plan_revisions_control_plane_all ON plan_revisions
      USING (CURRENT_USER IN ('control_plane_user', 'migration_user'))
      WITH CHECK (CURRENT_USER IN ('control_plane_user', 'migration_user'));

    -- app_user: **صفر منح** (كما platform_users · platform_sessions)
    GRANT INSERT, UPDATE, DELETE, SELECT ON plan_revisions TO control_plane_user;

    -- ── trigger على plans ─────────────────────────────
    -- نمط A20 log_revision لكن على جدول منفصل بلا tenant_id.
    -- actor_id يُقرأ من app.actor_id (يضبطه platform-auth-guard).
    --
    -- SECURITY INVOKER (الافتراضي) — الدالة تعمل بصلاحيات المُستدعي:
    --   • runtime: control_plane_user (platform endpoint يعدّل plans)
    --   • bootstrap/migration: migration_user (بذر + هجرات لاحقة)
    -- كلاهما مُدرَج في سياسة plan_revisions_control_plane_all.
    CREATE OR REPLACE FUNCTION log_plan_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_action text; v_key text; v_snapshot jsonb;
    BEGIN
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_key := NEW.key; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_key := NEW.key; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_key := OLD.key; v_snapshot := to_jsonb(OLD);
      END IF;

      INSERT INTO plan_revisions(plan_key, actor_id, action, snapshot)
      VALUES (v_key, v_actor, v_action, v_snapshot);
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;

    -- migration_user يحتاج INSERT على plan_revisions أثناء الهجرات التالية
    -- (هجرة hash-recalc تُحدّث plans ⇒ trigger يُطلق INSERT). لا SELECT/
    -- UPDATE/DELETE — الاستعلامات التشغيلية عبر control_plane_user حصراً.
    GRANT INSERT ON plan_revisions TO migration_user;

    CREATE TRIGGER plans_log_platform_revision
      AFTER INSERT OR UPDATE OR DELETE ON plans
      FOR EACH ROW EXECUTE FUNCTION log_plan_revision();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TRIGGER IF EXISTS plans_log_platform_revision ON plans;
    DROP FUNCTION IF EXISTS log_plan_revision();
    DROP TABLE IF EXISTS plan_revisions CASCADE;
  `);
}
