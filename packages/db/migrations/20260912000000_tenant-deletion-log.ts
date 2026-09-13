/**
 * 151-TENANT-DELETE-BUILD — يفتح باب حذف المستأجر الذي أغلقه سجلّ التدقيق نفسه.
 *
 * ── العطب الذي نُغلقه ──────────────────────────────
 * `tenants_log_revision` (migration 20260907140000) يفعّل `log_revision()`
 * عند حذف tenant، والدالّة تُنشئ صفّ revisions بـ`tenant_id = OLD.id`.
 * لكنّ `revisions_tenant_id_fkey` (revisions → tenants) يفشل لأنّ الصفّ
 * محذوف بالفعل عند اللحظة، فتُرجَع المعاملة كلّها → **حذف المستأجر
 * مستحيل بأمر واحد اليوم**. صنف واحد (اكتُشف في 130 · وصف في 150).
 *
 * ── الحلّ ────────────────────────────────────────────
 * 1. جدول جديد `tenant_deletion_log` — بلا FK إلى `tenants`. أثر الحذف
 *    يبقى بعد ذهاب المستأجر. **سجلّ لا يمحو أثره** (شرط 151).
 * 2. `log_revision()` يقفز عن DELETE على tenants — الحذف الآن يُسجَّل
 *    صريحاً عبر endpoint في `tenant_deletion_log` (actor + reason + snapshot).
 *    UPDATE/INSERT على tenants يبقيان يسجَّلان في revisions كما هما.
 * 3. الـtrigger نفسه يبقى — لا `DISABLE TRIGGER` ولا `session_replication_role`.
 *
 * ── سلوك log_revision بعد هذا التعديل ────────────────
 *   • INSERT على أيّ من الستّة (tenants + 5) → revisions.
 *   • UPDATE على أيّ من الستّة → revisions.
 *   • DELETE على الخمسة (users/assets/brand_kits/projects/templates) → revisions
 *     (يشير إلى tenant قائم بعد · FK يمرّ).
 *   • DELETE على tenants → لا شيء (`RETURN OLD`) — الحذف يُسجَّل في
 *     tenant_deletion_log عبر endpoint قبل DELETE (خارج trigger).
 *
 * ── L-46 (اختبار حياة · شرط 151) ──────────────────────
 *   1. أنشئ مستأجراً بأصول + hيّات + لقطات.
 *   2. `POST /v1/platform/tenants/:id/hard-delete`.
 *   3. تحقّق:
 *      - كل الجداول tenant-scoped → 0 صفوف للمستأجر.
 *      - `tenant_deletion_log` → 1 صفّ يذكر الاسم/الوقت/الذي حذف.
 *      - storage prefix → 0 objects.
 *
 * ── لا لمس لملكيّة mk ──────────────────────────────
 * جدول جديد + تعديل دالّة PL/pgSQL موجودة — كلاهما في packages/db (mkapi).
 * لا تعديل في packages/{engine,shared,templates}.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── (1) جدول tenant_deletion_log ─────────────────────
  // بلا FK إلى tenants (بالتصميم) — يبقى بعد الحذف.
  pgm.sql(`
    CREATE TABLE tenant_deletion_log (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL,
      tenant_name   text NOT NULL,
      deleted_by    uuid,
      deletion_type text NOT NULL CHECK (deletion_type IN ('hard')),
      reason        text,
      deleted_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX ix_tenant_deletion_log_tenant_id ON tenant_deletion_log (tenant_id)`);
  pgm.sql(`CREATE INDEX ix_tenant_deletion_log_deleted_at ON tenant_deletion_log (deleted_at DESC)`);

  // منح — control_plane_user يقرأ ويكتب (platform admin).
  // app_user لا يمسّه (خارج نطاق المستأجر — بيانات منصّة).
  pgm.sql(`GRANT SELECT, INSERT ON tenant_deletion_log TO control_plane_user`);
  pgm.sql(`GRANT SELECT, INSERT ON tenant_deletion_log TO migration_user`);

  // ── (1·b) DELETE grants لـcontrol_plane_user على tenants + children ──
  // hard-delete endpoint يعمل عبر platformDbClient = control_plane_user.
  // CASCADE يمسح 19 جدولاً — كلّها تحتاج DELETE grant للـuser الذي يستدعي.
  const cpDeleteTables = [
    'tenants',
    'users', 'sessions', 'brand_kits', 'templates',
    'assets', 'workflows', 'projects', 'project_state', 'transitions',
    'annotations', 'renders', 'revisions', 'ai_integrations',
    'subscriptions', 'usage', 'password_reset_tokens', 'invitations',
    'checkout_sessions', 'license_acks', 'plan_revisions',
  ];
  for (const t of cpDeleteTables) {
    pgm.sql(`GRANT DELETE ON ${t} TO control_plane_user`);
  }

  // ── (2) تعديل log_revision للقفز عن DELETE على tenants ──
  // مهمّ: نحافظ على set_config من 20260907150000_a18-5-trigger-fix — بلا
  // هذا السطر signup يفشل (INSERT tenants قبل GUC؛ trigger يحاول
  // INSERT revisions بـtenant_id جديد؛ RLS يرفض لأنّ GUC لم يُضبَط بعد).
  // إضافتنا الوحيدة: early return عند DELETE على tenants.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text; v_action text; v_res_id uuid; v_snapshot jsonb; v_tenant uuid;
    BEGIN
      -- 151: DELETE على tenants يُسجَّل صريحاً في tenant_deletion_log عبر
      -- endpoint المنصّة قبل الحذف. الـtrigger لا يستطيع كتابة revisions
      -- بـtenant_id = OLD.id لأنّ FK يفشل (المستأجر محذوف). نقفز.
      IF TG_TABLE_NAME = 'tenants' AND TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit'
        WHEN 'projects'   THEN 'project'
        WHEN 'templates'  THEN 'template'
        WHEN 'users'      THEN 'user'
        WHEN 'assets'     THEN 'asset'
        WHEN 'tenants'    THEN 'tenant'
        ELSE TG_TABLE_NAME
      END;
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;

      -- tenant_id resolution + set_config لتجاوز RLS (من 20260907150000):
      IF TG_TABLE_NAME = 'tenants' THEN
        v_tenant := v_res_id;
        PERFORM set_config('app.tenant_id', v_res_id::text, true);
      ELSE
        v_tenant := COALESCE(
          (v_snapshot->>'tenant_id')::uuid,
          NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
      END IF;

      -- 151: CASCADE أثناء hard-delete يحذف tenant أوّلاً ثمّ الأبناء.
      -- trigger على child يحاول INSERT revisions(tenant_id) — لكنّ tenant
      -- محذوف · FK يرمي. الحرس: لا INSERT إن غاب parent (الحذف يُسجَّل
      -- صريحاً في tenant_deletion_log عبر endpoint · لا فقدان أثر).
      IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (v_tenant, v_type, v_res_id, v_actor, v_action, v_snapshot);
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // نُعيد log_revision إلى نسخة 20260907150000 (set_config محفوظ · بلا قفز DELETE).
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type text; v_action text; v_res_id uuid; v_snapshot jsonb; v_tenant uuid;
    BEGIN
      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit' WHEN 'projects' THEN 'project'
        WHEN 'templates' THEN 'template' WHEN 'users' THEN 'user'
        WHEN 'assets' THEN 'asset' WHEN 'tenants' THEN 'tenant'
        ELSE TG_TABLE_NAME
      END;
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;
      IF TG_TABLE_NAME = 'tenants' THEN
        v_tenant := v_res_id;
        PERFORM set_config('app.tenant_id', v_res_id::text, true);
      ELSE
        v_tenant := COALESCE(
          (v_snapshot->>'tenant_id')::uuid,
          NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
      END IF;
      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (v_tenant, v_type, v_res_id, v_actor, v_action, v_snapshot);
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);
  pgm.sql(`DROP INDEX IF EXISTS ix_tenant_deletion_log_deleted_at`);
  pgm.sql(`DROP INDEX IF EXISTS ix_tenant_deletion_log_tenant_id`);
  pgm.sql(`DROP TABLE IF EXISTS tenant_deletion_log`);
}
