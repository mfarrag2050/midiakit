#!/usr/bin/env node
// check-error-code-coverage — يفشل البناء إن كان رمز مستأجَر من
// mk-api بلا مفتاح مطابق `errors.<CODE>` في القواميس الثلاثة، أو
// إن كان في قاموس رمز غير مذكور في القائمة الرسمية (طرد).
//
// **الاختلاف عن check-locale-parity:** الأخير يضمن التطابق بين
// القواميس. هذا يضمن التغطية مقابل قائمة خارجية (mk-api).
//
// **مصدر الحقيقة:** `scripts/mk-api-error-codes.json` — مرآة يدوية
// لـ`apps/api/src/errors.ts`. أيّ تغيير في mk-api يعكس هنا في نفس
// الالتزام الذي يوائم studio معه.
//
// **الاستخدام:** `node scripts/check-error-code-coverage.mjs`
// **الخروج:** 0 نظيف · 1 عند نقص أو زائد.

import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANON = join(__dirname, 'mk-api-error-codes.json');
const I18N = join(ROOT, 'packages', 'i18n', 'src');
const LOCALES = ['ar', 'mixed', 'en'];

const canon = JSON.parse(await readFile(CANON, 'utf8'));
const serverCodes = new Set(canon.codes);
const clientOnly = new Set(canon.clientOnlyCodes?.codes ?? []);
const allowedInDict = new Set([...serverCodes, ...clientOnly]);

console.log(`[check-error-code-coverage] المرجع: ${relative(ROOT, CANON)}`);
console.log(`  أكواد mk-api الرسمية: ${serverCodes.size}`);
console.log(`  أكواد UI-only fallback: ${clientOnly.size}`);
console.log('');

let failed = false;

for (const loc of LOCALES) {
  const p = join(I18N, `${loc}.json`);
  const raw = await readFile(p, 'utf8');
  const dict = JSON.parse(raw);
  const errorsSection = dict.errors ?? {};
  const inDict = new Set(Object.keys(errorsSection));

  const missing = [...serverCodes].filter((c) => !inDict.has(c));
  const extra = [...inDict].filter((c) => !allowedInDict.has(c));

  const status = missing.length === 0 && extra.length === 0 ? '✓' : '✗';
  console.log(`  ${status} ${loc}.json  (${inDict.size} مفتاحاً في errors.*)`);
  if (missing.length > 0) {
    console.log(`      ناقص (${missing.length}):`);
    for (const c of missing) console.log(`        · errors.${c}`);
    failed = true;
  }
  if (extra.length > 0) {
    console.log(`      زائد — ليس في mk-api ولا في client-only (${extra.length}):`);
    for (const c of extra) console.log(`        · errors.${c}`);
    failed = true;
  }
}

console.log('');
if (failed) {
  console.error('  ✗ تغطية غير مكتملة. حرّر:');
  console.error(`    · القواميس في ${relative(ROOT, I18N)}/{ar,mixed,en}.json`);
  console.error(`    · أو المرجع في ${relative(ROOT, CANON)} (إن كان mk-api غيّر)`);
  process.exit(1);
}
console.log('  ✓ كل رمز من mk-api موجود في القواميس الثلاثة، ولا زوائد.');
process.exit(0);
