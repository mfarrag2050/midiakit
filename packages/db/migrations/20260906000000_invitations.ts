/**
 * A10 — جدول invitations (docs/16 §4.3).
 *
 * الدعوة كيان مستقل عن user (العقد: «لا يُنشأ فعلياً إلا بعد قبول الدعوة»).
 * يُنشأ صفّ invitations بـtoken_hash + expires_at، ويُستهلَك عند القبول
 * (نقطة القبول خارج A10 — بند مؤجَّل، راجع PHASES-api.md).
 *
 * role: مطابق لـusers.role عدا 'owner' — لا يُدعى مالك ثانٍ. المالك
 *       يُنشأ بـsignup وحده (A5).
 *
 * الفهرس الجزئي: WHERE accepted_at IS NULL (بلا now() — PG يرفض
 * IMMUTABLE non-constant في الفهارس). الانتهاء يُفحص في التطبيق.
 * PENDING_INVITE_EXISTS يُرفض لصفّ نشط فقط؛ صفّ منتهٍ يُستبدَل
 * (invite.ts::DELETE-then-INSERT).
 *
 * grants: SEC-1 Option B — منح صريح لـapp_user. تحديث
 * APP_USER_EXPECTED_GRANTS في verify-isolation.mjs مطلوب.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE invitations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email         citext NOT NULL,
      -- مطابق لـusers.role عدا 'owner' (لا يُدعى مالك ثانٍ — يُنشأ بـsignup).
      role          text NOT NULL CHECK (role IN (
                      'admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer'
                    )),
      token_hash    text NOT NULL,
      invited_by    uuid REFERENCES users(id) ON DELETE SET NULL,
      expires_at    timestamptz NOT NULL,
      accepted_at   timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX invitations_tenant_id_idx ON invitations(tenant_id);
    -- فهرس جزئي بلا now() (PG يرفض IMMUTABLE non-constant).
    -- الانتهاء يُفحص في التطبيق (invite.ts).
    CREATE UNIQUE INDEX invitations_pending_email
      ON invitations(tenant_id, email)
      WHERE accepted_at IS NULL;

    ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
    CREATE POLICY invitations_tenant_isolation ON invitations
      FOR ALL
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    -- SEC-1 Option B: منح صريح (default privileges مُلغَاة).
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE invitations TO app_user;

    -- trigger لـcreated_at ليس مطلوباً (لا updated_at في الجدول).
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS invitations CASCADE`);
}
