// scripts/check-doc-paths — يفشل البناء إن أحالت وثيقة تسويقية إلى
// مسار في out/ (المؤقّت، gitignored). L-48 حرفياً: «المخرج الذي يُعرض
// لا يعيش في مجلد مؤقت».
//
// **الوثائق المُراقَبة:** docs/M1-marketing-assets.md + docs/M2-launch-collateral.md.
// **الأنماط المحظورة:** أيّ سطر يحوي `out/<something>` كمسار مذكور.
// **الاستثناءات الشرعية:**
//   • أسطر تشرح القاعدة نفسها (تحوي كلمة «out/» في سياق توضيحي).
//   • مسارات `services/*/out/**` — هذه مؤقّتات خدمة معزولة، ليست مجلد
//     المشروع الرئيسي (services/transcriber/out/news_wer.json مثلاً).
//   • المسارات داخل code fences (سكربتات مقتبسة كأمثلة).
//
// **الاستخدام:** `node scripts/check-doc-paths.mjs`
// **الخروج:** 0 عند النظافة، 1 عند تسرّب.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MONITORED = [
  'docs/M1-marketing-assets.md',
  'docs/M2-launch-collateral.md',
];

// نمط مسار في out/ خارج services/ — يُخرج match على `out/xxx`
// نتجنّب `services/*/out/` عبر lookbehind (لا يجوز أن يسبقه `/`).
const OUT_PATTERN = /(?<![./\w])out\/[a-zA-Z0-9_\-.]+/g;

// أسطر مستثناة صراحةً (تشرح القاعدة أو تذكر out/ كنمط لا كمسار):
const EXCLUDE_LINE_MARKERS = [
  'L-48',
  'out/ (المؤقّت',
  'out/ المستثنى',
  '`out/`',        // ذكر مقتبس رسمياً كنمط
  'out/*',         // ذكر كنمط عام لا مسار محدد
];

let failed = 0;
const violations = [];

for (const rel of MONITORED) {
  let content;
  try {
    content = await readFile(join(ROOT, rel), 'utf8');
  } catch {
    console.log(`  ⚠  ${rel} — الملف غير موجود، تخطٍّ`);
    continue;
  }
  const lines = content.split('\n');
  let inCodeFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // تجاهل داخل code fences
    if (line.trim().startsWith('```')) { inCodeFence = !inCodeFence; continue; }
    if (inCodeFence) continue;
    // تجاهل الأسطر المستثناة
    if (EXCLUDE_LINE_MARKERS.some((marker) => line.includes(marker))) continue;
    // بحث النمط
    const matches = line.matchAll(OUT_PATTERN);
    for (const m of matches) {
      violations.push({ file: rel, line: i + 1, match: m[0], text: line.trim() });
    }
  }
}

console.log(`[check-doc-paths] فحص ${MONITORED.length} وثيقة تسويقية …`);
console.log('');

if (violations.length === 0) {
  console.log('  ✓ نظيف — لا إحالة من وثيقة إلى out/ (المؤقّت).');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} إحالة إلى out/ من وثيقة تسويقية:`);
console.error('');
for (const v of violations) {
  console.error(`    ${v.file}:${v.line} — «${v.match}»`);
  console.error(`      ${v.text.slice(0, 120)}${v.text.length > 120 ? '…' : ''}`);
}
console.error('');
console.error('  الحل (L-48):');
console.error('    • انقل المخرج من out/ إلى demo/ (منتقى، مُتَتبَّع في git)');
console.error('    • حدّث المسار في الوثيقة إلى demo/<file>');
console.error('    • أو استعمل snapshots*/ إن كان مرجعاً لا عرضاً');
process.exit(1);
