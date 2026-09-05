#!/usr/bin/env node
// check-error-code-coverage — يفرض حلقتين:
//
//   (1) المرآة ↔ mk-api (منذ S6-SYNC · 2026-09-05):
//       يقرأ `origin/feat/api:apps/api/src/errors.ts` مباشرةً عبر
//       `git show` (لا checkout، لا نسخة محلّية)، يستخرج قائمة
//       الأكواد من نوع `ErrorCode` union type، ويقارنها بالمرآة في
//       `scripts/mk-api-error-codes.json`. أيّ رمز على mk-api غائب
//       من المرآة، أو العكس، ⇒ فشل. **يضمن أن المرآة لا تتقادم
//       صامتةً** (L-63).
//       إن تعذّرت قراءة origin/feat/api (الفرع غير مجلوب مثلاً)
//       يسقط الفحص بخطأ مسمّى، لا يمرّ صامتاً.
//
//   (2) المرآة ↔ القواميس:
//       كل رمز في المرآة يجب أن يحمل مفتاحاً `errors.<CODE>` في
//       القواميس الثلاثة، ولا زوائد (باستثناء `clientOnlyCodes`).
//
// **مصدر الحقيقة النهائي:** `errors.ts` على `origin/feat/api`.
// المرآة موجودة فقط لأنها مصدر مستقرّ على فرع studio (لا نستورد
// من فروع أخرى في وقت التشغيل).
//
// **الاستخدام:** `node scripts/check-error-code-coverage.mjs`
// **الخروج:** 0 نظيف · 1 عند أيّ تباعد.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANON = join(__dirname, 'mk-api-error-codes.json');
const I18N = join(ROOT, 'packages', 'i18n', 'src');
const LOCALES = ['ar', 'mixed', 'en'];

const REF = 'origin/feat/api';
const REMOTE_PATH = 'apps/api/src/errors.ts';

/**
 * يقرأ محتوى errors.ts من الفرع البعيد عبر `git show`. يفشل بوضوح
 * إن كان الفرع غير مجلوب أو الملف مفقود.
 */
function readErrorsTsFromRemote() {
  try {
    const out = execFileSync('git', ['show', `${REF}:${REMOTE_PATH}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out;
  } catch (err) {
    console.error(
      `[check-error-code-coverage] ✗ تعذّر قراءة \`${REF}:${REMOTE_PATH}\``
    );
    console.error('  السبب المحتمل:');
    console.error('    · الفرع غير مجلوب. جرِّب: git fetch origin feat/api');
    console.error('    · الملف نُقل/حُذف على mk-api. أعلن أوّلاً، لا تُصلح صامتاً.');
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

// ── (1) المرآة ↔ mk-api ─────────────────────────────────────
console.log('[check-error-code-coverage]');
console.log(`  (1) المرآة ↔ ${REF}:${REMOTE_PATH}`);

const remoteSrc = readErrorsTsFromRemote();
const remoteCodes = parseErrorCodes(remoteSrc);

const canon = JSON.parse(await readFile(CANON, 'utf8'));
const mirrorCodes = new Set(canon.codes);

const missingInMirror = [...remoteCodes].filter((c) => !mirrorCodes.has(c));
const extraInMirror = [...mirrorCodes].filter((c) => !remoteCodes.has(c));

console.log(`    mk-api: ${remoteCodes.size} رمز · المرآة: ${mirrorCodes.size} رمز`);

let failed = false;

if (missingInMirror.length > 0) {
  console.error(`  ✗ (1) ${missingInMirror.length} رمز على mk-api غائب من المرآة:`);
  for (const c of missingInMirror) console.error(`      · ${c}`);
  failed = true;
}
if (extraInMirror.length > 0) {
  console.error(`  ✗ (1) ${extraInMirror.length} رمز في المرآة لا يوجد على mk-api:`);
  for (const c of extraInMirror) console.error(`      · ${c}`);
  failed = true;
}
if (!failed) {
  console.log('    ✓ المرآة مطابقة لـerrors.ts على mk-api.');
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
