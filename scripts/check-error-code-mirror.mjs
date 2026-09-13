#!/usr/bin/env node
/**
 * 270-ERROR-MIRROR-GATE — بوّابة مرآة رموز الأخطاء على نفس الشجرة.
 *
 * ── الحاجة ────────────────────────────────
 * `apps/api/src/errors.ts` و `scripts/mk-api-error-codes.json` مرآتان.
 * إن عُدِّل الأوّل بلا الثاني · **تباعدٌ صامت** يكتشفه أحد ما لاحقاً
 * (mkst/mkau/mkdash) على شجرةٍ أخرى بعد الدفع. المكان الصحيح للمنع هو
 * أرضنا · لا أرض من يكتشف.
 *
 * ── لماذا نفس الشجرة لا origin/feat/api ────
 * الحارس المُقارن على شجرة أخرى (audit/studio/dashboard) يقرأ
 * `git show origin/feat/api:apps/api/src/errors.ts` — يعتمد على فرعٍ
 * بعيدٍ يتحرّك. عمل هؤلاء يصير رهيناً بلحظة الدفع من feat/api.
 * البوّابة هنا تعمل بالكامل على ملفَّين محلّيَّين — لا `git show`
 * · لا remote fetch · لا race condition.
 *
 * ── الفحص ──────────────────────────────
 *   (1) استخراج codes من `errors.ts` (regex على ErrorCode union type).
 *   (2) قراءة codes من المرآة (`.codes` array).
 *   (3) فرز الجانبين · إخراج diff.
 *   • رمز في errors.ts وليس في المرآة ⇒ FAIL (mk-api أضاف · لم يُحدَّث المرآة).
 *   • رمز في المرآة وليس في errors.ts ⇒ FAIL (المرآة زائدة · errors.ts حذف).
 *   • تطابق تامّ ⇒ PASS.
 *
 * ── L-46 ──────────────────────────────
 * أضِف `MK_TEMP_L46_PROBE` إلى errors.ts فقط · شغّل هذا · فشل باسم
 * الرمز. حدِّث المرآة · يمرّ. اختبار حياة موثَّق في تقرير 270.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ERRORS_TS = join(ROOT, 'apps/api/src/errors.ts');
const MIRROR = join(ROOT, 'scripts/mk-api-error-codes.json');

function extractCodesFromErrorsTs(src) {
  // نستخرج من نوع ErrorCode union type وحده — لا من imports ولا من comments.
  const m = src.match(/export type ErrorCode\s*=\s*([\s\S]*?);/);
  if (!m) throw new Error('لم أجد `export type ErrorCode` في errors.ts');
  return [...m[1].matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((x) => x[1]);
}

const errorsSrc = readFileSync(ERRORS_TS, 'utf-8');
const codesInErrorsTs = new Set(extractCodesFromErrorsTs(errorsSrc));

const mirror = JSON.parse(readFileSync(MIRROR, 'utf-8'));
if (!Array.isArray(mirror.codes)) {
  console.error('[check-error-code-mirror] ✗ scripts/mk-api-error-codes.json يفتقر إلى `codes` كـarray.');
  process.exit(1);
}
const codesInMirror = new Set(mirror.codes);

const missingInMirror = [...codesInErrorsTs].filter((c) => !codesInMirror.has(c)).sort();
const extraInMirror = [...codesInMirror].filter((c) => !codesInErrorsTs.has(c)).sort();

if (missingInMirror.length === 0 && extraInMirror.length === 0) {
  console.log(`[check-error-code-mirror] ✓ ${codesInErrorsTs.size} رمز · errors.ts ↔ scripts/mk-api-error-codes.json متطابقتان.`);
  process.exit(0);
}

console.error(`[check-error-code-mirror] ✗ تباعد بين errors.ts والمرآة:`);
if (missingInMirror.length > 0) {
  console.error(`  ✗ ${missingInMirror.length} رمز في errors.ts وليس في المرآة:`);
  for (const c of missingInMirror) console.error(`      • ${c}`);
  console.error(`      الحلّ: أضِف هذه إلى scripts/mk-api-error-codes.json (.codes[]).`);
}
if (extraInMirror.length > 0) {
  console.error(`  ✗ ${extraInMirror.length} رمز في المرآة وليس في errors.ts:`);
  for (const c of extraInMirror) console.error(`      • ${c}`);
  console.error(`      الحلّ: احذف هذه من scripts/mk-api-error-codes.json (.codes[]) — errors.ts هو المصدر.`);
}
process.exit(1);
