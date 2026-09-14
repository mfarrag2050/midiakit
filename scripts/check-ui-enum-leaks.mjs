#!/usr/bin/env node
// check-ui-enum-leaks — الحارس الضيّق ضدّ تسرّب «قيمة معدودة» إلى
// النصّ المُصيَّر على شاشة تحرير الهوية.
//
// **فلسفة الحارس** (قرار المالك 2026-09-11):
//   - قائمة صريحة من القيَم المعدودة المعروفة في الشاشة.
//   - يفشل إن ظهرت إحداها **نصّاً مُصيَّراً**، إمّا:
//     (١) عبر تعبير `{identity.X}` لحقل معدود (X في `ENUM_FIELDS`)،
//     (٢) أو حرفيّاً كنصّ JSX (`<span>bottom-left</span>`).
//   - **لا يفحص** القيَم المفتوحة (`#B78D2E` · مسار شعار · اسم عائلة
//     خطّ · حجم بكسل) — تُعرَض بحرفها وهي صحيحة.
//   - **لا يستبدل** الحارس العامّ (النهج أ · type-aware) — تذكرةٌ تالية.
//
// **اختبار الحياة (`L-46`):**
//   `pnpm check:ui-enum-leaks:self-test`
// يشغّل الحارس ضدّ fixture مكسور. المتوقّع: يكتشف الانتهاك (أحمر).
// إن مرّ أخضر ⇒ الحارس معطوب.
//
// **الاستعمال العاديّ:** `pnpm check:ui-enum-leaks`

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const isSelfTest = process.argv.includes('--self-test');

const TARGET_FILE = isSelfTest
  ? 'fixtures/brand-editor-enum-leak-broken/page.tsx'
  : 'apps/studio/app/(app)/brand-kits/[id]/edit/page.tsx';

// حقول `identity.*` معروفة أنّها معدودة (اتّحاد حرفيّ · boolean).
// أيّ عرض بارز لها في JSX (بلا `t(...)`) يسرّب القيمة الخام.
const ENUM_FIELDS = [
  'direction',
  'locale',
  'logoPosition',
  'fontSource',
  'bidiEnabled',
  'numerals',
];

// قيَم القوائم المغلقة نفسها. إن ظهرت **حرفيّاً** كنصّ JSX
// (مثل `<span>bottom-left</span>`) فذاك تسرّب مباشر.
const ENUM_VALUES = [
  'rtl',
  'ltr',
  'ar',
  'en',
  'fr',
  'tr',
  'es',
  'de',
  'mixed',
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
];

function lineOf(src, index) {
  return src.substring(0, index).split('\n').length;
}

function stripComments(src) {
  // نحذف `//` و`/* */` كلاهما · التعليقات ليست شيفرة تُصيَّر.
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

async function main() {
  const path = join(ROOT, TARGET_FILE);
  const src = await readFile(path, 'utf8');
  const clean = stripComments(src);

  const violations = [];

  // ── الفحص (١): `{identity.X}` بارز — X في ENUM_FIELDS ─────
  // اللوكاهيد `(?<!\$)` يستبعد `${identity.X}` (داخل template literal
  // مغلَّف عادةً بـ`t(\`...\${identity.X}\`)` — استعمال مشروع).
  for (const field of ENUM_FIELDS) {
    const re = new RegExp(
      `(?<!\\$)\\{\\s*identity\\.${field}\\s*\\}`,
      'g'
    );
    let m;
    while ((m = re.exec(clean)) !== null) {
      violations.push({
        file: TARGET_FILE,
        line: lineOf(clean, m.index),
        kind: 'bare-enum-field',
        token: `{identity.${field}}`,
        detail: `\`identity.${field}\` معدود · لفّه بـ\`t(\`pages.brandKits.editor.<group>.\${identity.${field}}\`)\`.`,
      });
    }
  }

  // ── الفحص (٢): قيمة معدودة حرفيّاً كنصّ JSX ────────────────
  // نبحث عن التوكن بين وسمَي JSX متتاليَين، مع تجاهل التعابير `{...}`.
  // مثال قابل للاصطياد: `<span>bottom-left</span>` · `<div>rtl</div>`.
  // لوكاهيد على وسم الإغلاق كي لا نستهلكه ⇒ يعمل الالتقاط التالي على
  // الوسم التالي مباشرةً (`<span>rtl</span>` داخل `<div>...<span>rtl</span></div>`).
  const JSX_TEXT_RE = /<[A-Za-z][^<>]*?>([^<{}]+?)(?=<\/?[A-Za-z])/g;
  let jm;
  while ((jm = JSX_TEXT_RE.exec(clean)) !== null) {
    const raw = jm[1];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.includes('\n')) continue;
    const tokens = trimmed.split(/\s+/);
    for (const tok of tokens) {
      if (ENUM_VALUES.includes(tok)) {
        violations.push({
          file: TARGET_FILE,
          line: lineOf(clean, jm.index),
          kind: 'literal-enum-value',
          token: tok,
          detail: `القيمة "${tok}" من قائمة معدودة معروضة حرفيّاً · مرّرها عبر \`t(...)\`.`,
        });
      }
    }
  }

  return violations;
}

const violations = await main();

console.log(
  `[check-ui-enum-leaks] target: ${TARGET_FILE}${isSelfTest ? ' (self-test)' : ''}`
);

if (isSelfTest) {
  if (violations.length === 0) {
    console.error(
      '  ✗ self-test فشل: الحارس نفسه معطوب — لم يكتشف الانتهاك في الـfixture.'
    );
    process.exit(1);
  }
  console.log(
    `  ✓ self-test نجح: الحارس اكتشف ${violations.length} تسرّباً في الـfixture.`
  );
  for (const v of violations)
    console.log(
      `      · ${v.file}:${v.line}  [${v.kind}]  «${v.token}» — ${v.detail}`
    );
  process.exit(0);
}

if (violations.length === 0) {
  console.log('  ✓ نظيف — لا تسرّب قيمة معدودة.');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} تسرّب:`);
for (const v of violations) {
  console.error(`    ${v.file}:${v.line}  [${v.kind}]  «${v.token}»`);
  console.error(`      → ${v.detail}`);
}
process.exit(1);
