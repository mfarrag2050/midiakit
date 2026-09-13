/**
 * 200-EXPORT-HISTORY — سجلّ التصديرات لكلّ مستأجر.
 *
 * جدول `exports` — record log لكلّ render يصل حالة نهائيّة
 * (succeeded/failed). يُملأ آليّاً بـtrigger على `renders` — لا caller
 * يستطيع تجاوزه (نفس النمط 160 · موضع واحد).
 *
 * ── الحقول (شرط §١) ──
 *   id (uuid PK) · tenant_id (FK CASCADE) · user_id (FK SET NULL)
 *   render_id (FK CASCADE) · brand_kit_id (nullable) · template_id (nullable)
 *   size + format + storage_key + size_bytes + created_at
 *   status ('succeeded'|'failed') + error_code (nullable)
 *
 * ── متى يُكتَب (شرط §٢) ──
 * trigger AFTER UPDATE على renders — عند تحوّل status إلى succeeded أو
 * failed. النجاح والفشل كلاهما → صفّ. «صمتٌ يُقرأ نجاحاً» ممنوع بنيويّاً.
 *
 * ── العزل ──
 * RLS مطابق لـrenders: tenant_isolation + control_plane_all.
 * app_user + control_plane_user لهما SELECT · لا INSERT/UPDATE/DELETE
 * (السجلّ يُكتب فقط من trigger).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── (1) الجدول ────────────────────────────────
  pgm.sql(`
    CREATE TABLE exports (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
      render_id      uuid NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
      brand_kit_id   uuid,
      template_id    uuid,
      size           text NOT NULL,
      format         text NOT NULL,
      storage_key    text,
      size_bytes     bigint,
      status         text NOT NULL CHECK (status IN ('succeeded', 'failed')),
      error_code     text,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX ix_exports_tenant_created ON exports (tenant_id, created_at DESC)`);
  pgm.sql(`CREATE INDEX ix_exports_render ON exports (render_id)`);

  // ── (2) RLS + منح ──────────────────────────────
  pgm.sql(`ALTER TABLE exports ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE exports FORCE ROW LEVEL SECURITY`);

  pgm.sql(`
    CREATE POLICY exports_tenant_isolation ON exports AS PERMISSIVE FOR ALL TO public
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  `);
  pgm.sql(`
    CREATE POLICY exports_control_plane_all ON exports AS PERMISSIVE FOR ALL TO public
      USING (CURRENT_USER = 'control_plane_user'::name)
      WITH CHECK (CURRENT_USER = 'control_plane_user'::name)
  `);
  pgm.sql(`
    CREATE POLICY migration_user_all_exports ON exports AS PERMISSIVE FOR ALL TO migration_user
      USING (true) WITH CHECK (true)
  `);

  pgm.sql(`GRANT SELECT ON exports TO app_user`);
  pgm.sql(`GRANT SELECT ON exports TO control_plane_user`);
  pgm.sql(`GRANT DELETE ON exports TO control_plane_user`); // للـhard-delete tenant (151)
  pgm.sql(`GRANT SELECT, INSERT ON exports TO migration_user`);

  // ── (3) trigger على renders ─────────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION renders_write_export_log() RETURNS trigger AS $$
    DECLARE
      v_bk_id uuid;
      v_tpl_id uuid;
    BEGIN
      -- نكتب فقط عند التحوّل إلى succeeded أو failed (لا من status نهائيّ
      -- إلى آخر · لا في INSERT · لا في UPDATE ضمنيّ بلا تغيير status).
      IF NEW.status NOT IN ('succeeded', 'failed') THEN
        RETURN NEW;
      END IF;
      IF OLD.status = NEW.status THEN
        RETURN NEW;
      END IF;

      -- نستخلص brand_kit_id + template_id من project (nullable safe)
      SELECT p.brand_kit_id, p.template_id INTO v_bk_id, v_tpl_id
      FROM projects p WHERE p.id = NEW.project_id;

      INSERT INTO exports(
        tenant_id, user_id, render_id, brand_kit_id, template_id,
        size, format, storage_key, size_bytes, status, error_code
      ) VALUES (
        NEW.tenant_id, NEW.requested_by, NEW.id, v_bk_id, v_tpl_id,
        NEW.size, NEW.format, NEW.output_storage_key,
        NULL, -- size_bytes يُملأ لاحقاً إن أضفنا فحص حجم في worker
        NEW.status, NEW.error_code
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);

  pgm.sql(`
    CREATE TRIGGER renders_write_export_log_trg
      AFTER UPDATE ON renders
      FOR EACH ROW EXECUTE FUNCTION renders_write_export_log()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TRIGGER IF EXISTS renders_write_export_log_trg ON renders`);
  pgm.sql(`DROP FUNCTION IF EXISTS renders_write_export_log()`);
  pgm.sql(`DROP INDEX IF EXISTS ix_exports_render`);
  pgm.sql(`DROP INDEX IF EXISTS ix_exports_tenant_created`);
  pgm.sql(`DROP TABLE IF EXISTS exports`);
}
