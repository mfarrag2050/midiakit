/**
 * A26 — طبقة الإعداد: جدول plans + tenants.plan FK + plan_overrides.
 *
 * ── يرث نمط A13 حرفياً (ADR-012 §نمط البيانات المرجعية العامة) ─────
 * `plans` بيانات مرجعية عامة — يقرؤها كل مستأجر، لا يملكها أحد.
 * فرق واحد عن templates: لا `scope='tenant'` — كل الصفوف عامة (كتالوج
 * أسعار ثابت). فلا `tenant_id` أصلاً في `plans` — الفصل بنيويّ لا سياسة.
 *
 * ── السياسة: قراءة عامة، كتابة مقيَّدة بـmigration_user ───────────
 *   SELECT — يُرى الكل (كل مستأجر يقرأ باقته)
 *   INSERT/UPDATE/DELETE — migration_user فقط (البذر + A27)
 *
 * ── الحدود ─────────────────────────────────────────────────────
 *   key (PK نصّي): 'starter'|'studio'|'agency'|'api'|'trial'
 *   name_ar, name_en
 *   price_usd_cents (int) — 2900 = $29
 *   brand_kits_limit (int|null) — null = غير محدود
 *   seats_limit (int|null)
 *   videos_per_month_limit (int|null)
 *   requests_per_minute_limit (int)
 *   concurrent_renders_limit (int)
 *   source_ref, definition_hash — نمط A13 (حارس تزامن)
 *
 * ── tenants.plan ───────────────────────────────────────────────
 * CHECK → REFERENCES plans(key) ON DELETE RESTRICT.
 * plan_overrides jsonb nullable — تجاوز لكل مستأجر يعلو عند وجوده.
 *
 * ── القيم المبدئية (docs/16 §17 + docs/01 §نموذج الإيراد) ─────
 *   starter  $29  · 1 BK · 2 seats  · 20/شهر  · 60 rpm  · 1 متزامن
 *   studio   $79  · 5    · 5        · 100     · 180     · 3
 *   agency   $149 · 20   · 15       · unlimited (null) · 600 · 8
 *   api      $299 · null · null     · null    · 1200    · 15
 *   trial    $0   · 1    · 1        · 5       · 30      · 1
 *
 * ── الحارس: check:plan-sync (يوازي A13) ────────────────────────
 * سكربت مستقلّ يقرأ ملف مصدر ثابت (plans.json — نُضيفه هنا) ويقارن
 * definition_hash. عند اختلاف → فشل + تعليمة migration.
 */
import type { MigrationBuilder } from 'node-pg-migrate';
import { createHash } from 'node:crypto';

export const shorthands = undefined;

// canonical sort للـhash (نفس منطق A13 templates)
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
function canonicalHash(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(obj))).digest('hex');
}

interface PlanSeed {
  key: string;
  name_ar: string;
  name_en: string;
  price_usd_cents: number;
  brand_kits_limit: number | null;
  seats_limit: number | null;
  videos_per_month_limit: number | null;
  requests_per_minute_limit: number;
  concurrent_renders_limit: number;
}

