#!/usr/bin/env node
// check-brand-editor-labels — يحرس أنّ شاشة تحرير الهوية:
//   1. تحمل i18n لكلّ مفتاح لون في `COLOR_KEYS` عبر القواميس الثلاثة.
//   2. تعرض التسمية عبر `t('pages.brandKits.editor.color.<k>')` — لا
//      عبر `{k}` مباشرة في موضع نصّ JSX.
//
// **سبب وجودها:** `check:ui-keys` لا يستطيع كشف حالة «متغيّر يحمل
// نصّاً إنجليزيّاً خاماً يُعرَض في JSX» — لأنّ الحارس يثق بكلّ
// `{expression}` أنّها ترجمة (السطر 117 هناك). هذا الحارس أضيق
// نطاقاً وأصلب دلالياً على هذه الحالة تحديداً.
//
// **اختبار الحياة (`L-46` · شكل «أحمر عند الطلب»):**
//   `node scripts/check-brand-editor-labels.mjs --self-test`
// يشغّل الحارس ضدّ fixture مكسور في
// `fixtures/brand-editor-labels-broken/`. المتوقّع: الحارس يفشل
// (يكتشف الانتهاك). إن مرّ أخضر — الحارس نفسه معطوب.
//
// **الاستعمال العاديّ:** `node scripts/check-brand-editor-labels.mjs`
// **الخروج:** 0 عند النظافة، 1 عند مخالفة.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const isSelfTest = process.argv.includes('--self-test');

const TARGET = isSelfTest
  ? {
      page: 'fixtures/brand-editor-labels-broken/page.tsx',
      dicts: [
        'fixtures/brand-editor-labels-broken/ar.json',
        'fixtures/brand-editor-labels-broken/en.json',
        'fixtures/brand-editor-labels-broken/mixed.json',
      ],
    }
  : {
      page: 'apps/studio/app/(app)/brand-kits/[id]/edit/page.tsx',
      dicts: [
        'packages/i18n/src/ar.json',
        'packages/i18n/src/en.json',
        'packages/i18n/src/mixed.json',
      ],
    };

function fail(msg) {
  console.error(`  ✗ ${msg}`);
}

async function main() {
  const violations = [];

  // ── 1. استخراج COLOR_KEYS من page.tsx ────────────────
  const pagePath = join(ROOT, TARGET.page);
  const pageSrc = await readFile(pagePath, 'utf8');
  const colorKeysMatch = pageSrc.match(
    /const\s+COLOR_KEYS\s*=\s*\[([^\]]+)\]\s*as\s+const/
  );
  if (!colorKeysMatch) {
    violations.push(
      `لم أجد ثابت \`COLOR_KEYS\` كمصفوفة \`as const\` في ${TARGET.page}. الحارس مبنيّ على وجوده.`
    );
    return violations;
  }
  const colorKeys = Array.from(
    colorKeysMatch[1].matchAll(/['"]([A-Za-z][A-Za-z0-9_]*)['"]/g)
  ).map((m) => m[1]);
  if (colorKeys.length === 0) {
    violations.push(`COLOR_KEYS فارغة في ${TARGET.page}.`);
    return violations;
  }

  // ── 2. تأكّد من مفتاح i18n لكلّ لون في القواميس الثلاثة ─
  for (const dictRel of TARGET.dicts) {
    const dictPath = join(ROOT, dictRel);
    const dictSrc = await readFile(dictPath, 'utf8');
    let dict;
    try {
      dict = JSON.parse(dictSrc);
    } catch (e) {
      violations.push(`فشل تحليل JSON: ${dictRel} — ${e.message}`);
      continue;
    }
    const colorMap = dict?.pages?.brandKits?.editor?.color;
    if (!colorMap || typeof colorMap !== 'object') {
      violations.push(
        `${dictRel}: مجموعة \`pages.brandKits.editor.color\` مفقودة.`
      );
      continue;
    }
    for (const k of colorKeys) {
      const v = colorMap[k];
      if (typeof v !== 'string' || v.trim() === '') {
        violations.push(
          `${dictRel}: \`pages.brandKits.editor.color.${k}\` مفقود أو فارغ.`
        );
        continue;
      }
      // ثقة إضافيّة: القيمة يجب ألّا تكون مطابقة للمفتاح الإنجليزيّ
      // نفسه (يمنع «ترجمة» بنسخ الاسم كما هو).
      if (v === k) {
        violations.push(
          `${dictRel}: \`pages.brandKits.editor.color.${k}\` = "${k}" (نسخ للمفتاح، لا ترجمة).`
        );
      }
    }
  }

  // ── 3. تأكّد أنّ page.tsx لا يعرض {key} خاماً في JSX ─
  // نبحث عن نمط: داخل .map(([key, hex]) => ...) هل يظهر `>{key}<`
  // في موضع نصّ JSX؟ إن ظهر، فذاك رجوع للحالة المكسورة.
  //
  // نمط رفيع: `>\s*{key}\s*<` — قد ينكسر بتنسيقات مختلفة، لذا نتحقّق
  // مباشرةً من غياب النمط. البديل الأنظف هو `t(...)`.
  const rawKeyPattern = />\s*\{\s*key\s*\}\s*</;
  if (rawKeyPattern.test(pageSrc)) {
    violations.push(
      `${TARGET.page}: العطب موجود — \`{key}\` مُعرَّض خاماً في JSX. استعمل \`t('pages.brandKits.editor.color.\${key}')\` بدلاً منه.`
    );
  }

  // نطلب صراحةً أن يظهر النمط الصحيح (t() على color.$key) — يمنع
  // إخفاء العطب بحذف السطر كلّه.
  const goodPattern =
    /t\(`pages\.brandKits\.editor\.color\.\$\{key\}`\)/;
  if (!goodPattern.test(pageSrc)) {
    violations.push(
      `${TARGET.page}: لم أجد النمط الصحيح \`t(\`pages.brandKits.editor.color.\${key}\`)\`. تسميات الألوان يجب أن تأتي من i18n.`
    );
  }

  return violations;
}

const violations = await main();

console.log(
  `[check-brand-editor-labels] target: ${TARGET.page}${isSelfTest ? ' (self-test)' : ''}`
);

if (isSelfTest) {
  // في self-test نتوقّع الفشل. الفشل = 0 · النجاح غير المتوقّع = 1.
  if (violations.length === 0) {
    console.error(
      '  ✗ self-test فشل: الحارس نفسه معطوب — لم يكتشف الانتهاك في الـfixture.'
    );
    process.exit(1);
  }
  console.log(
    `  ✓ self-test نجح: الحارس اكتشف ${violations.length} انتهاك في الـfixture.`
  );
  for (const v of violations) console.log(`      · ${v}`);
  process.exit(0);
}

if (violations.length === 0) {
  console.log('  ✓ نظيف — تسميات الألوان مترجمة عبر i18n.');
  process.exit(0);
}
for (const v of violations) fail(v);
process.exit(1);
