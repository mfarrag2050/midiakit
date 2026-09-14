#!/usr/bin/env node
// check-error-code-coverage — يفرض اتّساقاً داخليّاً في شجرة العمل:
//
//   (1) المرآة ↔ errors.ts (**من الشجرة المحلّيّة**):
//       يقرأ `apps/api/src/errors.ts` من نفس الشجرة التي يعمل عليها
//       الفاحص، يستخرج قائمة الأكواد من نوع `ErrorCode` union، ويقارنها
//       بالمرآة `scripts/mk-api-error-codes.json`. أيّ رمز في الملفّ
//       غائب من المرآة، أو العكس، ⇒ فشل.
//
//   (2) المرآة ↔ القواميس:
//       كل رمز في المرآة يجب أن يحمل مفتاحاً `errors.<CODE>` في
//       القواميس الثلاثة، ولا زوائد (باستثناء `clientOnlyCodes`).
//
// ── لماذا محلّيّاً لا `origin/feat/api` (تصحيح نطاق · 2026-09-13) ────
// الإصدار السابق كان يقرأ `git show origin/feat/api:apps/api/src/errors.ts`
// ويقارنه بمرآة main. النتيجة: **خضرة main رهينةَ آخر دفعةٍ من mkapi
// على feat/api** — كل push جديد لرمز خطأ ينكسر عليه main، حتّى قبل الدمج.
// الفاحص كان يقيس «هل main تلاحق feat/api؟» — سؤال خاطئ للسياق. السؤال
// الصحيح: «هل الشجرة الحاليّة متّسقة مع نفسها؟».
//
// - على main بعد الدمج: يفحص main-vs-main. تباعدٌ حقيقيّ لا خيال.
// - على feat/api قبل الدمج: يفحص feat/api-vs-feat/api. مؤلّف الميزة يرى
//   الفشل في PR/pre-push فور تعديل errors.ts بلا تحديث المرآة (الحلّ الصحيح
//   بنيويّاً — بوّابة على مصدر التعديل).
//
// **الاستخدام:** `node scripts/check-error-code-coverage.mjs`
// **الخروج:** 0 نظيف · 1 عند أيّ تباعد.

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANON = join(__dirname, 'mk-api-error-codes.json');
const I18N = join(ROOT, 'packages', 'i18n', 'src');
const LOCALES = ['ar', 'mixed', 'en'];

const ERRORS_TS_PATH = 'apps/api/src/errors.ts';

/**
 * يقرأ محتوى errors.ts من الشجرة المحلّيّة. يفشل بوضوح إن كان الملفّ
 * غائباً (يعني apps/api لم يُدمَج بعد في هذا الفرع — إعلانٌ لا صمت).
 */
function readErrorsTsFromLocal() {
  try {
    return readFileSync(join(ROOT, ERRORS_TS_PATH), 'utf8');
  } catch (err) {
    console.error(
      `[check-error-code-coverage] ✗ تعذّر قراءة \`${ERRORS_TS_PATH}\` محلّيّاً`
    );
    console.error('  السبب المحتمل:');
    console.error('    · apps/api غير مدموج بعد في هذا الفرع (فرع UI مثلاً).');
    console.error('    · الملفّ نُقل/حُذف. أعلن أوّلاً، لا تُصلح صامتاً.');
    console.error('  الخطأ الأصلي:', err.message);
    process.exit(1);
  }
}

/**
 * يستخرج أكواد `ErrorCode` من نصّ errors.ts.
 * الفرضية: كل عنصر من الاتحاد على سطر يبدأ بـ`  | 'CODE'`.
 * (النمط المستعمل في mk-api منذ إنشائه — لو تغيّر، الفحص يفشل
 * بنقص/زيادة ما يشير إلى الحاجة لضبط الـregex.)
 */
function parseErrorCodes(src) {
  const re = /^\s*\|\s*'([A-Z][A-Z_]*)'/gm;
  const codes = new Set();
  let m;
  while ((m = re.exec(src)) !== null) codes.add(m[1]);
  return codes;
}

// ── (1) المرآة ↔ errors.ts (المحلّيّة) ─────────────────────
console.log('[check-error-code-coverage]');
console.log(`  (1) المرآة ↔ ${ERRORS_TS_PATH} (شجرة محلّيّة)`);

const localSrc = readErrorsTsFromLocal();
const localCodes = parseErrorCodes(localSrc);

const canon = JSON.parse(await readFile(CANON, 'utf8'));
const mirrorCodes = new Set(canon.codes);

const missingInMirror = [...localCodes].filter((c) => !mirrorCodes.has(c));
const extraInMirror = [...mirrorCodes].filter((c) => !localCodes.has(c));

console.log(`    errors.ts: ${localCodes.size} رمز · المرآة: ${mirrorCodes.size} رمز`);

let failed = false;

if (missingInMirror.length > 0) {
  console.error(`  ✗ (1) ${missingInMirror.length} رمز في errors.ts غائب من المرآة:`);
  for (const c of missingInMirror) console.error(`      · ${c}`);
  failed = true;
}
if (extraInMirror.length > 0) {
  console.error(`  ✗ (1) ${extraInMirror.length} رمز في المرآة لا يوجد في errors.ts:`);
  for (const c of extraInMirror) console.error(`      · ${c}`);
  failed = true;
}
if (!failed) {
  console.log('    ✓ المرآة مطابقة لـerrors.ts (اتّساق داخليّ · هذا الفرع).');
}

// ── (2) المرآة ↔ القواميس ───────────────────────────────────
console.log('');
console.log(`  (2) المرآة ↔ packages/i18n/src/{ar,mixed,en}.json`);

const clientOnly = new Set(canon.clientOnlyCodes?.codes ?? []);
const allowedInDict = new Set([...mirrorCodes, ...clientOnly]);

console.log(`    أكواد UI-only fallback: ${clientOnly.size}`);

for (const loc of LOCALES) {
  const p = join(I18N, `${loc}.json`);
  const raw = await readFile(p, 'utf8');
  const dict = JSON.parse(raw);
  const errorsSection = dict.errors ?? {};
  const inDict = new Set(Object.keys(errorsSection));

  const missing = [...mirrorCodes].filter((c) => !inDict.has(c));
  const extra = [...inDict].filter((c) => !allowedInDict.has(c));

  const status = missing.length === 0 && extra.length === 0 ? '✓' : '✗';
  console.log(`    ${status} ${loc}.json  (${inDict.size} مفتاحاً في errors.*)`);
  if (missing.length > 0) {
    console.log(`        ناقص (${missing.length}):`);
    for (const c of missing) console.log(`          · errors.${c}`);
    failed = true;
  }
  if (extra.length > 0) {
    console.log(`        زائد (${extra.length}):`);
    for (const c of extra) console.log(`          · errors.${c}`);
    failed = true;
  }
}

console.log('');
if (failed) {
  console.error('  ✗ تباعد. حرّر:');
  console.error(`    · المرآة (${relative(ROOT, CANON)}) لتطابق ما على mk-api`);
  console.error(`    · القواميس (${relative(ROOT, I18N)}/{ar,mixed,en}.json)`);
  process.exit(1);
}
console.log('  ✓ الحلقتان مغلقتان: mk-api ⇔ المرآة ⇔ القواميس.');
process.exit(0);
