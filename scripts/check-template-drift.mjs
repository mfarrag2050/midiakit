#!/usr/bin/env node
/**
 * 230-TEMPLATE-DRIFT-GATE — بوّابة تمنع الانحراف من أن يولد.
 *
 * تعمل **بلا قاعدة بيانات** (شرط §١) — تقارن ملفّات القوالب بمنيفست
 * `packages/db/template-hashes.json` (source of truth لتجزئة كل قالب).
 *
 * ── منطق ─────────────────────────────────────────
 * لكل ملفّ قالب في `packages/templates/src/templates/*.json`:
 *   1. احسب canonicalHash (نفس دالّة check-template-sync).
 *   2. قارن مع الـmanifest.
 * انحرافات:
 *   • ملفّ hash ≠ manifest hash ⇒ RED (تُغيَّر الملفّ · لم يُحدَّث manifest).
 *   • ملفّ موجود · لا مُدرَج في manifest ⇒ RED (قالب جديد بلا manifest entry).
 *   • manifest يذكر مسار لا يوجد على disk ⇒ RED (حُذف · لم يُحدَّث manifest).
 * زيادةً: لكل hash في manifest · يُبحَث عنه كـstring literal في migrations.
 * غياب ⇒ WARNING (لا فشل — check:template-sync مع DB يبقى الحرس الرئيسيّ).
 *
 * ── منطق التحديث حين يغيّر مطوّر قالباً ──────────
 *   1. عدّل الملفّ · احسب الـhash الجديد (يُطبَع عند RED).
 *   2. حدّث manifest بالـhash الجديد.
 *   3. اكتب migration تُحدِّث `definition_hash` في DB إلى القيمة الجديدة.
 * الثلاث خطوات لازمة — إن نسي واحدة، الفاحص يكشف.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'packages/templates/src/templates');
const MANIFEST_PATH = join(ROOT, 'packages/db/template-hashes.json');
const MIGRATIONS_DIR = join(ROOT, 'packages/db/migrations');

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

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[check-template-drift] ✗ manifest غير موجود: ${MANIFEST_PATH}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json')).sort();
const errors = [];
const warnings = [];

// (١) ملفّات vs manifest
const fileHashes = new Map();
for (const file of files) {
  const obj = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'));
  const hash = canonicalHash(obj);
  const sourceRef = `@pf-mediakit/templates/${file}`;
  fileHashes.set(sourceRef, hash);

  const expected = manifest[sourceRef];
  if (!expected) {
    errors.push(
      `  ✗ ${sourceRef}: قالب موجود · **لا entry في manifest**\n` +
      `      hash الحاليّ: ${hash}\n` +
      `      الحلّ: أضِف "${sourceRef}": "${hash}" إلى packages/db/template-hashes.json`
    );
    continue;
  }
  if (expected !== hash) {
    errors.push(
      `  ✗ ${sourceRef}: hash mismatch\n` +
      `      manifest: ${expected}\n` +
      `      file:     ${hash}\n` +
      `      الحلّ: (١) حدّث manifest بالـhash الجديد · (٢) اكتب migration تحدّث DB.`
    );
  }
}

// (٢) manifest entries بلا ملفّ
for (const sourceRef of Object.keys(manifest)) {
  if (!fileHashes.has(sourceRef)) {
    errors.push(
      `  ✗ ${sourceRef}: manifest يذكر قالباً · **الملفّ لا يوجد**\n` +
      `      الحلّ: احذف entry من manifest إن كان القالب حُذف عمداً.`
    );
  }
}

// (٣) hash في manifest يجب أن يظهر literal في migration ما (warning · لا فشل)
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.ts')).sort();
const allMigrationText = migrationFiles
  .map(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
  .join('\n');

for (const [sourceRef, hash] of Object.entries(manifest)) {
  if (!allMigrationText.includes(hash)) {
    warnings.push(
      `  ⚠ ${sourceRef}: hash في manifest لكن **لا يظهر literal في أيّ migration**\n` +
      `      hash: ${hash}\n` +
      `      ملاحظة: migration 20260912030000 يستعمل \`readFileSync\` · لا literal.\n` +
      `      check:template-sync مع DB يبقى الحرس الرئيسيّ.`
    );
  }
}

if (errors.length > 0) {
  console.error(`[check-template-drift] ✗ ${errors.length} انحراف — قالب تغيّر بلا مزامنة:`);
  for (const e of errors) console.error(e);
  if (warnings.length > 0) {
    console.error(`\n[check-template-drift] ⚠ ${warnings.length} تحذير:`);
    for (const w of warnings) console.error(w);
  }
  process.exit(1);
}

console.log(`[check-template-drift] ✓ ${files.length} قوالب متطابقة بين الملفّات و manifest.`);
if (warnings.length > 0) {
  console.log(`\n[check-template-drift] ⚠ ${warnings.length} تحذير (لا يفشل الفاحص):`);
  for (const w of warnings) console.log(w);
}
