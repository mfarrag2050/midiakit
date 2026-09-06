/**
 * A18.5 fix — trigger log_revision يحدّد tenant_id بشكل مستقلّ.
 *
 * السياق: 20260907140000 أضاف tenants إلى log_revision. عند INSERT
 * tenant من signup: app.tenant_id لم يُضبَط بعد (المستأجر يُنشأ الآن).
 * تعبير COALESCE يعود NULL، فيسقط بـRLS على revisions
 * (revisions_tenant_isolation يشترط تطابق tenant_id).
 *
 * الحل: SET LOCAL app.tenant_id = NEW.id مؤقّتاً داخل الـtrigger
 * قبل INSERT عندما resource_type='tenant'. الـtrigger SECURITY DEFINER
 * يستطيع set_config.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text; v_action text; v_res_id uuid; v_snapshot jsonb; v_tenant uuid;
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
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;

      -- tenant_id resolution:
      -- tenants → NEW.id/OLD.id (المستأجر نفسه)
      -- others  → snapshot->tenant_id ، وإلا app.tenant_id GUC
      IF TG_TABLE_NAME = 'tenants' THEN
        v_tenant := v_res_id;
        -- SET LOCAL لتجاوز RLS على revisions (يشترط tenant_id مطابق GUC)
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
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // reverse يُعاد إلى نسخة 20260907140000 يدوياً إن لزم — نتركه كما هو
}
