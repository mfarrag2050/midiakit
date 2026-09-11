#!/usr/bin/env node
/**
 * check-control-plane-policies — يوازي APP_USER_EXPECTED_GRANTS (SEC-1).
 *
 * A27: control_plane_user يعبر RLS بسياسات صريحة على كل جدول.
 * جدول بلا سياسة `<table>_control_plane_all` أو `plans_control_plane_write`
 * ⇒ المالك يرى 0 صفوف على ذلك الجدول (صمت بالانحياز للأمان).
 *
 * الحارس يقارن جداول public بقائمة معلَنة (EXPECTED_TABLES) — أي جدول
 * فيها بلا سياسة ⇒ الحارس يسقط. تحديث القائمة عند إضافة جدول جديد
 * إلزاميّ (يظهر كخطأ عند تشغيل الفحص).
 *
 * اختبار وجود L-46: قم بـ`DROP POLICY tenants_control_plane_all ON tenants`
 * ⇒ الحارس يسقط. أعِد السياسة ⇒ يمرّ.
 */
import pg from 'pg';

const DB_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');

// **L-71 (شُدِّد 2026-09-11 · 20-CI-BUILD §1):** غياب المتغيّر ⇒ فشل صريح.
// راجع check-template-sync.mjs للسبب البنيويّ. لا شرط بيئيّ.
if (!DB_URL) {
  console.error('[check-control-plane-policies] ✗ DATABASE_URL غير مضبوطة — البوابة لا تستطيع أن تفحص.');
  console.error('  ما لم يُفحَص: وجود سياسة `<table>_control_plane_all` (أو');
  console.error('  `plans_control_plane_write`) على كلّ جدول من EXPECTED_TABLES.');
  console.error('  الأثر: جدول جديد بلا سياسة ⇒ control_plane_user يرى 0 صفوف صمتاً.');
  console.error('  الحلّ:');
  console.error('    • محلّياً: `pnpm db:up && pnpm db:migrate` ثمّ صدِّر DATABASE_URL');
  console.error('      (راجع packages/db/.env.example).');
  console.error('    • في CI: مرِّر DATABASE_URL كسرّ إلى خدمة postgres.');
  process.exit(1);
}

// الجداول التي **يجب** أن تحمل سياسة control_plane.
// أي جدول tenant-scoped + الجداول العامة (plans) + جداول المنصّة نفسها.
const EXPECTED_TABLES = [
  // Tenant-scoped (19 — أضيف checkout_sessions في A21)
  'tenants', 'users', 'sessions', 'brand_kits', 'templates',
  'assets', 'workflows', 'projects', 'project_state', 'transitions',
  'annotations', 'renders', 'revisions', 'ai_integrations',
  'subscriptions', 'usage', 'password_reset_tokens', 'invitations',
  'checkout_sessions',
  // ai_integrations موجود من A2 — control_plane_all موجودة
  'plan_revisions',                    // A28 — تدقيق تحرير plans
  'license_acks',                      // DEBT-1 §3 — سجلّ إقرار ترخيص append-only
  // Reference data
  'plans',
  // Platform-scoped (2)
  'platform_users', 'platform_sessions',
];

// جداول مستثناة صراحةً من الفحص:
//   login_attempts — بلا RLS أصلاً (SEC-1 استثناء موثَّق)
//   pgmigrations — internal
const EXCLUDED = new Set(['login_attempts', 'pgmigrations']);

const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });

let allTables, policies;
try {
  const t = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  allTables = t.rows.map((r) => r.tablename);

  const p = await pool.query(`
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
      AND (policyname LIKE '%control_plane_all' OR policyname = 'plans_control_plane_write')
  `);
  policies = new Set(p.rows.map((r) => r.tablename));
} catch (err) {
  // **L-71 (شُدِّد 2026-09-11 · 20-CI-BUILD §1):** فشل الاتصال ⇒ فشل صريح.
  console.error(`[check-control-plane-policies] ✗ تعذّر الاتصال (${err.code || err.message}).`);
  console.error('  ما لم يُفحَص: تغطية سياسات control_plane لجداول public.');
  console.error('  الحلّ: تأكّد أنّ postgres يعمل وأنّ الهجرات مُطبَّقة.');
  await pool.end();
  process.exit(1);
}

const errors = [];

// جداول في القائمة بلا سياسة
for (const t of EXPECTED_TABLES) {
  if (!allTables.includes(t)) {
    errors.push(`  ✗ ${t}: جدول مفقود من DB (EXPECTED_TABLES في السكربت)`);
    continue;
  }
  if (!policies.has(t)) {
    errors.push(`  ✗ ${t}: لا سياسة control_plane (control_plane_user يرى 0 صفوف)`);
  }
}

// جداول في DB (خارج EXCLUDED) وخارج القائمة — قد تحتاج سياسة
for (const t of allTables) {
  if (EXCLUDED.has(t)) continue;
  if (!EXPECTED_TABLES.includes(t)) {
    errors.push(`  ✗ ${t}: جدول جديد بلا إعلان — أضِفه إلى EXPECTED_TABLES + سياسة control_plane`);
  }
}

await pool.end();

if (errors.length > 0) {
  console.error(`[check-control-plane-policies] ✗ ${errors.length} انحراف:`);
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(`[check-control-plane-policies] ✓ ${EXPECTED_TABLES.length} جدول محمي بسياسة control_plane.`);
process.exit(0);
