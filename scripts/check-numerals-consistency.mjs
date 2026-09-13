#!/usr/bin/env node
// 350 §٤ · حارس آليّ: رقم عربيّ في المخرَج ⇒ brand.typography.bidi.numerals يجب أن تكون 'arabic'.
//
// السبب (350): الأرقام اللاتينيّة هي الديفولت · العربيّة خيار صريح.
// إن ظهر رقم عربيّ في .layout.json بينما brand ليس arabic → عطب.
//
// **يفشل بأمانة:** يقرأ .layout.json القائم في demo/marafi/ فقط (النطاق
// المعروف اليوم). أيّ توسّع مستقبليّ يضيف مجلّدات layout — يُدرج هنا.
//
// **L-46:** حقن رقم عربيّ في layout.json مع brand='marafi' + numerals='latin'
// (mock) → أحمر. إزالة الحقن → أخضر.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LAYOUT_DIR = join(ROOT, 'demo/marafi');

if (!existsSync(LAYOUT_DIR)) {
  console.log('[check-numerals-consistency] لا مجلّد demo/marafi/ · تخطّي (لا انطباق).');
  process.exit(0);
}

const ARABIC_DIGITS_RE = /[٠-٩]/;
const files = readdirSync(LAYOUT_DIR).filter(f => f.endsWith('.layout.json')).sort();

if (files.length === 0) {
  console.log('[check-numerals-consistency] لا ملفّات .layout.json · تخطّي.');
  process.exit(0);
}

// نستورد MARAFI_BRAND لمعرفة numerals المُصرَّحة في هويّتها
const { MARAFI_BRAND, DEFAULT_BRAND } = await import('@pf-mediakit/shared');
const BRAND_NUMERALS = {
  marafi:  MARAFI_BRAND.typography?.bidi?.numerals ?? 'latin',
  default: DEFAULT_BRAND.typography?.bidi?.numerals ?? 'latin',
};

let failures = 0;
console.log('[check-numerals-consistency] فحص layout.json مقابل brand.numerals');
console.log('');

for (const f of files) {
  const d = JSON.parse(readFileSync(join(LAYOUT_DIR, f), 'utf-8'));
  const brand = d.brand ?? 'unknown';
  const declared = BRAND_NUMERALS[brand] ?? 'latin';
  const processed = d.input?.headlineProcessed ?? '';
  const hasArabic = ARABIC_DIGITS_RE.test(processed);

  if (hasArabic && declared !== 'arabic') {
    console.error(`  ✗ ${f}`);
    console.error(`      brand=${brand} · brand.numerals='${declared}'`);
    console.error(`      لكنّ headlineProcessed يحوي رقماً عربيّاً: «${processed.substring(0, 60)}...»`);
    console.error(`      عطب 350: التحويل حصل بلا مفتاح صريح 'arabic'.`);
    failures++;
  }
}

if (failures > 0) {
  console.error('');
  console.error(`✗ ${failures} تسرّب — أرقام عربيّة حيث brand.numerals ليست 'arabic'`);
  process.exit(1);
}
console.log(`✓ نظيف — ${files.length} ملفّ · كلّ رقم عربيّ يقابله brand.numerals='arabic'`);
