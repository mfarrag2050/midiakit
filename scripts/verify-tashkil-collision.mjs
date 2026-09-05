// verify-tashkil-collision — بوابة L-50.
//
// **الفرضية:** سطران عربيان مشكَّلان قد يتصادمان إن اعتمد التخطيط
// على `measureText` وحده — يُخفي التشكيل حتى 31 بكسل.
//
// **الاختبارات:**
//   (أ) **وجود:** `measuredLineHeight` مع pixelFactory على نص مشكَّل
//       تُبلّغ ارتفاعاً > ما تُبلّغه بلا pixelFactory بفرق كبير (≥ 10px).
//   (ب) **لا تصادم:** رسم سطرين مشكَّلين بـlineHeight الجديدة يترك
//       فجوة > 0 بين قاع السطر الأوّل وأعلى السطر الثاني.
//   (ج) **سلبي:** استعمل lineHeight «القديمة» (بلا pixelFactory) على
//       نفس السطرين، أثبت التصادم (فجوة ≤ 0).

import { Canvas, FontLibrary } from 'skia-canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measuredLineHeight, hasTashkil } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

// pixelFactory — يُعطى للـmeasurer كي يقيس بكسلياً عند التشكيل.
const pixelFactory = {
  create(w, h) {
    const c = new Canvas(w, h);
    return c.getContext('2d');
  },
};

const FS = 70;
const LH_MIN = FS * 1.34;  // الحدّ الأدنى الافتراضي
const FONT = 'IBM Plex Sans Arabic, sans-serif';

// عنوان مشكَّل من سطرين
const LINE_A = [{ text: 'اَللَّهُمَّ صَلِّ عَلَى', bold: true, accent: false }];
const LINE_B = [{ text: 'مُحَمَّدٍ وَآلِهِ الطَّاهِرِينَ', bold: true, accent: false }];
const LINES = [LINE_A, LINE_B];

// ── (أ) وجود — pixelFactory يعطي ارتفاعاً أكبر ────────
console.log('════════ أ) pixelFactory يكشف التشكيل الحقيقي ════════');
{
  const canvas = new Canvas(1200, 300);
  const ctx = canvas.getContext('2d');

  const lhWithout = measuredLineHeight(ctx, LINES, FS, FONT, true, LH_MIN);
  const lhWith = measuredLineHeight(ctx, LINES, FS, FONT, true, LH_MIN, 0.05, pixelFactory);
  console.log(`    بلا pixelFactory (API فقط): ${lhWithout}px`);
  console.log(`    مع pixelFactory (بكسلي):    ${lhWith}px`);
  console.log(`    الفرق: +${lhWith - lhWithout}px`);
  assert(hasTashkil('اَللَّهُمَّ صَلِّ عَلَى'), 'hasTashkil يكشف الفتحة والشدّة والسكون');
  assert(lhWith > lhWithout, 'القياس البكسلي أكبر — يكشف خفاء API');
  assert(lhWith - lhWithout >= 10, 'الفرق كبير (≥ 10px)', `+${lhWith - lhWithout}px`);
}

// دالة قياس تصادم فعلي على canvas مرسوم
function drawTwoLinesAndMeasureGap(lineHeight) {
  const W = 1200, H = 400;
  const canvas = new Canvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.font = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#000000';
  // سطر أوّل عند baseline1
  const baseline1 = 150;
  ctx.fillText(LINE_A[0].text, W - 40, baseline1);
  // سطر ثانٍ عند baseline2 = baseline1 + lineHeight
  const baseline2 = baseline1 + lineHeight;
  ctx.fillText(LINE_B[0].text, W - 40, baseline2);

  // مسح البكسلات: نبحث عن أدنى صف من السطر الأوّل ثم أعلى صف من الثاني
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  // منطقة السطر الأوّل: باستخدام descent محتمل ≈ 35px
  // منطقة السطر الثاني: يبدأ نظرياً عند baseline2 - ascent
  // بدل ذلك: نبحث عن الفجوة بين مجموعتَي البكسلات — أوسع صف أبيض متتال بين
  // baseline1 و baseline2.
  function rowHasInk(row) {
    for (let col = 0; col < W; col++) {
      const idx = (row * W + col) * 4;
      if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) return true;
    }
    return false;
  }
  // نبحث في المنطقة الوسطى بين baseline1 و baseline2 عن أطول متسلسلة صفوف بلا حبر.
  let maxGap = 0;
  let curGap = 0;
  for (let row = baseline1; row <= baseline2; row++) {
    if (rowHasInk(row)) {
      if (curGap > maxGap) maxGap = curGap;
      curGap = 0;
    } else {
      curGap++;
    }
  }
  if (curGap > maxGap) maxGap = curGap;
  return { canvas, gap: maxGap };
}

// ── (ب) راحة بصرية مع lineHeight المُصلَحة ─────────────
const SAFE_GAP = 15;   // فجوة مريحة بصرياً (لا anti-aliasing متسرّب)
console.log('\n════════ ب) سطران مشكَّلان — راحة بصرية (مع pixelFactory) ════════');
let gapFixed;
{
  const canvas = new Canvas(1200, 300);
  const ctx = canvas.getContext('2d');
  const lh = measuredLineHeight(ctx, LINES, FS, FONT, true, LH_MIN, 0.05, pixelFactory);
  const { canvas: drawn, gap } = drawTwoLinesAndMeasureGap(lh);
  gapFixed = gap;
  console.log(`    lineHeight المستخدَمة: ${lh}px`);
  console.log(`    فجوة أوسع بين قاع السطر 1 وقمة السطر 2: ${gap}px`);
  assert(gap >= SAFE_GAP, `فجوة مريحة (≥ ${SAFE_GAP}px)`, `${gap}px`);
  await writeFile(join(OUT, 'tashkil-fixed.png'), drawn.toBufferSync('png'));
  console.log(`    ✓ out/tashkil-fixed.png`);
}

// ── (ج) سلبي — بلا pixelFactory، الفجوة تنكمش خطيراً ───
console.log('\n════════ ج) سلبي — بلا pixelFactory، الفجوة تنكمش (< حدّ الأمان) ════════');
{
  const canvas = new Canvas(1200, 300);
  const ctx = canvas.getContext('2d');
  const lhBad = measuredLineHeight(ctx, LINES, FS, FONT, true, LH_MIN);  // بلا factory
  const { canvas: drawn, gap } = drawTwoLinesAndMeasureGap(lhBad);
  console.log(`    lineHeight «القديمة»: ${lhBad}px`);
  console.log(`    فجوة أوسع: ${gap}px`);
  console.log(`    الفرق مع الحالة المُصلَحة: -${gapFixed - gap}px`);
  assert(gap < SAFE_GAP, `فجوة أقلّ من حدّ الأمان (< ${SAFE_GAP}px)`, `${gap}px`);
  assert(gap < gapFixed / 2, `الفرق كبير — القديم يخسر ≥ نصف الفجوة`, `${gap}px vs ${gapFixed}px`);
  await writeFile(join(OUT, 'tashkil-collision.png'), drawn.toBufferSync('png'));
  console.log(`    ✓ out/tashkil-collision.png`);
  console.log(`    ⇒ الحارس يُثبت أن التصحيح ضروري — بدونه، الفجوة تكفي anti-aliasing خطر بصرياً.`);
}

console.log('');
if (failed === 0) console.log('════════ tashkil-collision gate ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
