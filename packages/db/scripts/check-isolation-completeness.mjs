#!/usr/bin/env node
/**
 * ALERTS-WIRE §4 — check-isolation-completeness (حارس بنيوي).
 *
 * القاعدة: كل جدول في public يجب أن يظهر إمّا في APP_USER_EXPECTED_GRANTS
 * (يعرض منحه لـapp_user)، إمّا في القائمة الصريحة `NOT_ISOLATED` (جداول
 * منصّة أو نظام لا تخصّ عزل المستأجرين).
 *
 * **السبب**: checkout_sessions (A21) وplan_revisions (A28) كلاهما أُضيف
 * ولم يُذكَر في قائمة العزل حتى وُجد بالمصادفة أثناء LIMITS-1. هذا ثاني
 * تسريب في قائمة معلَنة (بعد check-template-sync). نمط الحرّاس البنيويين
 * الذي طُبِّق على control_plane_policies في A27 يُعاد استعماله هنا.
 *
 * L-46: أنشئ جدولاً تجريبياً ⇒ الفحص يسقط. احذفه ⇒ يمرّ.
 *
 * الخروج: 0 نجاح · 1 فشل بذكر الجداول غير المُعلَنة.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { skipMissingResource } from './_lib/skip-guard.mjs';

const DB_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
// 142-SKIP-IS-NOT-PASS
if (!DB_URL) {
  skipMissingResource({
    scriptName: 'check-isolation-completeness',
    missing: 'DATABASE_URL',
    hint: 'شغّل `bin/mk up` (dev postgres) أو ضع DATABASE_URL يدوياً.',
  });
}

// جداول لا تخصّ عزل المستأجرين (نظام أو منصّة أو مرجعية عامة):
//   • login_attempts — بلا RLS (SEC-1 استثناء موثَّق)
//   • pgmigrations — internal، بلا منح لـapp_user (SEC-1 fix)
//   • plans — بيانات مرجعية عامة (A26): app_user SELECT فقط، ليس tenant-scoped
//   • platform_users, platform_sessions — control plane، صفر منح لـapp_user (A27)
//   • plan_revisions — تدقيق منصّة (A28)، صفر منح لـapp_user
const NOT_ISOLATED = new Set([
  'login_attempts',
  'pgmigrations',
  'plans',
  'platform_users',
  'platform_sessions',
  'plan_revisions',
]);

// نقرأ APP_USER_EXPECTED_GRANTS من verify-isolation.mjs بـregex بسيط.
// السلوك الطبيعي: تعديل القائمة يُبقي الفحص محدَّثاً. لو نُقلت خارج الملف،
// نُعدّل هذا المسار.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ISOLATION_SRC = readFileSync(join(__dirname, 'verify-isolation.mjs'), 'utf8');
const mapMatch = ISOLATION_SRC.match(/const APP_USER_EXPECTED_GRANTS[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!mapMatch) {
  console.error('[check-isolation-completeness] ✗ لم يُعثر على APP_USER_EXPECTED_GRANTS في verify-isolation.mjs');
  process.exit(2);
}
const declaredTables = new Set();
for (const line of mapMatch[1].split('\n')) {
  const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/);
  if (m) declaredTables.add(m[1]);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });

let allTables;
try {
  const r = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  allTables = r.rows.map((row) => row.tablename);
} catch (err) {
  // 142-SKIP-IS-NOT-PASS
  await pool.end();
  skipMissingResource({
    scriptName: 'check-isolation-completeness',
    missing: `DB reachable (${err.code || err.message})`,
    hint: 'تحقّق أنّ postgres شغّال + DATABASE_URL يشير إليه.',
  });
}
await pool.end();

const errors = [];
for (const t of allTables) {
  if (NOT_ISOLATED.has(t)) continue;
  if (!declaredTables.has(t)) {
    errors.push(`  ✗ ${t}: جدول في DB بلا سجلّ في APP_USER_EXPECTED_GRANTS · ولا في NOT_ISOLATED`);
    errors.push(`      إن كان tenant-scoped: أضِفه إلى APP_USER_EXPECTED_GRANTS مع منحه المتوقّع`);
    errors.push(`      إن كان منصّة/نظام: أضِفه إلى NOT_ISOLATED في هذا الملف`);
  }
}

if (errors.length > 0) {
  console.error(`[check-isolation-completeness] ✗ ${errors.length / 3} جدول غير معلَن:`);
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`[check-isolation-completeness] ✓ ${allTables.length} جدولاً في public: ${declaredTables.size} في APP_USER_EXPECTED_GRANTS + ${NOT_ISOLATED.size} في NOT_ISOLATED — لا تسريب.`);
process.exit(0);
