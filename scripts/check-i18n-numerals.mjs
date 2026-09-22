#!/usr/bin/env node
// 360 §٣ · حارسُ الأرقام — لا رقمَ لاتينيّاً في نصٍّ عربيٍّ معروضٍ
// إلّا عبر placeholder أو استثناءٍ مسمّى.
//
// **السبب:** «١٢ حرفاً» في شاشة، و«12 حرفاً» في شاشةٍ ثانية، وطابعٌ
// زمنيٌّ لاتينيٌّ في ثالثة. القيمة الرقميّة الحرفيّة داخل قاموس الترجمة
// تُعطِّل تفضيلَ المستخدم `DigitStyle`، فيرى مستخدمٌ اختار «عربيّة»
// أرقاماً لاتينيّةً في نصٍّ عربيّ. الصواب: `"{n} حرفاً"` مع تنسيق
// موحَّد يستدعيه المستدعي.
//
// **النطاق:** ملفّات ar.json و mixed.json فقط (حيث لغة العرض عربيّة).
// en.json مستثنى (الأرقام اللاتينيّة صحيحة فيه).
//
// **قاعدة الالتقاط:**
//   السلسلة تحوي حرفاً عربيّاً ⇒ لا رقمَ لاتينيّاً حرفيّاً فيها.
//   الحلّ إمّا `{placeholder}` مع تنسيقٍ عند الاستدعاء، أو
//   استثناءٌ مسمّىً في `scripts/i18n-numerals-exceptions.json`.
//
// **الاستثناءات المشروعة (رموز الدعم · أرقام الإصدار · المعرّفات):**
//   نموذجُها في ملفّ الاستثناءات — كلٌّ بسطر `reason` غير فارغ.
//
// **L-46 — الأحمر ثمّ الأخضر:** أدخل `"foo": "قِفْ 12 مرّة"` إلى ar.json
// ⇒ أحمر · أزل ⇒ أخضر.

import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FILES = [
  join(ROOT, 'packages', 'i18n', 'src', 'ar.json'),
  join(ROOT, 'packages', 'i18n', 'src', 'mixed.json'),
  join(ROOT, 'apps', 'dashboard', 'src', 'i18n', 'ar.json'),
  join(ROOT, 'apps', 'dashboard', 'src', 'i18n', 'mixed.json'),
];

const EXCEPTIONS_FILE = join(ROOT, 'scripts', 'i18n-numerals-exceptions.json');

const ARABIC_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN_DIGIT = /\d/;

// نحمّل قائمة الاستثناءات — كلٌّ بمبرِّر.
let exceptions = { entries: [] };
try {
  exceptions = JSON.parse(await readFile(EXCEPTIONS_FILE, 'utf8'));
} catch {
  exceptions = { entries: [] };
}

function isExcepted(fileRel, keyPath) {
  for (const ex of exceptions.entries) {
    if (!ex.reason || !ex.reason.trim()) continue;
    if (ex.file && fileRel !== ex.file) continue;
    if (ex.key && ex.key !== keyPath) continue;
    if (ex.keyPrefix && !keyPath.startsWith(ex.keyPrefix)) continue;
    if (ex.keySuffix && !keyPath.endsWith(ex.keySuffix)) continue;
    return ex;
  }
  return null;
}

function* walkJson(obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) yield* walkJson(v, path);
    else if (typeof v === 'string') yield [path, v];
  }
}

const violations = [];
const acceptedExceptions = [];
let totalStrings = 0;

for (const file of FILES) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    console.error(`[check-i18n-numerals] ✗ قاموس مفقود: ${file}`);
    process.exit(1);
  }
  const obj = JSON.parse(raw);
  const rel = relative(ROOT, file);
  let stringsInFile = 0;
  let flaggedInFile = 0;
  for (const [key, value] of walkJson(obj)) {
    stringsInFile++;
    if (!ARABIC_LETTER.test(value)) continue;
    if (!LATIN_DIGIT.test(value)) continue;
    // نطبّق الاستثناء — كلٌّ بمبرِّر منصوص.
    const ex = isExcepted(rel, key);
    if (ex) {
      acceptedExceptions.push({ file: rel, key, reason: ex.reason, sample: value.slice(0, 80) });
      continue;
    }
    flaggedInFile++;
    violations.push({ file: rel, key, value: value.slice(0, 120) });
  }
  totalStrings += stringsInFile;
  console.log(`[check-i18n-numerals] ${rel}: ${stringsInFile} سلسلة نصّيّة · ${flaggedInFile} مخالفة`);
}

// حراسة الإبطال — L-46: القوائم يجب أن تحوي سلاسل، وإلّا انفصل الفحص عن الشيفرة.
if (totalStrings === 0) {
  console.error(`  ✗ لا سلاسل نصّيّة قُرِئت — الفحص انفصل عن الشيفرة.`);
  process.exit(1);
}

if (acceptedExceptions.length > 0) {
  console.log(`  ℹ ${acceptedExceptions.length} سلسلة فيها رقمٌ لاتينيّ مقبولٌ بسبب مسمّى:`);
  for (const e of acceptedExceptions) {
    console.log(`    · ${e.file} · ${e.key}  ← ${e.reason}`);
  }
}

if (violations.length === 0) {
  console.log('  ✓ نظيف — لا رقمَ لاتينيّاً حرفيّاً في نصّ عربيٍّ (خارج الاستثناءات).');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} سلسلة عربيّة تحوي رقماً لاتينيّاً حرفيّاً:`);
for (const v of violations) {
  console.error(`    ${v.file} · ${v.key}  «${v.value}»`);
}
console.error('');
console.error('  الحلّ: استبدل الرقم بـ`{n}` ومرّره من المستدعي عبر تنسيقٍ موحَّد (numLocal).');
console.error(`  إن كان مبرَّراً (رمز دعم · إصدار · معرِّف)، أضِفه إلى ${relative(ROOT, EXCEPTIONS_FILE)} مع reason.`);
process.exit(1);
