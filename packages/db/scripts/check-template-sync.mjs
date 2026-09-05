#!/usr/bin/env node
/**
 * check-template-sync — يحرس نمط ADR-012 (مصدرَي حقيقة).
 *
 * القوالب العامة موجودة في مكانَين:
 *   1. `packages/templates/src/templates/*.json` — يستوردها المحرك
 *      والرندر مباشرة (thick client build-time).
 *   2. صفوف `templates WHERE scope='global'` — يستهلكها API + FK
 *      من projects.template_id (server runtime).
 *
 * بلا هذا الحارس، تعديل الملف بلا هجرة يُنتِج تباعداً صامتاً
 * (L-54). الحارس يقارن sha256 canonical لكل ملف بـdefinition_hash
 * المسجَّل في DB.
 *
 * DB اتصال:
 *   - يحتاج DATABASE_URL أو DATABASE_URL_APP في env
 *   - يقرأ عبر migration_user (يرى الستة العامة عبر SELECT policy)
 *
 * اختبار وجود (L-46):
 *   1. عدّل حرفاً في packages/templates/src/templates/plain.json
 *   2. شغّل check-template-sync ⇒ يخرج بـ1
 *   3. أعِد الملف كما كان ⇒ يخرج بـ0
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/db/scripts/check-template-sync.mjs → packages/templates/src/templates
const TEMPLATES_DIR = join(__dirname, '../../templates/src/templates');

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

const DB_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');

// dev مطفأ ⇒ نتخطّى (المطوّر بلا Docker لا يفشل بناءه).
if (!DB_URL) {
  console.log('[check-template-sync] لا DATABASE_URL — يُتخطّى (dev بلا قاعدة).');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });

const files = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

let rows;
try {
  const r = await pool.query(
    `SELECT source_ref, definition_hash FROM templates WHERE scope='global' AND deleted_at IS NULL`,
  );
  rows = r.rows;
} catch (err) {
  // DB unreachable (dev بلا bin/mk) ⇒ لا نُفشِل، نُبلِّغ.
  console.log(`[check-template-sync] تعذّر الاتصال بـDB (${err.code || err.message}) — يُتخطّى.`);
  await pool.end();
  process.exit(0);
} finally {
  // pool يُغلَق في نهاية النجاح أيضاً — نتأكّد لاحقاً.
}

const dbBySourceRef = new Map(rows.map((r) => [r.source_ref, r.definition_hash]));
const errors = [];
let checked = 0;

for (const file of files) {
  const sourceRef = `@pf-mediakit/templates/${file}`;
  const obj = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'));
  const fileHash = canonicalHash(obj);

  const dbHash = dbBySourceRef.get(sourceRef);
  if (!dbHash) {
    errors.push(`  ✗ ${sourceRef}: غير مبذور في DB (ملف موجود، صفّ مفقود)`);
    continue;
  }
  if (dbHash !== fileHash) {
    errors.push(`  ✗ ${sourceRef}: hash mismatch (file=${fileHash.slice(0, 12)}… db=${dbHash.slice(0, 12)}…)`);
    continue;
  }
  checked++;
}

// صفوف في DB بلا ملف
for (const sourceRef of dbBySourceRef.keys()) {
  const fileName = sourceRef.replace('@pf-mediakit/templates/', '');
  if (!files.includes(fileName)) {
    errors.push(`  ✗ ${sourceRef}: صفّ موجود، ملف مفقود من الحزمة`);
  }
}

await pool.end();

if (errors.length > 0) {
  console.error(`[check-template-sync] ✗ ${errors.length} انحراف — ملفات القوالب لا تطابق DB:`);
  for (const e of errors) console.error(e);
  console.error(`\n  الحل: هجرة تحدّث definition_hash للصف (وتُنفَّذ pnpm db:migrate).`);
  process.exit(1);
}

console.log(`[check-template-sync] ✓ ${checked} قوالب عامة متطابقة بين الحزمة و DB.`);
process.exit(0);
