/**
 * المخطط الأولي — كل الجداول تحت مستأجر + RLS + FORCE + السياسات.
 *
 * قواعد ملزمة (ADR-011 + PHASES-api.md §القاعدة الحاكمة):
 *   1. كل جدول يُنشأ في نفس الترحيل مع ENABLE + FORCE + سياسة.
 *      لا جدول يدخل الإنتاج بلا سياسة.
 *   2. app_user المتّصل بلا SUPERUSER وبلا BYPASSRLS — يُختبَر في G-P4-1.
 *   3. app.tenant_id يُقرأ عبر current_setting('app.tenant_id', true)::uuid
 *      الوسيط الثاني true (missing_ok) يعيد NULL بدل الخطأ إن لم يُضبَط،
 *      وسياسة كل جدول ترفض NULL افتراضياً (NULL = uuid → NULL → مُرفَض).
 *
 * الجداول تُغطّي docs/16 §2-§16 و docs/17 §3.1.
 * الأعمدة الدقيقة لكل endpoint تُضاف في migrations لاحقة (A9+).
 *
 * الأدوار (users.role, docs/16 §1.9): owner · admin · writer · editor ·
 * reviewer · approver · viewer.
 *
 * الاستعمال في A5-A8 (المصادقة): SECURITY DEFINER functions لسيناريو
 * signup/login (لا يُبنى هنا — A2 مخطط فقط).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const TIMESTAMPS = `
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
`;

const TENANT_POLICY = (table: string): string => `
  ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
  CREATE POLICY ${table}_tenant_isolation ON ${table}
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ═══════════════════════════════════════════════════════════════
  //  1. tenants — استثناء: لا tenant_id (هو نفسه المستأجر)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE tenants (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name         text NOT NULL,
      plan         text NOT NULL DEFAULT 'trial'
                     CHECK (plan IN ('trial', 'starter', 'pro', 'agency', 'enterprise')),
      locale       text NOT NULL DEFAULT 'ar'
                     CHECK (locale IN ('ar', 'mixed', 'en')),
      ${TIMESTAMPS}
    );

    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

    -- INSERT: مسموح لأي جلسة (signup ينشئ مستأجراً قبل الجلسة).
    -- المسؤولية عن السلوك السليم على endpoint (rate limit + تحقّق).
    CREATE POLICY tenants_insert ON tenants
      FOR INSERT
      WITH CHECK (true);

    -- SELECT/UPDATE/DELETE: مقيّد بالانتماء (app.tenant_id = id).
    CREATE POLICY tenants_select ON tenants
      FOR SELECT
      USING (id = current_setting('app.tenant_id', true)::uuid);

    CREATE POLICY tenants_update ON tenants
      FOR UPDATE
      USING (id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

    CREATE POLICY tenants_delete ON tenants
      FOR DELETE
      USING (id = current_setting('app.tenant_id', true)::uuid);
  `);

  // ═══════════════════════════════════════════════════════════════
  //  2. users — external_id nullable من اليوم الأول (docs/17 §3.2)
  //     password_hash argon2id PHC (نصّ فقط، التحقّق في auth/session.ts)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE users (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      external_id     text UNIQUE,
      email           citext NOT NULL,
      password_hash   text,
      role            text NOT NULL
                        CHECK (role IN ('owner', 'admin', 'writer', 'editor',
                                        'reviewer', 'approver', 'viewer')),
      locale          text NOT NULL DEFAULT 'ar'
                        CHECK (locale IN ('ar', 'mixed', 'en')),
      ${TIMESTAMPS},
      UNIQUE (tenant_id, email)
    );

    CREATE INDEX users_tenant_id_idx ON users(tenant_id);
    ${TENANT_POLICY('users')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  3. sessions — opaque refresh token store (docs/17 §3.2 A5)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE sessions (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash    text NOT NULL,
      user_agent            text,
      ip_address            inet,
      expires_at            timestamptz NOT NULL,
      revoked_at            timestamptz,
      created_at            timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX sessions_tenant_id_idx ON sessions(tenant_id);
    CREATE INDEX sessions_user_id_idx ON sessions(user_id);
    ${TENANT_POLICY('sessions')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  4. brand_kits — docs/03 · docs/16 §5
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE brand_kits (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name            text NOT NULL,
      config          jsonb NOT NULL DEFAULT '{}'::jsonb,
      assets_version  int NOT NULL DEFAULT 1,
      ${TIMESTAMPS}
    );

    CREATE INDEX brand_kits_tenant_id_idx ON brand_kits(tenant_id);
    ${TENANT_POLICY('brand_kits')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  5. templates — docs/16 §6
  //   tenant_id NULLABLE (globals) — سياسة globals تُضاف في A13 seed.
  //   حالياً: RLS يحجب globals حتى تُضاف سياسة قراءة صريحة.
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE templates (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
      scope        text NOT NULL CHECK (scope IN ('global', 'tenant')),
      kind         text NOT NULL,
      name         text NOT NULL,
      definition   jsonb NOT NULL,
      ${TIMESTAMPS},
      CONSTRAINT templates_scope_tenant CHECK (
        (scope = 'global' AND tenant_id IS NULL) OR
        (scope = 'tenant' AND tenant_id IS NOT NULL)
      )
    );

    CREATE INDEX templates_tenant_id_idx ON templates(tenant_id) WHERE tenant_id IS NOT NULL;
    CREATE INDEX templates_scope_idx ON templates(scope);

    ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE templates FORCE ROW LEVEL SECURITY;
    CREATE POLICY templates_tenant_isolation ON templates
      FOR ALL
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  `);

  // ═══════════════════════════════════════════════════════════════
  //  6. assets — docs/16 §9
  //   kind: image · video · audio · font · logo · svg · lottie
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE assets (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      kind            text NOT NULL
                        CHECK (kind IN ('image', 'video', 'audio', 'font',
                                        'logo', 'svg', 'lottie')),
      storage_key     text NOT NULL,
      public_url      text,
      license_ack     boolean NOT NULL DEFAULT false,
      metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
      faces           jsonb,
      finalized_at    timestamptz,
      ${TIMESTAMPS}
    );

    CREATE INDEX assets_tenant_id_idx ON assets(tenant_id);
    CREATE INDEX assets_kind_idx ON assets(tenant_id, kind);
    ${TENANT_POLICY('assets')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  7. workflows — docs/16 §11 · docs/15
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE workflows (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name          text NOT NULL,
      kind          text NOT NULL
                      CHECK (kind IN ('individual', 'small-team', 'full-agency', 'custom')),
      states        jsonb NOT NULL,
      transitions   jsonb NOT NULL,
      is_default    boolean NOT NULL DEFAULT false,
      ${TIMESTAMPS}
    );

    CREATE INDEX workflows_tenant_id_idx ON workflows(tenant_id);
    CREATE UNIQUE INDEX workflows_default_uniq ON workflows(tenant_id)
      WHERE is_default = true;
    ${TENANT_POLICY('workflows')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  8. projects — docs/16 §7
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE projects (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      brand_kit_id   uuid NOT NULL REFERENCES brand_kits(id) ON DELETE RESTRICT,
      template_id    uuid NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
      workflow_id    uuid REFERENCES workflows(id) ON DELETE SET NULL,
      name           text NOT NULL,
      content        jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
      ${TIMESTAMPS}
    );

    CREATE INDEX projects_tenant_id_idx ON projects(tenant_id);
    CREATE INDEX projects_brand_kit_id_idx ON projects(brand_kit_id);
    CREATE INDEX projects_template_id_idx ON projects(template_id);
    ${TENANT_POLICY('projects')}
  `);

  // ═══════════════════════════════════════════════════════════════
  //  9. project_state — سطر واحد لكل مشروع (docs/16 §11.6)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE project_state (
      project_id      uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_id     uuid REFERENCES workflows(id) ON DELETE SET NULL,
      current_state   text NOT NULL,
      assignee_id     uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX project_state_tenant_id_idx ON project_state(tenant_id);
    CREATE INDEX project_state_assignee_id_idx ON project_state(assignee_id);
    ${TENANT_POLICY('project_state')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 10. transitions — سجل تحوّلات الحالة (docs/16 §11.7)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE transitions (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      from_state         text,
      to_state           text NOT NULL,
      transitioned_by    uuid REFERENCES users(id) ON DELETE SET NULL,
      reason             text,
      at                 timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX transitions_tenant_id_idx ON transitions(tenant_id);
    CREATE INDEX transitions_project_id_idx ON transitions(project_id);
    ${TENANT_POLICY('transitions')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 11. annotations — تعليقات موضعية (docs/16 §12)
  //   target: {kind:'layer', layer, segmentIndex}
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE annotations (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      target       jsonb NOT NULL,
      body         text NOT NULL,
      resolved     boolean NOT NULL DEFAULT false,
      author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
      ${TIMESTAMPS}
    );

    CREATE INDEX annotations_tenant_id_idx ON annotations(tenant_id);
    CREATE INDEX annotations_project_id_idx ON annotations(project_id);
    ${TENANT_POLICY('annotations')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 12. renders — docs/16 §8
  //   brand_snapshot يُلتقط ذرّياً عند POST (docs/17 A18). لا يتغيّر.
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE renders (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      size              text NOT NULL,
      format            text NOT NULL CHECK (format IN ('png', 'mp4', 'jpg', 'webp')),
      status            text NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'running', 'succeeded',
                                            'failed', 'canceled')),
      output_storage_key text,
      brand_snapshot    jsonb,
      duration_ms       int,
      error_code        text,
      error_message     text,
      requested_by      uuid REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key   text,
      ${TIMESTAMPS},
      UNIQUE (tenant_id, idempotency_key)
    );

    CREATE INDEX renders_tenant_id_idx ON renders(tenant_id);
    CREATE INDEX renders_project_id_idx ON renders(project_id);
    CREATE INDEX renders_status_idx ON renders(tenant_id, status);
    ${TENANT_POLICY('renders')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 13. revisions — docs/16 §10 · docs/14
  //   نمط عام على خمسة موارد. triggers على الجداول تُضاف في A20.
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE revisions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      resource_type   text NOT NULL
                        CHECK (resource_type IN ('brand_kit', 'project', 'template',
                                                  'user', 'asset')),
      resource_id     uuid NOT NULL,
      actor_id        uuid REFERENCES users(id) ON DELETE SET NULL,
      action          text NOT NULL
                        CHECK (action IN ('create', 'update', 'delete',
                                          'restore', 'reassign')),
      snapshot        jsonb NOT NULL,
      reason          text,
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX revisions_tenant_id_idx ON revisions(tenant_id);
    CREATE INDEX revisions_resource_idx ON revisions(tenant_id, resource_type, resource_id);
    CREATE INDEX revisions_created_at_idx ON revisions(tenant_id, created_at DESC);
    ${TENANT_POLICY('revisions')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 14. ai_integrations — docs/16 §15 (BYO-key، api_key_ref فقط)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE ai_integrations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider      text NOT NULL,
      api_key_ref   text NOT NULL,
      config        jsonb NOT NULL DEFAULT '{}'::jsonb,
      capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
      ${TIMESTAMPS},
      UNIQUE (tenant_id, provider)
    );

    CREATE INDEX ai_integrations_tenant_id_idx ON ai_integrations(tenant_id);
    ${TENANT_POLICY('ai_integrations')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 15. subscriptions — docs/16 §13 (Paddle، حساب واحد لكل مستأجر)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE subscriptions (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                   uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      plan                        text NOT NULL
                                    CHECK (plan IN ('trial', 'starter', 'pro',
                                                    'agency', 'enterprise')),
      status                      text NOT NULL
                                    CHECK (status IN ('active', 'past_due', 'canceled',
                                                      'incomplete', 'trialing')),
      external_customer_id        text,
      external_subscription_id    text,
      current_period_start        timestamptz,
      current_period_end          timestamptz,
      cancel_at                   timestamptz,
      canceled_at                 timestamptz,
      cancel_reason               text,
      ${TIMESTAMPS}
    );

    ${TENANT_POLICY('subscriptions')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // 16. usage — docs/16 §14 (نقطة شهرية لكل مستأجر)
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE TABLE usage (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period            date NOT NULL,
      renders_count     int NOT NULL DEFAULT 0,
      video_seconds     int NOT NULL DEFAULT 0,
      ai_tokens_in      bigint NOT NULL DEFAULT 0,
      ai_tokens_out     bigint NOT NULL DEFAULT 0,
      ${TIMESTAMPS},
      UNIQUE (tenant_id, period)
    );

    CREATE INDEX usage_tenant_id_idx ON usage(tenant_id);
    ${TENANT_POLICY('usage')}
  `);

  // ═══════════════════════════════════════════════════════════════
  // Trigger عام لـupdated_at
  // ═══════════════════════════════════════════════════════════════
  pgm.sql(`
    CREATE FUNCTION set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$;
  `);

  // تطبيق trigger على كل جدول يحمل updated_at
  const tablesWithUpdatedAt = [
    'tenants', 'users', 'brand_kits', 'templates', 'assets', 'workflows',
    'projects', 'annotations', 'renders', 'ai_integrations', 'subscriptions',
    'usage',
  ];
  for (const table of tablesWithUpdatedAt) {
    pgm.sql(`
      CREATE TRIGGER ${table}_set_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
    `);
  }
  // project_state له updated_at خاص (بلا created_at)
  pgm.sql(`
    CREATE TRIGGER project_state_set_updated_at
      BEFORE UPDATE ON project_state
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // ترتيب DROP معكوس (FKs). CASCADE على tenants يمسح كل شيء تحته.
  pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at() CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS usage CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS subscriptions CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS ai_integrations CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS revisions CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS renders CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS annotations CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS transitions CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS project_state CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS projects CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS workflows CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS assets CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS templates CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS brand_kits CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS sessions CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS users CASCADE`);
  pgm.sql(`DROP TABLE IF EXISTS tenants CASCADE`);
}
