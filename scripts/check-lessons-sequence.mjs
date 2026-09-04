// scripts/check-lessons-numbering — يتحقّق أن ترقيم LESSONS.md متصل.
//
// **الشاهد التاريخي (L-52 · L-53):** L-48 أُعلن كمُنجَز في تقرير
// «معالجة المخرجات» لكنّه لم يُسجَّل — القفزة L-47 → L-49 كشفت الفجوة
// بعد أسبوع. الفجوة في الترقيم مؤشر آلي على عمل أُعلن ولم يُنفَّذ
// (على الأقلّ توثيقياً).
//
// **الاستخدام:** `node scripts/check-lessons-numbering.mjs`
// **الخروج:** 0 عند الاتّصال، 1 عند فجوة.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LESSONS = join(ROOT, 'docs/LESSONS.md');

const content = await readFile(LESSONS, 'utf8');
const numbers = [];
const HEADER_RE = /^##\s+L-(\d+)\s/gm;
let match;
while ((match = HEADER_RE.exec(content)) !== null) {
  numbers.push(parseInt(match[1], 10));
}

if (numbers.length === 0) {
  console.error('[check-lessons-numbering] ✗ لم يُوجَد أيّ درس (## L-N) في LESSONS.md');
  process.exit(1);
}

// نُوحّد التسلسل — قد تظهر نسختان بنفس الرقم (تحرير مكرَّر يستحق مراجعة
// لكن ليس فجوة).
const unique = [...new Set(numbers)].sort((a, b) => a - b);
const min = unique[0];
const max = unique[unique.length - 1];
const expected = Array.from({ length: max - min + 1 }, (_, i) => min + i);
const missing = expected.filter((n) => !unique.includes(n));
const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

console.log(`[check-lessons-numbering] دروس مكتشفة: ${numbers.length} إدخال · ${unique.length} رقم فريد`);
console.log(`   المدى: L-${min} → L-${max}`);

let failed = 0;
if (missing.length > 0) {
  console.error(`   ✗ فجوات في الترقيم (${missing.length}): ${missing.map((n) => `L-${n}`).join(', ')}`);
  console.error(`     المعنى المرجَّح (L-52 · L-53): عمل أُعلن كمُنجَز لكن لم يُوثَّق.`);
  failed++;
}
if (duplicates.length > 0) {
  const uniqDupes = [...new Set(duplicates)];
  console.warn(`   ⚠ أرقام مكرَّرة (${uniqDupes.length}): ${uniqDupes.map((n) => `L-${n}`).join(', ')}`);
  console.warn(`     التكرار مسموح (تحرير عبر جولات) لكن يستحق دمجاً.`);
}

if (failed === 0 && missing.length === 0) {
  console.log(`   ✓ ترقيم متّصل بلا فجوات.`);
  process.exit(0);
}
process.exit(1);
