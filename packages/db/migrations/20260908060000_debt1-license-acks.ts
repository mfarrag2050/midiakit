/**
 * DEBT-1 §3 — جدول license_acks (append-only).
 *
 * السياق: إقرار ترخيص خط أو شعار كان علماً في `brand_kits.config`
 * (fonts.primary.licenseAck + attribution.logoAcks.*.licenseAck) مع
 * `ackBy` و `ackAt` قابلَين للتعديل بـPATCH. **المُقرّ يستطيع تزوير
 * إقراره.** وهو دليل مسؤولية قانونية عن خطّ مرخَّص تجارياً.
 *
 * الحلّ: جدول ملحق فقط (append-only):
 *   • app_user: INSERT + SELECT فقط (لا UPDATE، لا DELETE)
 *   • FORCE RLS + tenant_isolation + control_plane_all
 *   • ip_address اختياري (يُسجَّل حين يتوفّر)
 *   • علم `licenseAck` في config يبقى للقراءة السريعة، السجلّ الدليل
 *
 * L-46 اختبار وجود: UPDATE على صفّ ⇒ يُرفض من GRANT (42501).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE license_acks (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      brand_kit_id   uuid NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
      kind           text NOT NULL CHECK (kind IN ('font','logo')),
      -- للـfont: family. للـlogo: platform key (x, tiktok, ...).
      subject        text NOT NULL,
      ack_by         uuid NOT NULL,       -- users.id (nullable FK — user قد يُحذف)
      ack_at         timestamptz NOT NULL DEFAULT now(),
      ip_address     inet,                -- اختياري (خلف proxy قد لا يتوفّر بدقة)
      notes          text,
      created_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX license_acks_tenant_kit_idx
      ON license_acks(tenant_id, brand_kit_id, kind, subject, ack_at DESC);
    -- لا FK على ack_by (users) لأن حذف user لا يجب أن يحذف السجلّ.

    ALTER TABLE license_acks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE license_acks FORCE ROW LEVEL SECURITY;

    CREATE POLICY license_acks_tenant_isolation ON license_acks
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    CREATE POLICY license_acks_control_plane_all ON license_acks
      USING (CURRENT_USER = 'control_plane_user')
      WITH CHECK (CURRENT_USER = 'control_plane_user');

    -- **append-only**: INSERT + SELECT فقط. لا UPDATE، لا DELETE.
    -- محاولة تحرير الصفّ من app_user ⇒ 42501 (permission denied) من GRANT،
    -- حتى قبل الوصول إلى RLS. اختبار وجود L-46.
    GRANT INSERT, SELECT ON license_acks TO app_user;
    GRANT INSERT, SELECT, UPDATE, DELETE ON license_acks TO control_plane_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS license_acks CASCADE;`);
}
