/**
 * A21 — جدول checkout_sessions لتخزين نتائج POST /v1/subscription/checkout.
 *
 * الحاجة: Idempotency-Key يجب أن يعيد نفس checkoutUrl عند التكرار خلال TTL.
 * وسيلة التخزين هذه هي DB لا Redis — لأن الجلسة تعود دائماً بنفس URL حرفياً،
 * وTTL معقول (≤ 24 ساعة) على مستأجر واحد بلا ضغط.
 *
 * RLS + FORCE + control_plane_all (نمط A26 · A27).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE checkout_sessions (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      idempotency_key   text,
      target_plan       text NOT NULL REFERENCES plans(key) ON DELETE RESTRICT,
      billing_cycle     text NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
      checkout_url      text NOT NULL,
      expires_at        timestamptz NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      created_by        uuid
    );
    CREATE UNIQUE INDEX checkout_sessions_tenant_idem_unique
      ON checkout_sessions(tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX checkout_sessions_tenant_id_idx ON checkout_sessions(tenant_id);

    ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE checkout_sessions FORCE ROW LEVEL SECURITY;

    CREATE POLICY checkout_sessions_tenant_isolation ON checkout_sessions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    CREATE POLICY checkout_sessions_control_plane_all ON checkout_sessions
      USING (CURRENT_USER = 'control_plane_user')
      WITH CHECK (CURRENT_USER = 'control_plane_user');

    GRANT SELECT, INSERT, UPDATE, DELETE ON checkout_sessions TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON checkout_sessions TO control_plane_user;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS checkout_sessions CASCADE;`);
}
