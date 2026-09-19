#!/usr/bin/env node
// check-builtin-fonts-license — يحرس القاعدة ٣٩٤ للخطوط المدمَجة:
//   «لا خطَّ بلا رخصةٍ حرّةٍ مسمّاة» (OFL-1.1 · Apache-2.0).
//
// **٤٣٠ §٤:** يقرأ `BUILTIN_FONTS` (نصّاً · لا استيراد TS في runtime) ثمّ
// يتحقّق لكلّ عائلة:
//   ١) `license` من القائمة المسموحة {`OFL-1.1`, `Apache-2.0`}.
//   ٢) `licenseFile` يشير إلى ملفٍّ موجودٍ فعلاً في `assets/fonts/`.
//   ٣) كلّ ملفّ TTF مذكور في `weights.*.file` موجودٌ في `assets/fonts/`.
//
// **لماذا نقرأ نصّاً لا نستورد الوحدة:** ملفّ TS يحتاج tsx transformer.
// السلسلة `BUILTIN_FONTS = [...]` قابلة للتحليل بـregex بسيطة، وتبقى
// الأداةُ زهيدةَ التبعيّات (لا opentype · لا ts-node · لا tsx). الاختبار
// الوحداتيّ (`builtin-fonts.test.ts`) يحرس المتانةَ من الطرف المقابل.
//
// **الخروج:** 0 عند النظافة، 1 عند الخرق، 2 عند فشلٍ تقنيّ (ملفّ مفقود).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_PATH = join(
  ROOT,
  'apps',
  'studio',
  'src',
  'lib',
  'builtin-fonts.ts'
);
const FONTS_DIR = join(ROOT, 'assets', 'fonts');
const ALLOWED_LICENSES = new Set(['OFL-1.1', 'Apache-2.0']);

const SELF_TEST = process.env.SELF_TEST === '1';

function extractFontsFromSource(src) {
  // نُقصّ من `export const BUILTIN_FONTS` حتى `];` — الكتلة النصّيّة كلّها.
  const start = src.indexOf('export const BUILTIN_FONTS');
  if (start < 0) throw new Error('BUILTIN_FONTS غير معلَنٍ في المصدر');
  // نقفز إلى `= [` — التحاشي `[]` في تعبير النوع `readonly BuiltinFont[]`.
  const eqIdx = src.indexOf('=', start);
  const bracketOpen = eqIdx > 0 ? src.indexOf('[', eqIdx) : -1;
  if (bracketOpen < 0) throw new Error('لم أجد `= [` بعد BUILTIN_FONTS');
  let depth = 0;
  let end = -1;
  for (let i = bracketOpen; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('BUILTIN_FONTS بلا `]` مطابق');
  const body = src.slice(bracketOpen + 1, end);

  // نُقسّم على `family: '...` — كلّ ظهورٍ يبدأ عائلةً جديدةً.
  const familyRe = /family:\s*['"]([^'"]+)['"]/g;
  const licenseRe = /license:\s*['"]([^'"]+)['"]/g;
  const licenseFileRe = /licenseFile:\s*['"]([^'"]+)['"]/g;
  const fileRe = /file:\s*['"]([^'"]+\.ttf)['"]/g;

  const families = [...body.matchAll(familyRe)].map((m) => m[1]);
  const licenses = [...body.matchAll(licenseRe)].map((m) => m[1]);
  const licenseFiles = [...body.matchAll(licenseFileRe)].map((m) => m[1]);
  const files = [...body.matchAll(fileRe)].map((m) => m[1]);

  if (families.length === 0) throw new Error('صفرُ عائلاتٍ في BUILTIN_FONTS');
  if (families.length !== licenses.length) {
    throw new Error(
      'عدد license (' + licenses.length + ') لا يطابق عدد family (' + families.length + ')'
    );
  }
  if (families.length !== licenseFiles.length) {
    throw new Error(
      'عدد licenseFile (' + licenseFiles.length + ') لا يطابق عدد family (' + families.length + ')'
    );
  }

  return { families, licenses, licenseFiles, files };
}

function main() {
  const src = readFileSync(SRC_PATH, 'utf8');
  const { families, licenses, licenseFiles, files } =
    extractFontsFromSource(src);

  const failures = [];

  // (١) رخصة كلّ عائلة من القائمة المسموحة.
  for (let i = 0; i < families.length; i++) {
    if (!ALLOWED_LICENSES.has(licenses[i])) {
      failures.push(
        `${families[i]} · license=«${licenses[i]}» ليست في القائمة المسموحة {${[...ALLOWED_LICENSES].join(', ')}}`
      );
    }
  }

  // (٢) ملفّ الرخصة موجود.
  for (let i = 0; i < families.length; i++) {
    const p = join(FONTS_DIR, licenseFiles[i]);
    if (!existsSync(p)) {
      failures.push(
        `${families[i]} · licenseFile=«${licenseFiles[i]}» غير موجود على القرص (${p})`
      );
    }
  }

  // (٣) كلّ ملفّ TTF موجود.
  for (const f of files) {
    const p = join(FONTS_DIR, f);
    if (!existsSync(p)) {
      failures.push(`ملفّ خطّ مفقود: ${f} (${p})`);
    }
  }

  if (SELF_TEST) {
    // اختبار ذاتيّ: نُبدّل «OFL-1.1» بـ«PROPRIETARY-XYZ» في نسخةٍ من المصدر
    // ونتحقّق أنّ فحصنا يرفضها. لا نمسّ الملفّ على القرص.
    // نستبدل أوّل ظهورٍ لـ`license: 'OFL-1.1'` داخل مصفوفة BUILTIN_FONTS
    // (لا في التعليقات ولا في `readonly license: ...`) بـ`PROPRIETARY-XYZ`.
    const marker = "license: 'OFL-1.1',";
    const first = src.indexOf(marker);
    if (first < 0) {
      console.error('  ✗ self-test: لم أجد marker الحقنة في المصدر');
      process.exit(2);
    }
    const injected =
      src.slice(0, first) +
      "license: 'PROPRIETARY-XYZ'," +
      src.slice(first + marker.length);
    const p = extractFontsFromSource(injected);
    const violates = p.licenses.some((l) => !ALLOWED_LICENSES.has(l));
    if (!violates) {
      console.error('  ✗ self-test: الحارس لم يرصد الرخصة المحرَّمة المزروعة');
      process.exit(2);
    }
    console.log('  ✓ self-test: الحارس رصد الرخصة المحرَّمة المزروعة');
  }

  if (failures.length > 0) {
    console.error(
      `check:builtin-fonts-license ✗ — ${failures.length} خرقاً:`
    );
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      '\n  القاعدة (٣٩٤): كلّ خطٍّ يدخل BUILTIN_FONTS يحمل license من ' +
        `${[...ALLOWED_LICENSES].join(' · ')} وله licenseFile موجود ` +
        'فعلاً في assets/fonts/.'
    );
    process.exit(1);
  }

  console.log(
    `check:builtin-fonts-license ✓ — ${families.length} خطٌّ · رخصٌ نظيفة: ` +
      [...new Set(licenses)].join(' · ')
  );
}

try {
  main();
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(2);
}
