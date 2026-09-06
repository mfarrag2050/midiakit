/**
 * A18.5 (بند 4) — إضافة tenants إلى log_revision trigger.
 *
 * السياق: A27 (control plane) أتاح للمالك تعديل tenants (plan +
 * plan_overrides). لكن trigger log_revision في A20 مركّب على 5 جداول
 * فقط (brand_kits/projects/templates/users/assets)، فتعديل المالك
 * يمرّ بلا سجلّ.
 *
 * الحل: (1) توسيع CHECK ليقبل 'tenant'  (2) case في log_revision
 * (3) تركيب trigger على tenants.
 *
 * app.actor_id يُضبَط من platform-auth-guard (A27) بمعرّف platform_user.
 * revisions.actor_id سيحمله فيميّز system-triggered عن platform edits.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. توسيع CHECK
  pgm.sql(`ALTER TABLE revisions DROP CONSTRAINT revisions_resource_type_check`);
  pgm.sql(`
    ALTER TABLE revisions ADD CONSTRAINT revisions_resource_type_check
      CHECK (resource_type IN ('brand_kit','project','template','user','asset','tenant'))
  `);

  // 2. تحديث log_revision — إضافة case لـtenants
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text;
      v_action text;
      v_res_id uuid;
      v_snapshot jsonb;
    BEGIN
      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit'
        WHEN 'projects'   THEN 'project'
        WHEN 'templates'  THEN 'template'
        WHEN 'users'      THEN 'user'
        WHEN 'assets'     THEN 'asset'
        WHEN 'tenants'    THEN 'tenant'
        ELSE TG_TABLE_NAME
      END;

      IF TG_OP = 'INSERT' THEN
        v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;

      -- tenants يخزّن tenant_id = id (المستأجر نفسه)
      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (
        CASE WHEN TG_TABLE_NAME = 'tenants' THEN v_res_id
             ELSE COALESCE((v_snapshot->>'tenant_id')::uuid,
                           NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        END,
        v_type, v_res_id, v_actor, v_action, v_snapshot
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);

  // 3. تركيب trigger على tenants
  pgm.sql(`
    CREATE TRIGGER tenants_log_revision
      AFTER INSERT OR UPDATE OR DELETE ON tenants
      FOR EACH ROW EXECUTE FUNCTION log_revision()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TRIGGER IF EXISTS tenants_log_revision ON tenants`);
  // نُعيد log_revision إلى نسخة A20
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text; v_action text; v_res_id uuid; v_snapshot jsonb;
    BEGIN
      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit' WHEN 'projects' THEN 'project'
        WHEN 'templates' THEN 'template' WHEN 'users' THEN 'user'
        WHEN 'assets' THEN 'asset' ELSE TG_TABLE_NAME
      END;
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;
      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (
        COALESCE((v_snapshot->>'tenant_id')::uuid, NULLIF(current_setting('app.tenant_id', true), '')::uuid),
        v_type, v_res_id, v_actor, v_action, v_snapshot
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);
  pgm.sql(`ALTER TABLE revisions DROP CONSTRAINT revisions_resource_type_check`);
  pgm.sql(`
    ALTER TABLE revisions ADD CONSTRAINT revisions_resource_type_check
      CHECK (resource_type IN ('brand_kit','project','template','user','asset'))
  `);
}
