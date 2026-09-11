#!/usr/bin/env node
/**
 * check-plan-sync — يوازي check-template-sync (A13).
 *
 * `plans` بيانات مرجعية عامة تُبذر من الهجرة (لا ملف JSON منفصل).
 * القيم في الهجرة `20260907030000_plans-a26.ts` هي مصدر الحقيقة.
 * الحارس يتحقّق أن كل صفّ في DB يحمل `definition_hash` يطابق
 * canonical hash لصفوفه الحالية (لا انزلاق صامت من تعديل SQL يدوي).
 *
 * dev بلا DATABASE_URL ⇒ يُتخطّى بحرص (كما check-template-sync).
 *
 * اختبار وجود L-46: تعديل `plans.brand_kits_limit` مباشرة عبر SQL
 * ⇒ hash يختلف عن definition_hash المُسجَّل ⇒ الحارس يسقط.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';

const DB_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');

// **L-71 (شُدِّد 2026-09-11 · 20-CI-BUILD §1):** غياب المتغيّر ⇒ فشل صريح.
// راجع check-template-sync.mjs للسبب البنيويّ. لا شرط بيئيّ — منفذ هروب
// جديد باسم جديد هو نفس المنفذ القديم.
if (!DB_URL) {
  console.error('[check-plan-sync] ✗ DATABASE_URL غير مضبوطة — البوابة لا تستطيع أن تفحص.');
  console.error('  ما لم يُفحَص: تطابق definition_hash لكلّ صفٍّ في `plans` مع');
  console.error('  canonical hash لهويّته (key, name_ar, name_en).');
  console.error('  الأثر: تعديل SQL يدويّ على `plans` يعبر بلا إنذار.');
  console.error('  الحلّ:');
  console.error('    • محلّياً: `pnpm db:up && pnpm db:migrate` ثمّ صدِّر DATABASE_URL');
  console.error('      (راجع packages/db/.env.example).');
  console.error('    • في CI: مرِّر DATABASE_URL كسرّ إلى خدمة postgres.');
  process.exit(1);
}

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep(v[k]);
    return out;
  }
  return v;
}
function canonicalHash(obj) {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(obj))).digest('hex');
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });

let rows;
try {
  const r = await pool.query(`
    SELECT key, name_ar, name_en, price_usd_cents,
           brand_kits_limit, seats_limit, videos_per_month_limit,
           requests_per_minute_limit, concurrent_renders_limit,
           definition_hash
    FROM plans ORDER BY key
  `);
  rows = r.rows;
} catch (err) {
  // **L-71 (شُدِّد 2026-09-11 · 20-CI-BUILD §1):** فشل الاتصال ⇒ فشل صريح.
  console.error(`[check-plan-sync] ✗ تعذّر الاتصال بـDB (${err.code || err.message}).`);
  console.error('  ما لم يُفحَص: تطابق definition_hash لصفوف `plans`.');
  console.error('  الحلّ: تأكّد أنّ postgres يعمل وأنّ الهجرات مُطبَّقة.');
  await pool.end();
  process.exit(1);
}

const errors = [];
let checked = 0;

for (const row of rows) {
  // A28: seedShape يحمل الهوية فقط. الحدود والسعر خارج الحارس (انظر
  // رأس الملف لمبرِّرها).
  const seedShape = {
    key: row.key,
    name_ar: row.name_ar,
    name_en: row.name_en,
  };
  const currentHash = canonicalHash(seedShape);
  if (currentHash !== row.definition_hash) {
    errors.push(`  ✗ plans[${row.key}]: الهوية تختلف عن definition_hash المُسجَّل`);
    errors.push(`      current=${currentHash.slice(0, 12)}… stored=${row.definition_hash.slice(0, 12)}…`);
  }
  checked++;
}

await pool.end();

if (errors.length > 0) {
  console.error(`[check-plan-sync] ✗ ${errors.length / 2} انحراف — قيم plans تعدَّلت خارج الهجرات:`);
  for (const e of errors) console.error(e);
  console.error(`\n  الحل: هجرة جديدة تحدّث definition_hash + القيمة (لا SQL يدوي).`);
  process.exit(1);
}

console.log(`[check-plan-sync] ✓ ${checked} باقات، كل definition_hash يطابق قيم الصفّ.`);
process.exit(0);
