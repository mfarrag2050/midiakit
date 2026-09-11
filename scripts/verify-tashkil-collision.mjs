// verify-tashkil-collision — بوابة تشكيل يدويّة (v2 · لا يُشغَّل في pnpm test).
//
// **BASELINE-A · 2026-09-11 · تعديل النطاق:** `measuredLineHeight` لم يعد
// يستدعي pixelFactory (L-73). في v1 التشكيل مطفأ (TASHKIL-OFF 2026-09-10)،
// و`measuredLineHeight` يستعمل متريكات رأس الخطّ حصراً. هذا السكربت يبقى
// أداة تحقيق يدويّة تُبيّن الفارق بين المسارين:
//   (أ) القياس من رأس الخطّ (v1 · مطبَّق): كافٍ للنصّ العاري، أقلّ من
//       الارتفاع الفعليّ لسطر مشكَّل.
//   (ب) القياس البكسليّ (v2 · متاح لكن غير مستدعى): يكشف ذُروة التشكيل
//       الحقيقيّة. يبقى في `pixel-height.ts` كخدمة قابلة للاستدعاء.
//
// **متى يعود إلى pnpm test:** حين تُعاد ميزة التشكيل ويُتَّخذ قرار موحَّد
// (راجع `TASHKIL-METRICS-UNIFY` المقترَحة). عندها يجب أيضاً حلّ تباين
// المنصّات في القياس البكسليّ (skia vs Chrome).

import { Canvas, FontLibrary } from 'skia-canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measuredLineHeight, hasTashkil, measurePixelHeight } from '@pf-mediakit/engine';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

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

// ── (أ) وجود — القياس البكسليّ يكشف التشكيل، رأس الخطّ لا ────
console.log('════════ أ) البكسليّ يكشف التشكيل، رأس الخطّ يعطي حدّاً أدنى ثابتاً ════════');
const metrics = DEFAULT_BRAND.fonts.primary.metrics;
{
  const lhHeader = measuredLineHeight(metrics, FS, LH_MIN);
  // القياس البكسليّ لسطر مشكَّل مباشرةً (متاح كخدمة، غير مستدعى في v1)
  const fontString = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  const pxA = measurePixelHeight(pixelFactory, LINE_A[0].text, fontString);
  const pxB = measurePixelHeight(pixelFactory, LINE_B[0].text, fontString);
  const pxRaw = Math.max(pxA.ascent + pxA.descent, pxB.ascent + pxB.descent);
  const lhPixel = Math.ceil(pxRaw * 1.05);
  console.log(`    من رأس الخطّ (v1 المطبَّق): ${lhHeader}px`);
  console.log(`    البكسليّ (v2 · متاح غير مستدعى): ${lhPixel}px`);
  console.log(`    الفرق: +${lhPixel - lhHeader}px (خفاء التشكيل)`);
  assert(hasTashkil('اَللَّهُمَّ صَلِّ عَلَى'), 'hasTashkil يكشف الفتحة والشدّة والسكون');
  assert(lhPixel > lhHeader, 'القياس البكسلي أكبر — يكشف خفاء رأس الخطّ للتشكيل');
  assert(lhPixel - lhHeader >= 10, 'الفرق كبير (≥ 10px) — يستحقّ عودة تشكيل مع حلّ يدمج البكسليّ', `+${lhPixel - lhHeader}px`);
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

// ── (ب) راحة بصرية مع lineHeight المُصلَحة (بكسليّ) ─────
const SAFE_GAP = 15;   // فجوة مريحة بصرياً (لا anti-aliasing متسرّب)
console.log('\n════════ ب) سطران مشكَّلان — راحة بصرية (مع القياس البكسليّ) ════════');
let gapFixed;
{
  const fontString = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  const pxA = measurePixelHeight(pixelFactory, LINE_A[0].text, fontString);
  const pxB = measurePixelHeight(pixelFactory, LINE_B[0].text, fontString);
  const pxRaw = Math.max(pxA.ascent + pxA.descent, pxB.ascent + pxB.descent);
  const lh = Math.max(LH_MIN, Math.ceil(pxRaw * 1.05));
  const { canvas: drawn, gap } = drawTwoLinesAndMeasureGap(lh);
  gapFixed = gap;
  console.log(`    lineHeight المستخدَمة (البكسليّ): ${lh}px`);
  console.log(`    فجوة أوسع بين قاع السطر 1 وقمة السطر 2: ${gap}px`);
  assert(gap >= SAFE_GAP, `فجوة مريحة (≥ ${SAFE_GAP}px)`, `${gap}px`);
  await writeFile(join(OUT, 'tashkil-fixed.png'), drawn.toBufferSync('png'));
  console.log(`    ✓ out/tashkil-fixed.png`);
}

// ── (ج) سلبي — قياس رأس الخطّ (v1 · لا يكفي مع تشكيل) ───
console.log('\n════════ ج) سلبي — قياس رأس الخطّ يخسر ذُروة التشكيل ════════');
{
  const lhBad = measuredLineHeight(metrics, FS, LH_MIN);  // v1 المطبَّق — يفقد التشكيل
  const { canvas: drawn, gap } = drawTwoLinesAndMeasureGap(lhBad);
  console.log(`    lineHeight من رأس الخطّ: ${lhBad}px`);
  console.log(`    فجوة أوسع: ${gap}px`);
  console.log(`    الفرق مع الحالة البكسليّة: -${gapFixed - gap}px`);
  assert(gap < SAFE_GAP, `فجوة أقلّ من حدّ الأمان (< ${SAFE_GAP}px)`, `${gap}px`);
  assert(gap < gapFixed / 2, `الفرق كبير — رأس الخطّ يخسر ≥ نصف الفجوة`, `${gap}px vs ${gapFixed}px`);
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
