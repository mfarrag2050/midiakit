/**
 * إصلاح دقيق في سياسات RLS: التعامل مع سلوك PG الخاص بالـcustom GUCs.
 *
 * المشكلة المرصودة (2026-09-04 خلال بناء G-P4-1):
 *   بعد أوّل `SET LOCAL app.tenant_id = ...` على اتصال، ينتهي المعاملة
 *   بـCOMMIT فيُتوقَّع أن يعود المتغيّر إلى NULL (غير محدَّد). لكن PG
 *   يعامل custom GUCs بشكل مغاير: بعد إنشائها بأوّل SET، تحمل قيمة
 *   افتراضية = **empty string**، ليس NULL. عند إعادة استخدام الاتصال
 *   من Pool، معاملة جديدة بلا SET LOCAL ترى `current_setting → ''`
 *   لا NULL، فيفشل `''::uuid` بخطأ 22P02.
 *
 * الأثر على السياسات القديمة:
 *   USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
 *   ← ينفجر بخطأ 22P02 عند اتصال Pool مُعاد استعماله.
 *
 * الإصلاح — NULLIF(..., ''):
 *   USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
 *   NULLIF يحوّل '' إلى NULL، ثم `NULL::uuid` سالم، ثم `tenant_id = NULL`
 *   يعطي NULL (لا true) → RLS يرفض كل صف. السلوك السلبي المتوقّع.
 *
 * لماذا لم يُكتشَف في A2؟ سيناريو التصفح اليدوي فتح psql فرداً بلا
 * إعادة استعمال اتصال، فالمتغيّر لم يتحوّل إلى empty. الكشف جاء من
 * scripts/verify-isolation.mjs الذي يستعمل pg.Pool.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const TABLES_STANDARD = [
  'users', 'sessions', 'brand_kits', 'templates', 'assets', 'workflows',
  'projects', 'project_state', 'transitions', 'annotations', 'renders',
  'revisions', 'ai_integrations', 'subscriptions', 'usage',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 15 جدولاً بسياسة ALL موحّدة
  for (const table of TABLES_STANDARD) {
    pgm.sql(`
      DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table};
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        FOR ALL
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  // tenants — 4 سياسات منفصلة، السلوك مغاير للـinsert
  pgm.sql(`
    DROP POLICY IF EXISTS tenants_select ON tenants;
    DROP POLICY IF EXISTS tenants_update ON tenants;
    DROP POLICY IF EXISTS tenants_delete ON tenants;

    CREATE POLICY tenants_select ON tenants
      FOR SELECT
      USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    CREATE POLICY tenants_update ON tenants
      FOR UPDATE
      USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

    CREATE POLICY tenants_delete ON tenants
      FOR DELETE
      USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  `);

  // tenants_insert بلا تغيير (WITH CHECK true).
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // العودة إلى السياسات القديمة (بلا NULLIF) — للسجل، مع تحذير أنها معطوبة.
  for (const table of TABLES_STANDARD) {
    pgm.sql(`
      DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table};
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    `);
  }
  pgm.sql(`
    DROP POLICY IF EXISTS tenants_select ON tenants;
    DROP POLICY IF EXISTS tenants_update ON tenants;
    DROP POLICY IF EXISTS tenants_delete ON tenants;

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
}
