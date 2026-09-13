#!/usr/bin/env node
// _AMEND-300c §٣ — فاحص آليّ: لا اسم وكالة حقيقيّة في العيّنات.
//
// **النطاق (محدود عمداً):** fixtures/ · demo/ · scripts/
// **الأسماء المفحوصة:** رويترز · بلومبرغ · AFP · الجزيرة
// (رفعتُها لـowner لتوسيع brand-blocklist الرسميّ · قراره وحده §_AMEND-300 §٣.
// هذا الفاحص حرس بيئة عيّنات محلّيّ، لا بديل لـblocklist الرسميّ.)
//
// **الاستثناءات المُعلَنة (رفض تمرير أخرى بلا إعلان):**
//   • fixtures/audio/** — «الأناضول» نموذج WER مقصود (README §استثناء القاعدة 10)
//   • scripts/brand-blocklist.json — يذكر الأسماء بحقّ (قائمة الحظر نفسها)
//   • scripts/check-no-brand-leak.mjs · scripts/build-skill.mjs — وثائق تاريخيّة موثّقة
//   • هذا السكربت نفسه (يذكر الأسماء ليصفها)
//
// **الاستعمال:** `node scripts/check-no-agency-in-fixtures.mjs`
// **الخروج:** 0 نظيف · 1 عند أيّ تسرّب.
//
// **ما ليس هذا الفاحص:**
//   • ليس بوّابة pnpm test (بلا إذن owner لتوسيع القائمة الرسميّة).
//   • ليس بديلاً لـcheck:no-brand-leak — يفحص أسماء ليست في blocklist.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const AGENCIES = ['رويترز', 'بلومبرغ', 'AFP', 'الجزيرة'];
const SCAN_ROOTS = ['fixtures', 'demo', 'scripts'];

// استثناءات صريحة — كلّ واحد له مبرّر مذكور أعلاه
const EXCLUDES = [
  /^fixtures\/audio\//,                        // WER نموذج مقصود
  /^scripts\/brand-blocklist\.json$/,          // القائمة نفسها
  /^scripts\/check-no-brand-leak\.mjs$/,       // فاحص القائمة
  /^scripts\/check-no-agency-in-fixtures\.mjs$/, // هذا الملفّ
  /^scripts\/build-skill\.mjs$/,               // وثيقة تاريخيّة (SKILL)
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    const rel = relative(ROOT, p);
    if (EXCLUDES.some((re) => re.test(rel))) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = [];
for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  try { walk(abs, files); } catch {}
}

const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf-8'); } catch { continue; } // ثنائيّ
  const rel = relative(ROOT, f);
  for (const name of AGENCIES) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(name)) {
        hits.push({ file: rel, line: i + 1, name, text: lines[i].slice(0, 100) });
      }
    }
  }
}

console.log(`[check-no-agency-in-fixtures] فحص ${files.length} ملفاً في fixtures/ · demo/ · scripts/`);
console.log(`  الأسماء: ${AGENCIES.join(' · ')}`);
console.log(`  استثناءات صريحة: ${EXCLUDES.length}`);
console.log('');

if (hits.length === 0) {
  console.log('✓ نظيف — لا اسم وكالة حقيقيّة في المسارات الثلاثة.');
  process.exit(0);
}

console.error(`✗ ${hits.length} تسرّب:`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  [${h.name}]  ${h.text}`);
}
process.exit(1);
