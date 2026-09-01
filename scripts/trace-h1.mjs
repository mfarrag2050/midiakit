// trace-h1 — تشخيص H1 قبل إصلاح fs-drop.
//
// **السؤال:** لماذا انخفض fs من 74 إلى 56 لعنوان H1؟ ما التقسيمات
// التي أُقصيت عند fs=74، ولماذا فشل كل بديل عند نفس الحجم؟
//
// **الاستراتيجية:** عدّد كل التقسيمات الممكنة لـk=2..4 عند fs=74،
// اعرض breakPenalty لكل موضع، وحدّد أي التقسيمات:
//   - أُقصيت بـInfinity (كسر دلالي محظور)
//   - رُفضت بمعيار مقاييس (fill/stddev/single-word)

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  createCanvasMeasurer,
  preprocessBidi,
  parseTokens,
  loadDefaultLexicon,
  computeBreakPenalties,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1350 };
const HEADLINE = 'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const FS = 74;
const ALLBOLD = false;

const canvas = new Canvas(SIZE.w, SIZE.h);
const measure = createCanvasMeasurer(canvas.getContext('2d'), brand);
const lex = loadDefaultLexicon();

const processed = preprocessBidi(HEADLINE, { numerals: 'latin' });
const tokens = parseTokens(processed);
const words = tokens.filter((t) => !('br' in t));
const n = words.length;
const penalties = computeBreakPenalties(tokens, lex);

console.log(`\n[trace-h1] العنوان (${n} كلمة، fs=${FS}):`);
console.log(HEADLINE);
console.log();
console.log('الرموز وعقوبات الكسر (position i = كسر قبل tokens[i]):');
for (let i = 0; i < n; i++) {
  const p = i === 0 ? '—' : (penalties[i] === Infinity ? 'Infinity ✗' : String(penalties[i]));
  const w = words[i].text;
  console.log(`  ${String(i).padStart(2)}. ${w.padEnd(15)}  bp[${i}] = ${p}`);
}

// جرّب عدة boxWidths ضمن النطاق (من brand.typography.breaking.boxWidthRange)
const bwLow = Math.round(SIZE.w * brand.typography.breaking.boxWidthRange[0]);
const bwHigh = Math.round(SIZE.w * brand.typography.breaking.boxWidthRange[1]);
const bwCandidates = [];
for (let i = 0; i < 10; i++) {
  const t = i / 9;
  bwCandidates.push(Math.round(SIZE.w * (brand.typography.breaking.boxWidthRange[0] + t * (brand.typography.breaking.boxWidthRange[1] - brand.typography.breaking.boxWidthRange[0]))));
}

// نُعدّد كل الأزواج (بداية، نهاية) للأسطر:
// لتقسيم k أسطر، نحتاج k-1 مواضع كسر مرتّبة صعودياً في [1, n-1].
// خذ k = 2..4 (منطقي للعنوان)

