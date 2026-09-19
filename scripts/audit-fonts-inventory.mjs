#!/usr/bin/env node
// audit-fonts-inventory — يحصي محتوى `assets/fonts/` كما هو، بلا حكمٍ
// على الرخص (ذلك عمل `check-builtin-fonts-license`). يفيد §٢ من ٤٤٠
// حين نريد أن نجيب: «كم ملفَّ خطٍّ فعلاً · كم منه له ملفُّ رخصة · هل
// كلٌّ منها يحمل متريكاتٍ يقرؤها المحرّك؟»
//
// **الفرق عن check:builtin-fonts-license:** الحارسُ يفحص `BUILTIN_FONTS`
// (ما نعرِضه للوكالة). هذا السكربتُ يفحص كلَّ ما على القرص — قد
// تكون ملفّاتُ خطٍّ محفوظةٌ للأرشيف أو مرشَّحةٌ للإضافة.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '..', 'assets', 'fonts');

// نستدعي extractFontMetrics من apps/api (المصدر الوحيد للمنطق) —
// tsx يقرأ TS مباشرةً.
const { extractFontMetrics } = await import(
  join(__dirname, '..', 'apps', 'api', 'src', 'services', 'font-metrics.ts')
);

const entries = readdirSync(FONTS_DIR).sort();
const fonts = entries.filter((f) => /\.(ttf|otf)$/i.test(f));
const licenses = entries.filter((f) => /^(OFL|LICENSE|COPYING|Apache).*\.(txt|md)$/i.test(f));

console.log(`▶ audit-fonts-inventory · ${FONTS_DIR}\n`);
console.log(`  الإحصاء العامّ:`);
console.log(`    ملفّات خطّ (ttf/otf): ${fonts.length}`);
console.log(`    ملفّات رخصة:          ${licenses.length}`);
console.log(`    ملفّات الرخصة:         ${licenses.join(' · ') || '—'}\n`);

console.log(`  التفصيل:`);
console.log(
  `    ${'الملفّ'.padEnd(38)} ${'الحجم KB'.padStart(9)} ${'المتريكات (asc/desc/upem)'.padEnd(30)}`
);
console.log('    ' + '─'.repeat(78));

let noMetrics = 0;
for (const f of fonts) {
  const p = join(FONTS_DIR, f);
  const size = statSync(p).size;
  const buf = readFileSync(p);
  const m = extractFontMetrics(buf);
  let mstr = '—';
  if (m) {
    mstr = `${m.ascent}/${m.descent}/${m.unitsPerEm} (${m.source})`;
  } else {
    noMetrics++;
    mstr = 'فشل الاستخراج';
  }
  console.log(`    ${f.padEnd(38)} ${String(Math.round(size/1024)).padStart(9)} ${mstr}`);
}

console.log('\n  خلاصة:');
console.log(`    خطوطٌ بمتريكاتٍ صحيحة: ${fonts.length - noMetrics}/${fonts.length}`);
console.log(`    خطوطٌ ينقصها متريكات:  ${noMetrics}`);
if (noMetrics > 0) {
  console.log('\n  ⚠ نقصُ المتريكات يرمي `INVALID_FONT_METRICS` عند الرندر (٨١٠).');
  process.exit(1);
}
