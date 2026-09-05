// scripts/check-lessons-sequence — يتحقّق من سلامة ترقيم LESSONS.md.
//
// **التمييز (شُدِّد 2026-09-05 بحسب قرار المالك):**
//   • **التكرار = فشل** (exit 1). رقم يشير إلى شيئَين ⇒ إشارة غامضة
//     بلا أن تبدو كذلك. الاستشهاد بالرقم يصير مُلبساً. L-58 حرفياً:
//     استثناء موثَّق داخل حارس يبقى ثغرة — «التكرار مسموح» تسامح
//     خفيّ يُبطل قيمة الحارس.
//   • **الفجوة = تحذير** (exit 0). رقم لا يشير إلى شيء ⇒ يُكتشف عند
//     أوّل استشهاد فيفشل ذلك الاستشهاد وحده. الفجوات الخمس الحالية
//     (L-37/38/39/43/44) أرقام غير مستعملة تاريخياً، غير ضارّة.
//
// **الشاهد التاريخي (L-52 · L-53):** L-48 أُعلن كمُنجَز في تقرير
// «معالجة المخرجات» لكنّه لم يُسجَّل — القفزة L-47 → L-49 كشفت الفجوة
// بعد أسبوع.
//
// **الاستخدام:** `node scripts/check-lessons-sequence.mjs`
// **الخروج:** 0 عند غياب التكرار (فجوات مسموحة كتحذير) · 1 عند تكرار.

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
  console.error('[check-lessons-sequence] ✗ لم يُوجَد أيّ درس (## L-N) في LESSONS.md');
  process.exit(1);
}

const unique = [...new Set(numbers)].sort((a, b) => a - b);
const min = unique[0];
const max = unique[unique.length - 1];
const expected = Array.from({ length: max - min + 1 }, (_, i) => min + i);
const missing = expected.filter((n) => !unique.includes(n));
const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

console.log(`[check-lessons-sequence] دروس مكتشفة: ${numbers.length} إدخال · ${unique.length} رقم فريد`);
console.log(`   المدى: L-${min} → L-${max}`);

// الفجوة = تحذير
if (missing.length > 0) {
  console.warn(`   ⚠ فجوات في الترقيم (${missing.length}): ${missing.map((n) => `L-${n}`).join(', ')}`);
  console.warn(`     أرقام غير مستعملة — تحذير لا فشل. تُكتشف عند أوّل استشهاد.`);
}

// التكرار = فشل بنيوي
if (duplicates.length > 0) {
  const uniqDupes = [...new Set(duplicates)];
  console.error(`   ✗ أرقام مكرَّرة (${uniqDupes.length}): ${uniqDupes.map((n) => `L-${n}`).join(', ')}`);
  console.error(`     رقم يشير إلى درسَين ⇒ إشارة غامضة. افصلهما إلى رقمَين مختلفَين.`);
  console.error(`     راجع docs/LESSONS.md § الدرسان المذكوران، وحدّد أيّهما يحتفظ بالرقم.`);
  process.exit(1);
}

console.log(`   ✓ لا تكرار — الترقيم سليم بنيوياً.`);
process.exit(0);
