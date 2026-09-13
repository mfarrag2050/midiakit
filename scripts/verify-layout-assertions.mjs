#!/usr/bin/env node
// 320 §٤ · اختبار يقرأ .layout.json (لا الصورة).
//
// **الأهداف القابلة للتكذيب:**
//   ١. أرقام عربيّة: ع2-nimbus فيه «25%» raw → layout يحوي «٢٥%» (arabic)
//   ٢. لا orphan-prep: كلّ layout · لا last-word في run = حرف جرّ
//   ٣. BiDi: ع2 · كلمة Nimbus dir='ltr' وسط runs عربيّة
//   ٤. الكسر الدلاليّ: ع1 · «المواد» و «الغذائيّة» في نفس السطر (لا فصل الإضافة)
//
// **الاستعمال:** `node scripts/verify-layout-assertions.mjs`
// **الشرط المسبق:** ملفّات demo/marafi/*.layout.json موجودة.
// **L-46:** بلا الملفّات، يخرج بتوجيه واضح لتوليدها (MK_LAYOUT_TRACE=1).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LAYOUT_DIR = join(ROOT, 'demo/marafi');

const PREPS = new Set(['في', 'من', 'إلى', 'على', 'عن', 'ب', 'ل', 'مع', 'بين', 'حول', 'قبل', 'بعد']);
const ARABIC_DIGITS = /[٠-٩]/;
const LATIN_DIGITS = /[0-9]/;

function load(id, size) {
  const path = join(LAYOUT_DIR, `${id}-${size}.layout.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

let failures = 0;
const results = [];

function assert(name, ok, detail) {
  const line = `  ${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`;
  results.push(line);
  if (!ok) failures++;
}

console.log('[verify-layout-assertions] 320 §٤ · اختبار على .layout.json');
console.log('');

// ── فحص وجود الملفّات ──
if (!existsSync(LAYOUT_DIR) || readdirSync(LAYOUT_DIR).filter(f => f.endsWith('.layout.json')).length === 0) {
  console.error('✗ لا ملفّات .layout.json في demo/marafi/');
  console.error('  ولّدها: MK_LAYOUT_TRACE=1 node --import tsx scripts/300-emit-layout.mjs');
  process.exit(1);
}

// ── (١) أرقام عربيّة (ع2 · جميع المقاسات) ──
console.log('(١) أرقام عربيّة في ع2-nimbus (brand=marafi · numerals=arabic):');
for (const size of ['x', 'instagram', 'feed', 'reel']) {
  const d = load('ع2-nimbus-bidi', size);
  if (!d) { assert(`ع2-${size}`, false, 'ملفّ مفقود'); continue; }
  const processed = d.input.headlineProcessed || '';
  const hasArabic = ARABIC_DIGITS.test(processed);
  const hasLatin = LATIN_DIGITS.test(processed);
  assert(`ع2-${size} processed`, hasArabic && !hasLatin, hasArabic && !hasLatin ? 'يحوي ٢٥ لا 25' : `arabic=${hasArabic} · latin=${hasLatin}`);
}

// ── (٢) لا orphan-prep في أيّ ملفّ (بعد إصلاح 107) ──
console.log('');
console.log('(٢) لا orphan-prep في أيّ layout (107):');
const allFiles = readdirSync(LAYOUT_DIR).filter(f => f.endsWith('.layout.json'));
let orphans = [];
for (const f of allFiles) {
  const d = JSON.parse(readFileSync(join(LAYOUT_DIR, f), 'utf-8'));
  for (const line of d.headline.lines) {
    if (line.break === null) continue; // آخر سطر — يُعفى
    const lastWord = line.break.after;
    if (PREPS.has(lastWord)) {
      orphans.push({ file: f, line: line.index + 1, word: lastWord });
    }
  }
}
assert('لا orphan-prep في نهاية سطر (12 ملفّ)', orphans.length === 0,
  orphans.length ? orphans.map(o => `${o.file}:L${o.line}[${o.word}]`).join(' · ') : `فحص ${allFiles.length} ملفّ`);

// ── (٣) BiDi · Nimbus dir=ltr وسط runs عربيّة (ع2) ──
console.log('');
console.log('(٣) BiDi · Nimbus dir=ltr (ع2):');
for (const size of ['x', 'feed', 'reel']) {
  const d = load('ع2-nimbus-bidi', size);
  if (!d) continue;
  let nimbusRun = null;
  for (const line of d.headline.lines) {
    for (const r of line.runs) {
      if (r.text.includes('Nimbus')) { nimbusRun = r; break; }
    }
  }
  if (!nimbusRun) assert(`ع2-${size} · Nimbus موجود`, false, 'لم يُعثَر');
  else assert(`ع2-${size} · Nimbus dir=ltr`, nimbusRun.dir === 'ltr', `dir=${nimbusRun.dir} · xEnd=${nimbusRun.xEnd}`);
}

// ── (٤) الكسر الدلاليّ · «المواد» و «الغذائيّة» معاً (ع1) ──
console.log('');
console.log('(٤) الكسر الدلاليّ · لا فصل إضافة «المواد الغذائيّة» (ع1):');
for (const size of ['x', 'feed', 'reel']) {
  const d = load('ع1-shipping', size);
  if (!d) continue;
  let split = null;
  for (const line of d.headline.lines) {
    if (line.break && line.break.after === 'المواد' && line.break.beforeNextLine === 'الغذائيّة') {
      split = line.index + 1;
    }
  }
  assert(`ع1-${size} · «المواد» و «الغذائيّة» لم يُفصلا`, split === null,
    split ? `مفصولان بعد السطر ${split}` : 'ok');
}

console.log('');
console.log('═══════════════════════════════════════════════════');
for (const r of results) console.log(r);
console.log('═══════════════════════════════════════════════════');
if (failures > 0) {
  console.error(`✗ ${failures} فشل`);
  process.exit(1);
}
console.log(`✓ كلّ الفحوصات مرَّت (${results.length} تأكيد)`);
