/**
 * A20 — Revisions: triggers على القاعدة تكتب سجل تلقائياً.
 *
 * ── النمط (docs/17 §A20) ────────────────────────────
 * كل INSERT/UPDATE/DELETE على 5 جداول (brand_kits · projects · templates
 * · users · assets) يُنشئ صفّ revisions:
 *   - resource_type ∈ ('brand_kit'|'project'|'template'|'user'|'asset')
 *   - resource_id = NEW.id (أو OLD.id لـDELETE)
 *   - actor_id = NULLIF(current_setting('app.actor_id',true),'')::uuid
 *   - action ∈ ('create'|'update'|'delete') من TG_OP
 *   - snapshot = to_jsonb(NEW) للـcreate/update، to_jsonb(OLD) للـdelete
 *
 * ** app.actor_id GUC جديد **
 * يُضبَط من auth-guard في mk-api بجانب app.tenant_id. الدالة
 * `app_set_actor(uuid)` تُضاف. إن لم يُضبَط، actor_id يبقى NULL
 * (system-triggered كـmigrations أو worker).
 *
 * ** ملاحظة تنظيم **
 * تعديل revisions تفسيره «سجل السجل» — نتجاهل عملياً بعدم تركيب
 * trigger على revisions نفسها.
 *
 * ** app_set_tenant وسّع أم منفصل؟ **
 * منفصل — يستعمله caller قبل أوّل استعلام. app_set_actor عليك
 * وحدك (يجوز عدم ضبطها لعمليات النظام).
 *
 * ** ينشط الآن كل INSERT للجداول الخمسة يخلق revision **
 * صيغة `INSERT INTO projects...` من verify scripts ستُنتج revision.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── دالة app_set_actor(uuid) ─────────────────────────
  pgm.sql(`
    CREATE FUNCTION app_set_actor(p_actor_id uuid)
      RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.actor_id', COALESCE(p_actor_id::text, ''), true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);
  pgm.sql(`REVOKE ALL ON FUNCTION app_set_actor(uuid) FROM PUBLIC`);
  pgm.sql(`GRANT EXECUTE ON FUNCTION app_set_actor(uuid) TO app_user`);
  pgm.sql(`GRANT EXECUTE ON FUNCTION app_set_actor(uuid) TO migration_user`);

  // ── دالة log_revision — trigger عام لخمس جداول ──────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text;
      v_action text;
      v_res_id uuid;
      v_snapshot jsonb;
    BEGIN
      -- resource_type من اسم الجدول (singular)
      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit'
        WHEN 'projects'   THEN 'project'
        WHEN 'templates'  THEN 'template'
        WHEN 'users'      THEN 'user'
        WHEN 'assets'     THEN 'asset'
        ELSE TG_TABLE_NAME
      END;

      IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_res_id := NEW.id;
        v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_res_id := NEW.id;
        v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_res_id := OLD.id;
        v_snapshot := to_jsonb(OLD);
      END IF;

      -- tenant_id: من NEW/OLD إن وُجد. users فقط قد ينقصه (users.tenant_id موجود).
      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (
        COALESCE((v_snapshot->>'tenant_id')::uuid,
                 NULLIF(current_setting('app.tenant_id', true), '')::uuid),
        v_type, v_res_id, v_actor, v_action, v_snapshot
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);

  // ── تركيب المُشغِّلات على الجداول الخمسة ─────────────
  for (const table of ['brand_kits', 'projects', 'templates', 'users', 'assets']) {
    pgm.sql(`
      CREATE TRIGGER ${table}_log_revision
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION log_revision()
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const table of ['brand_kits', 'projects', 'templates', 'users', 'assets']) {
    pgm.sql(`DROP TRIGGER IF EXISTS ${table}_log_revision ON ${table}`);
  }
  pgm.sql(`DROP FUNCTION IF EXISTS log_revision()`);
  pgm.sql(`DROP FUNCTION IF EXISTS app_set_actor(uuid)`);
}
