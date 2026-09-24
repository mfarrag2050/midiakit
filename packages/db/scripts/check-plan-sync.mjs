#!/usr/bin/env node
/**
 * check-plan-sync — يوازي check-template-sync (A13) بعد إصلاح 450.
 *
 * **الحقيقة المُقاسة (٤٥٠):** الإصدار السابق حسبَ البصمة من DB نفسِها
 * ثم قارنها بـ`row.definition_hash` — أي **مقارنةٌ لذاتِها**. لو
 * عُدِّلت مصفوفة `PLANS` وأُعيد البذر بلا هجرة جديدة، القاعدةُ تبقى
 * بالاسم القديم وبصمتُها تطابق قيَمَها القديمة ⇒ **الحارس يمرّ أخضر
 * صامتاً**. عائلةُ عطبِ 950 نفسِه.
 *
 * **الإصلاح:** مصدرُ الحقيقةِ = `PLANS` المُصدَّرة من هجرة البذر
 * الأصليّة `20260907030000_plans-a26.ts`. البصمةُ تُحسَب من كلّ عنصرٍ
 * فيها (نفس `seedShape = {key, name_ar, name_en}` · نفس A28) وتُقارَن
 * بـ`plans.definition_hash` في DB. ونحسب بصمة هوية الصف الفعلية
 * ونقارنها بالمخزّنة أيضاً، لكشف تعديل الاسم بلا مزامنة (٤٨٤).
 * اختلافٌ في أيّ مقارنة ⇒ RED صريح.
 *
 * **ملاحظاتٌ لسانيّة:**
 *   - نستعمل `node --import tsx` كي نستورد `.ts` مباشرةً (نمط مستعمل
 *     في scripts/ الأخرى — راجع package.json).
 *   - قائمة الرموز في `plans` DB تُقارَن بمفاتيح `PLANS` — نبلّغ لو
 *     كان في DB باقةٌ زائدة أو ناقصة (الأصل: تطابق تامّ).
 *
 * **L-46:** غيّرْ `name_ar` لأيّ باقة في المصدر بلا هجرة ⇒ `check` يسقط.
 * أرجعِ التغيير ⇒ يعود أخضر. المخرَجان في تقرير 450 §٢.
 *
 * dev بلا DATABASE_URL ⇒ يُتخطّى بحرص (كما check-template-sync).
 */
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { skipMissingResource } from './_lib/skip-guard.mjs';
import { PLANS } from '../migrations/20260907030000_plans-a26.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = join(__dirname, '../migrations/20260907030000_plans-a26.ts');

const DB_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');

// 142-SKIP-IS-NOT-PASS — لا `exit 0` صامتاً.
if (!DB_URL) {
  skipMissingResource({
    scriptName: 'check-plan-sync',
    missing: 'DATABASE_URL',
    hint: 'شغّل `bin/mk up` (dev postgres) أو ضع DATABASE_URL يدوياً.',
  });
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

/** الهوية A28 — نفس الشكل المستعمل في هجرة `20260908050000_a28-plans-identity-hash.ts`. */
function seedShapeOf(plan) {
  return { key: plan.key, name_ar: plan.name_ar, name_en: plan.name_en };
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });

let dbRows;
try {
  const r = await pool.query(`SELECT key, name_ar, name_en, definition_hash FROM plans ORDER BY key`);
  dbRows = r.rows;
} catch (err) {
  await pool.end();
  skipMissingResource({
    scriptName: 'check-plan-sync',
    missing: `DB reachable (${err.code || err.message})`,
    hint: 'تحقّق أنّ postgres شغّال + DATABASE_URL يشير إليه.',
  });
}
await pool.end();

const dbByKey = new Map(dbRows.map((r) => [r.key, r]));
const sourceByKey = new Map(PLANS.map((p) => [p.key, p]));

const errors = [];
let checked = 0;

// (1) لكلّ باقة في المصدر: بصمة الملفّ ↔ بصمة DB.
for (const plan of PLANS) {
  const dbRow = dbByKey.get(plan.key);
  if (!dbRow) {
    errors.push(`  ✗ plans[${plan.key}]: في المصدر (${SOURCE_FILE}) ولا صفَّ في DB — هجرةُ بذرٍ لم تُطبَّق؟`);
    continue;
  }
  const sourceHash = canonicalHash(seedShapeOf(plan));
  if (sourceHash !== dbRow.definition_hash) {
    errors.push(
      `  ✗ plans[${plan.key}]: source ≠ db\n` +
      `      source(${sourceHash.slice(0, 12)}…) = ${JSON.stringify(seedShapeOf(plan))}\n` +
      `      db    (${dbRow.definition_hash.slice(0, 12)}…) = ${JSON.stringify({ key: dbRow.key, name_ar: dbRow.name_ar, name_en: dbRow.name_en })}`,
    );
  }
  const rowHash = canonicalHash(seedShapeOf(dbRow));
  if (rowHash !== dbRow.definition_hash) {
    errors.push(
      `  ✗ plans[${plan.key}]: row identity ≠ stored hash\n` +
      `      row(${rowHash.slice(0, 12)}…) = ${JSON.stringify(seedShapeOf(dbRow))}\n` +
      `      stored(${dbRow.definition_hash.slice(0, 12)}…)`,
    );
  }
  checked++;
}

// (2) صفوف في DB ليست في المصدر — باقةٌ حُذفت من `PLANS` بلا هجرةٍ تُسقطها.
for (const dbRow of dbRows) {
  if (!sourceByKey.has(dbRow.key)) {
    errors.push(`  ✗ plans[${dbRow.key}]: في DB ولا في المصدر (${SOURCE_FILE}) — هجرةُ حذف مفقودة؟`);
  }
}

if (errors.length > 0) {
  console.error(`[check-plan-sync] ✗ ${errors.length} انحراف — المصدر (PLANS في ${SOURCE_FILE}) لا يطابق DB:`);
  for (const e of errors) console.error(e);
  console.error(`\n  الحلّ: هجرة جديدة UPDATE plans SET name_ar/name_en/definition_hash (نظير 440 لـtemplates).`);
  process.exit(1);
}

console.log(`[check-plan-sync] ✓ ${checked} باقات · مصدرُ الحقيقة (PLANS) يطابق DB بصمةً وقيَماً.`);
process.exit(0);