function* combinations(arr, k) {
  if (k === 0) { yield []; return; }
  if (arr.length < k) return;
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

function measureLine(words, from, to) {
  return measure.line(words.slice(from, to), FS, ALLBOLD);
}

const positions = Array.from({ length: n - 1 }, (_, i) => i + 1); // [1..n-1]

// معايير الوراب (نسخة من preferLargestFs)
const justify = brand.typography.justify;
const minFill = justify.minLineFill; // 0.82
const maxLines = brand.typography.breaking.maxLines;
const minLines = brand.typography.breaking.minLines;

console.log(`\nعدد الكلمات: ${n} · fs: ${FS}`);
console.log(`المدى boxW: [${bwLow}, ${bwHigh}]`);
console.log(`قيود القبول: minLines=${minLines} · maxLines=${maxLines} · minFill=${minFill} · لا سطر بكلمة واحدة\n`);

let totalTried = 0;
let excludedByInfinity = 0;
let excludedByOverflow = 0;
let excludedBySingleWord = 0;
let excludedByMinFill = 0;
let acceptedAtSomeBw = 0;

console.log('=== كل التقسيمات لـk=3 (المطلوب لـfs=74 مع 11 كلمة) ===');
console.log(`الحاجة: k-1=2 مواضع كسر. عدد المتاح: C(${n - 1}, 2) = ${(n - 1) * (n - 2) / 2}`);
console.log();
console.log('breaks | Infinity? | line widths @ fs=74 | best bw لأي قبول');
console.log('─'.repeat(90));

for (const breaks of combinations(positions, 2)) {
  totalTried++;
  const [b1, b2] = breaks;
  const lineStarts = [0, b1, b2];
  const lineEnds = [b1, b2, n];
  const wordCounts = [b1, b2 - b1, n - b2];

  // فحص Infinity
  const hasInfinity = breaks.some((b) => penalties[b] === Infinity);
  if (hasInfinity) {
    excludedByInfinity++;
    const which = breaks.filter((b) => penalties[b] === Infinity).join(',');
    console.log(`{${breaks.join(',')}}  ✗ Infinity  bp[${which}]                                            —`);
    continue;
  }

  // فحص سطر بكلمة واحدة
  if (wordCounts.some((c) => c === 1)) {
    excludedBySingleWord++;
    console.log(`{${breaks.join(',')}}         سطر بكلمة واحدة                                          —`);
    continue;
  }

  // قياس عرض السطور
  const widths = [
    measureLine(words, 0, b1),
    measureLine(words, b1, b2),
    measureLine(words, b2, n),
  ];

  // ابحث عن أضيق bw يستوعب كل الأسطر + minFill بعد كشيدة (تقريب)
  // لكل bw: تحقّق كل line width ≤ bw، وأدنى fill (بحد أدنى) ≥ minFill
  // (الكشيدة تسدّ الفارق إن كانت السعة كافية — تقريب: بلا حسابها هنا)
  let acceptedBw = null;
  for (const bw of bwCandidates) {
    if (widths.some((w) => w > bw + 0.5)) continue; // overflow
    // آخر سطر معفى من minFill (natural)
    const nonLastFills = widths.slice(0, -1).map((w) => w / bw);
    const minNonLast = Math.min(...nonLastFills);
    if (minNonLast < minFill) continue; // fill منخفض — لن تسدّه الكشيدة هنا
    acceptedBw = bw;
    break;
  }

  const wStr = widths.map((w) => w.toFixed(0)).join(', ');
  if (acceptedBw !== null) {
    acceptedAtSomeBw++;
    console.log(`{${breaks.join(',')}}  ✓         [${wStr}]px           bw=${acceptedBw} ✓`);
  } else {
    // إمّا overflow في كل bw، أو minFill في كل bw
    const overflow = widths.some((w) => w > bwHigh + 0.5);
    if (overflow) {
      excludedByOverflow++;
      console.log(`{${breaks.join(',')}}  ✗ overflow [${wStr}]px           لا bw يسع`);
    } else {
      excludedByMinFill++;
      const maxFillHere = Math.max(
        ...bwCandidates.map((bw) =>
          widths.slice(0, -1).every((w) => w <= bw) ? Math.min(...widths.slice(0, -1).map((w) => w / bw)) : 0
        )
      );
      console.log(`{${breaks.join(',')}}  ✗ minFill  [${wStr}]px           أعلى minFill=${(maxFillHere * 100).toFixed(0)}% < ${(minFill * 100).toFixed(0)}%`);
    }
  }
}

console.log('─'.repeat(90));
console.log(`\nالمجموع: ${totalTried} تقسيم لـk=3`);
console.log(`  مقصى بـInfinity (كسر دلالي):        ${excludedByInfinity}`);
console.log(`  مقصى بسطر كلمة واحدة:               ${excludedBySingleWord}`);
console.log(`  مقصى بـoverflow (لا bw يسع):         ${excludedByOverflow}`);
console.log(`  مقصى بـminFill منخفض:                ${excludedByMinFill}`);
console.log(`  مقبول عند bw ما:                     ${acceptedAtSomeBw}`);
console.log(`\nخلاصة: عند fs=74، ${acceptedAtSomeBw > 0 ? 'كان يوجد تقسيم نظيف بديل — الوراب لم يجربه' : 'لا يوجد تقسيم نظيف — يجب الاختيار: fs أقل أو Infinity → soft'}`);