// SOURCE OF TRUTH — القيم من docs/16 §17 + docs/01 §نموذج الإيراد.
// أي تعديل هنا يستدعي هجرة جديدة (لا PATCH داخل نفس الهجرة — كسر تاريخ).
const PLANS: PlanSeed[] = [
  { key: 'trial',   name_ar: 'تجريبي',  name_en: 'Trial',   price_usd_cents: 0,     brand_kits_limit: 1,   seats_limit: 1,    videos_per_month_limit: 5,   requests_per_minute_limit: 30,  concurrent_renders_limit: 1 },
  { key: 'starter', name_ar: 'مبتدئ',   name_en: 'Starter', price_usd_cents: 2900,  brand_kits_limit: 1,   seats_limit: 2,    videos_per_month_limit: 20,  requests_per_minute_limit: 60,  concurrent_renders_limit: 1 },
  { key: 'studio',  name_ar: 'استوديو', name_en: 'Studio',  price_usd_cents: 7900,  brand_kits_limit: 5,   seats_limit: 5,    videos_per_month_limit: 100, requests_per_minute_limit: 180, concurrent_renders_limit: 3 },
  { key: 'agency',  name_ar: 'وكالة',   name_en: 'Agency',  price_usd_cents: 14900, brand_kits_limit: 20,  seats_limit: 15,   videos_per_month_limit: null,requests_per_minute_limit: 600, concurrent_renders_limit: 8 },
  { key: 'api',     name_ar: 'API',     name_en: 'API',     price_usd_cents: 29900, brand_kits_limit: null,seats_limit: null, videos_per_month_limit: null,requests_per_minute_limit: 1200,concurrent_renders_limit: 15 },
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── الجدول ───────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE plans (
      key                          text PRIMARY KEY,
      name_ar                      text NOT NULL,
      name_en                      text NOT NULL,
      price_usd_cents              integer NOT NULL CHECK (price_usd_cents >= 0),
      brand_kits_limit             integer CHECK (brand_kits_limit IS NULL OR brand_kits_limit > 0),
      seats_limit                  integer CHECK (seats_limit IS NULL OR seats_limit > 0),
      videos_per_month_limit       integer CHECK (videos_per_month_limit IS NULL OR videos_per_month_limit > 0),
      requests_per_minute_limit    integer NOT NULL CHECK (requests_per_minute_limit > 0),
      concurrent_renders_limit     integer NOT NULL CHECK (concurrent_renders_limit > 0),
      source_ref                   text NOT NULL,
      definition_hash              text NOT NULL,
      created_at                   timestamptz NOT NULL DEFAULT now(),
      updated_at                   timestamptz NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON plans
           FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  // ── RLS: قراءة عامة، كتابة مقيَّدة بـmigration_user ──
  pgm.sql(`ALTER TABLE plans ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE plans FORCE ROW LEVEL SECURITY`);

  pgm.sql(`
    CREATE POLICY plans_select ON plans
      FOR SELECT USING (true)
  `);
  pgm.sql(`
    CREATE POLICY plans_insert ON plans
      FOR INSERT WITH CHECK (current_user = 'migration_user')
  `);
  pgm.sql(`
    CREATE POLICY plans_update ON plans
      FOR UPDATE USING (current_user = 'migration_user')
                 WITH CHECK (current_user = 'migration_user')
  `);
  pgm.sql(`
    CREATE POLICY plans_delete ON plans
      FOR DELETE USING (current_user = 'migration_user')
  `);

  // ── L-58: SEC-1 Option B — منح صريح لـapp_user ─────
  pgm.sql(`GRANT SELECT ON plans TO app_user`);
  // لا INSERT/UPDATE/DELETE — الكتابة migration_user فقط

  // ── البذر ────────────────────────────────────────────
  for (const p of PLANS) {
    const hash = canonicalHash(p);
    const sourceRef = `docs/16 §17 + docs/01 §revenue-model`;
    pgm.sql(`
      INSERT INTO plans (
        key, name_ar, name_en, price_usd_cents,
        brand_kits_limit, seats_limit, videos_per_month_limit,
        requests_per_minute_limit, concurrent_renders_limit,
        source_ref, definition_hash
      ) VALUES (
        $$${p.key}$$, $$${p.name_ar}$$, $$${p.name_en}$$, ${p.price_usd_cents},
        ${p.brand_kits_limit === null ? 'NULL' : p.brand_kits_limit},
        ${p.seats_limit === null ? 'NULL' : p.seats_limit},
        ${p.videos_per_month_limit === null ? 'NULL' : p.videos_per_month_limit},
        ${p.requests_per_minute_limit}, ${p.concurrent_renders_limit},
        $$${sourceRef}$$, $$${hash}$$
      )
    `);
  }

  // ── tenants.plan: من CHECK إلى FK ────────────────────
  pgm.sql(`ALTER TABLE tenants DROP CONSTRAINT tenants_plan_check`);
  pgm.sql(`
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_plan_fkey
      FOREIGN KEY (plan) REFERENCES plans(key) ON DELETE RESTRICT
  `);
  // subscriptions.plan كذلك يجب أن يحمل نفس القيم (نفس FK)
  pgm.sql(`ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check`);
  pgm.sql(`
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_plan_fkey
      FOREIGN KEY (plan) REFERENCES plans(key) ON DELETE RESTRICT
  `);

  // ── tenants.plan_overrides ─────────────────────────
  pgm.sql(`
    ALTER TABLE tenants
      ADD COLUMN plan_overrides jsonb
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE tenants DROP COLUMN IF EXISTS plan_overrides`);
  pgm.sql(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_fkey`);
  pgm.sql(`
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ('trial', 'starter', 'studio', 'agency', 'api'))
  `);
  pgm.sql(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_fkey`);
  pgm.sql(`
    ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
      CHECK (plan IN ('trial', 'starter', 'studio', 'agency', 'api'))
  `);
  pgm.sql(`DROP POLICY IF EXISTS plans_delete ON plans`);
  pgm.sql(`DROP POLICY IF EXISTS plans_update ON plans`);
  pgm.sql(`DROP POLICY IF EXISTS plans_insert ON plans`);
  pgm.sql(`DROP POLICY IF EXISTS plans_select ON plans`);
  pgm.sql(`DROP TRIGGER IF EXISTS plans_set_updated_at ON plans`);
  pgm.sql(`DROP TABLE IF EXISTS plans`);
}
