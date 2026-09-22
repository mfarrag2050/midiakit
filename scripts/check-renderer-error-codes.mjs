#!/usr/bin/env node
// check-renderer-error-codes — بوّابة ٣٧٠.
//
// **الحاجة:** api-worker/video-gate/ink-gate تكتب رموزاً إلى renders.error_code
// (تُعاد إلى العميل عبر mapper). لا شيء يمنع إضافة رمزٍ جديدٍ في المصدر
// بلا مفتاح i18n — الحرّاسُ القائمة تحرس errors.ts↔mirror↔قواميس، لكن
// الرمز الجديد في renderer قد لا يمرّ بـerrors.ts أصلاً ⇒ ينكشف في الإنتاج.
//
// **الفحص:**
//   (1) أستخرج بادئات الأخطاء من `throw new Error(\`?<CODE>:` ومن `formatXxxFailure`
//       في الملفّات المُعلَنة.
//   (2) أطابقها مع مصدرَي القبول: `errors.ts` (ErrorCode union) أو
//       `mk-api-error-codes.json.clientOnlyCodes` (RENDER_FAILED · إلخ).
//   (3) رمزٌ في المصدر بلا موضعٍ ⇒ فشل.
//
// **الخروج:** 0 نظيف · 1 عند أيّ انحراف.
//
// **L-46:** أضِف `throw new Error('MK_PROBE_MISSING: ...')` في api-worker · شغّل ·
// فشل باسم الرمز · احذف · يمرّ.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');

// المصادر التي نمسحها بحثاً عن بادئات الأخطاء
const SCAN_FILES = [
  'apps/renderer/src/api-worker.ts',
  'apps/renderer/src/video-gate.ts',
  'apps/renderer/src/ink-gate.ts',
];

// بادئاتٌ نستخرجها من الأنماط: `throw new Error(\`?CODE:` أو `throw new UnrecoverableError(\`?CODE:`.
// النمط يقتصر على السطر (نصّ بسيط · لا AST — كافٍ للـconvention).
const CODE_RE = /throw\s+new\s+(?:Error|UnrecoverableError)\s*\(\s*[`"']([A-Z][A-Z0-9_]{2,})\s*:/g;
// نمط بديل: formatInkGateFailure/formatVideoGateFailure — نستخرج مباشرةً من
// نصّهما (نبحث في ink-gate/video-gate عن `<CODE>:` صراحةً).
const FORMAT_RE = /['"`]([A-Z][A-Z0-9_]{2,})_(EMPTY|BLOCK)?['"`]?:\s*/g;

function extractCodesFromSource(path) {
  const text = readFileSync(path, 'utf8');
  const codes = new Set();
  let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(text)) !== null) codes.add(m[1]);
  // formatXxxFailure — نبحث عن الرموز في القوالب النصّيّة (`INK_GATE_EMPTY:` وأخواتها).
  const inFormat = text.match(/`([A-Z][A-Z0-9_]{2,}):/g);
  if (inFormat) {
    for (const s of inFormat) {
      const code = s.replace(/`|:/g, '');
      codes.add(code);
    }
  }
  return codes;
}

function extractErrorsTsUnion() {
  const text = readFileSync(join(ROOT, 'apps/api/src/errors.ts'), 'utf8');
  const codes = new Set();
  // يستخرج من ErrorCode union: | 'CODE_NAME'
  for (const m of text.matchAll(/^\s*\|\s*'([A-Z][A-Z0-9_]+)'/gm)) codes.add(m[1]);
  return codes;
}

function extractClientOnly() {
  const raw = JSON.parse(readFileSync(join(ROOT, 'scripts/mk-api-error-codes.json'), 'utf8'));
  return new Set(raw.clientOnlyCodes?.codes ?? []);
}

console.log('▶ check-renderer-error-codes');

const errorsTsCodes = extractErrorsTsUnion();
const clientOnly = extractClientOnly();
const acceptedCodes = new Set([...errorsTsCodes, ...clientOnly]);
console.log(`  accepted: ${errorsTsCodes.size} errors.ts + ${clientOnly.size} clientOnly = ${acceptedCodes.size}`);

let failed = false;
for (const relPath of SCAN_FILES) {
  const codes = extractCodesFromSource(join(ROOT, relPath));
  const missing = [...codes].filter((c) => !acceptedCodes.has(c));
  console.log(`  ${relPath}: ${codes.size} رمزاً · ${missing.length} مفقود`);
  for (const m of missing) {
    console.error(`✗ ${relPath}: رمز '${m}' غير موجود في errors.ts ولا في clientOnlyCodes`);
    failed = true;
  }
}

if (failed) {
  console.error('\n✗ check-renderer-error-codes FAILED — أضِف الرمز إلى apps/api/src/errors.ts + scripts/mk-api-error-codes.json + i18n');
  process.exit(1);
}
console.log('✓ check-renderer-error-codes PASSED — كلّ رمز في المصدر يحمل موضعاً في القاموس');
