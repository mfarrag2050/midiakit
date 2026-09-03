// scripts/compare-wrap.mjs
//
// مقارنة بين `wrapAlternating` (الجشِعة، @deprecated — نُحتفظ بها للمقارنة
// فقط) و `wrapOptimal` (البرمجة الديناميكية، الافتراضية الجديدة).
//
// المرجع الأصلي **ليس مرجعاً للجودة** — هو مصدر قيم فقط. حذفنا عمود
// المقارنة معه؛ معيارنا الآن الطباعة العربية الصحيحة كما في الصحافة
// المحترفة: بلا سطر بكلمة واحدة، بلا يتيم أخير، ملء ضمن ±15% من الحد
// المستهدف.
//
// يُخرج الجدول: لكل سطر (رقم، النص، العرض بالبكسل، نسبة الملء من الحدّ).
// ثم يحسب متوسّط الفيلينج وأدنى فيلينج لكل خوارزمية — الرقم الحاسم للجودة.

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  parseTokens,
  createCanvasMeasurer,
  wrapAlternating,
  wrapOptimal,
} from '@pf-mediakit/engine';

// ── إعداد ctx بنفس الخط ─────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const canvas = new Canvas(1080, 1350);
const ctx = canvas.getContext('2d');

// ── معاملات مأخوذة من DEFAULT_BRAND ─────────────────────

const TEXT =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';

const { max: MAX_FS, min: MIN_FS, boxWidth: BOX_W, maxLines: MAX_LINES,
        lineHeight: LEAD, shortLineRatio: SHORT_RATIO } =
  DEFAULT_BRAND.typography.breaking;

console.log('── المعاملات (من DEFAULT_BRAND.typography.breaking) ──');
console.log(`  boxW        = ${BOX_W}`);
console.log(`  shortRatio  = ${SHORT_RATIO}`);
console.log(`  حدّ الفردي   = ${BOX_W}`);
console.log(`  حدّ الزوجي   = ${BOX_W * SHORT_RATIO}`);
console.log(`  maxFontSize = ${MAX_FS}`);
console.log(`  minFontSize = ${MIN_FS}`);
console.log(`  maxLines    = ${MAX_LINES}`);
console.log('');

// ── تشغيل الاثنتين ─────────────────────────────────────

const tokens = parseTokens(TEXT);
const measure = createCanvasMeasurer(ctx, DEFAULT_BRAND);

const alt = wrapAlternating(
  tokens,
  BOX_W,
  MAX_FS,
  MIN_FS,
  false,
  MAX_LINES,
  SHORT_RATIO,
  LEAD,
  measure
);

const opt = wrapOptimal(
  tokens,
  BOX_W,
  MAX_FS,
  MIN_FS,
  false,
  MAX_LINES,
  SHORT_RATIO,
  LEAD,
  measure
);

// ── تحليل نتائج (عرض/ملء لكل سطر) ─────────────────────

function analyze(result) {
  const lineLimit = (i) => (i % 2 === 0 ? BOX_W : BOX_W * SHORT_RATIO);
  const rows = result.lines.map((ln, i) => {
    const w = measure.line(ln, result.fontSize, false);
    const lim = lineLimit(i);
    return {
      idx: i + 1,
      text: ln.map((t) => t.text).join(' '),
      words: ln.length,
      width: w,
      limit: lim,
      fill: w / lim,
    };
  });
  const nonLastFills = rows.slice(0, -1).map((r) => r.fill);
  const avgFill = rows.reduce((s, r) => s + r.fill, 0) / rows.length;
  const minFillNonLast = nonLastFills.length > 0
    ? Math.min(...nonLastFills)
    : rows[0]?.fill ?? 0;
  const singleWordCount = rows.filter((r) => r.words === 1).length;
  const orphaned =
    rows.length > 1 &&
    (rows[rows.length - 1].words === 1 ||
      rows[rows.length - 1].fill < 0.4);
  return {
    rows,
    fontSize: result.fontSize,
    lineHeight: result.lineHeight,
    avgFill,
    minFillNonLast,
    singleWordCount,
    orphaned,
  };
}

const A = analyze(alt);
const O = analyze(opt);

// ── طباعة الجداول ─────────────────────────────────────

function printTable(label, ana) {
  console.log(`── ${label} ──`);
  console.log(
    `fs=${ana.fontSize}  lh=${ana.lineHeight}  أسطر=${ana.rows.length}  ` +
      `متوسط ملء=${(ana.avgFill * 100).toFixed(0)}%  ` +
      `أدنى ملء (غير الأخير)=${(ana.minFillNonLast * 100).toFixed(0)}%  ` +
      `سطر بكلمة واحدة=${ana.singleWordCount}  ` +
      `يتيم أخير=${ana.orphaned ? 'نعم' : 'لا'}`
  );
  console.log(
    '┌─────┬───────────────────────────────────────────┬───────┬─────────┬─────┬────────┐'
  );
  console.log(
    '│  #  │ النص                                      │ كلمات │ عرض     │ حدّ  │ ملء    │'
  );
  console.log(
    '├─────┼───────────────────────────────────────────┼───────┼─────────┼─────┼────────┤'
  );
  const pad = (s, n) => {
    const str = String(s);
    const len = [...str].length;
    return str + ' '.repeat(Math.max(0, n - len));
  };
  for (const r of ana.rows) {
    console.log(
      `│ ${pad(r.idx, 3)} │ ${pad(r.text, 42)}│ ${pad(r.words, 5)} │ ` +
        `${pad(r.width.toFixed(0), 7)} │ ${pad(r.limit, 3)} │ ` +
        `${pad((r.fill * 100).toFixed(0) + '%', 6)} │`
    );
  }
  console.log(
    '└─────┴───────────────────────────────────────────┴───────┴─────────┴─────┴────────┘'
  );
  console.log('');
}

printTable('wrapAlternating (@deprecated — الجشِعة)', A);
printTable('wrapOptimal (الافتراضية — DP)', O);

// ── الحكم ─────────────────────────────────────────────

console.log('── الحكم ──');
const optWins =
  O.singleWordCount === 0 &&
  !O.orphaned &&
  O.minFillNonLast >= 0.7 &&
  (A.singleWordCount > 0 || A.orphaned || A.minFillNonLast < 0.7);

if (optWins) {
  console.log(
    '✓ wrapOptimal يُنتج تخطيطاً طباعياً نظيفاً حيث تفشل wrapAlternating.'
  );
  console.log('  المكاسب:');
  if (A.singleWordCount > 0)
    console.log(
      `    • أزال ${A.singleWordCount} سطر بكلمة واحدة`
    );
  if (A.orphaned) console.log('    • أزال السطر الأخير اليتيم');
  if (A.minFillNonLast < 0.7)
    console.log(
      `    • رفع أدنى ملء من ${(A.minFillNonLast * 100).toFixed(0)}% إلى ${(O.minFillNonLast * 100).toFixed(0)}%`
    );
} else if (
  O.singleWordCount === 0 &&
  !O.orphaned &&
  A.singleWordCount === 0 &&
  !A.orphaned
) {
  console.log(
    '≈ كلاهما مقبول لهذا النص — الأمثلي أفضل في المتوسّط، الجشِعة كفت.'
  );
} else {
  console.log('؟ نتيجة غير حاسمة — راجع الجداول أعلاه.');
}

process.exit(0);
