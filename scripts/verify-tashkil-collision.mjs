// verify-tashkil-collision — حارس انحدار عكسيّ (v2 · لا يُشغَّل في pnpm test).
//
// **إعادة تصميم · 2026-09-11 · L-77 · قرار (أ) في 98-TASHKIL-GATE-REVIVE:**
// الفاحص الأصليّ كُتب قبل BASELINE-A ليُثبت أنّ رأس الخطّ (من
// `ctx.measureText.actualBoundingBoxAscent` = em-box ≈ 1em) **لا يكفي**
// لسطر مشكَّل، وأنّ القياس البكسليّ ضروريّ. BASELINE-A غيّر مصدر رأس
// الخطّ إلى OS/2 typoAscender من opentype.js (1.085em على IBM Plex)،
// الذي **يحمل فسحة التشكيل بنيويّاً**. صارت الفرضيّات الأصليّة ميتة —
// المشكلة التي كان الفاحص يوثّقها حُلَّت.
//
// **المعنى الجديد — حارس انحدار عكسيّ:** الفاحص الآن يُثبت أنّ رأس
// الخطّ الجديد (typo-based) **كافٍ** لسطر مشكَّل، بحيث لو رجع مصدر
// المتريكات مستقبلاً إلى `measureText` أو em-box، سقط الفاحص فوراً.
// الحارس يبقى «حول ما نحرسه»: التشكيل جودة صحيفة عربيّة، والقياس مصدر
// صحّتها. تغيّرت الفرضيّة، بقيت الحراسة.
//
// **v1 tashkil معطَّل (قرار المالك 2026-09-10 · TASHKIL-OFF):** المسار
// البكسليّ (`measurePixelHeight` في `pixel-height.ts`) يبقى في الكود
// كخدمة قابلة للاستدعاء، ويُستعمَل هنا للمقارنة فقط لا للاستدعاء من
// المحرك. عندما يعود التشكيل في v2 (مع تذكرة `TASHKIL-METRICS-UNIFY`
// المقترَحة)، هذه الفرضيّات تُعاد كتابتها بحسب الميزة الجديدة.
//
// **متى يعود إلى pnpm test:** حين تُعاد ميزة التشكيل. الآن يُشغَّل يدويّاً
// بعد أيّ تغيير على مصدر متريكات الخطّ.

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

const pixelFactory = {
  create(w, h) {
    const c = new Canvas(w, h);
    return c.getContext('2d');
  },
};

const FS = 70;
const LH_MIN = FS * 1.34;
const SAFE_GAP = 15;

const LINE_A = [{ text: 'اَللَّهُمَّ صَلِّ عَلَى', bold: true, accent: false }];
const LINE_B = [{ text: 'مُحَمَّدٍ وَآلِهِ الطَّاهِرِينَ', bold: true, accent: false }];

// AMEND-55 · 2026-09-11: FontMetrics على FontWeight لا FontFamily.
// سلسلة fallback مطابقة لـpackages/engine/src/render.ts:652.
const primary = DEFAULT_BRAND.fonts.primary;
const metrics =
  primary.weights.regular.metrics ??
  primary.weights.bold.metrics ??
  primary.weights.light.metrics;
if (!metrics) throw new Error(
  '[verify-tashkil-collision] DEFAULT_BRAND بلا FontMetrics على أيّ وزن — ' +
  'خلل في التركيب لا حالة تُعالَج بالصمت.'
);

// ── (أ) مصدر رأس الخطّ هو typo لا em-box ──────────────────────────
console.log('════════ أ) رأس الخطّ الجديد (typo) يحمل فسحة التشكيل ════════');
{
  const emRatio = (metrics.ascent + metrics.descent) / metrics.unitsPerEm;
  console.log(`    (ascent + descent) / unitsPerEm = ${emRatio.toFixed(4)} em`);
  console.log(`    (em-box خالص = 1.0 em · typo يزيد فوق 1.0 لحمل الصاعد + الهابط + التشكيل)`);
  assert(
    emRatio > 1.0,
    'المتريكات تتجاوز em-box — دليل typo لا measureText',
    `${emRatio.toFixed(4)} em > 1.0`
  );
  assert(hasTashkil('اَللَّهُمَّ صَلِّ عَلَى'), 'hasTashkil يكشف الفتحة والشدّة والسكون');
}

// ── (ب) رأس الخطّ ≈ البكسليّ (فرق ≤ 5px) ─────────────────────────
console.log('\n════════ ب) رأس الخطّ الجديد ≈ القياس البكسليّ لسطر مشكَّل ════════');
let lhHeader, lhPixel;
{
  lhHeader = measuredLineHeight(metrics, FS, LH_MIN);
  const fontString = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  const pxA = measurePixelHeight(pixelFactory, LINE_A[0].text, fontString);
  const pxB = measurePixelHeight(pixelFactory, LINE_B[0].text, fontString);
  const pxRaw = Math.max(pxA.ascent + pxA.descent, pxB.ascent + pxB.descent);
  lhPixel = Math.max(LH_MIN, Math.ceil(pxRaw * 1.05));
  const diff = Math.abs(lhPixel - lhHeader);
  console.log(`    من رأس الخطّ (typo): ${lhHeader}px`);
  console.log(`    البكسليّ (قياس مباشر لتشكيل مرسوم): ${lhPixel}px`);
  console.log(`    الفرق المطلق: ${diff}px`);
  assert(
    diff <= 5,
    `رأس الخطّ يوازي البكسليّ (فرق ≤ 5px) — دليل أنّه يحمل التشكيل`,
    `${diff}px`
  );
}

// دالة قياس فجوة بين سطرَين مرسومَين بلوح canvas
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
  const baseline1 = 150;
  ctx.fillText(LINE_A[0].text, W - 40, baseline1);
  const baseline2 = baseline1 + lineHeight;
  ctx.fillText(LINE_B[0].text, W - 40, baseline2);
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  function rowHasInk(row) {
    for (let col = 0; col < W; col++) {
      const idx = (row * W + col) * 4;
      if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) return true;
    }
    return false;
  }
  let maxGap = 0, curGap = 0;
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

// ── (ج) v1 يعطي فجوة مريحة — لا حاجة للبكسليّ بعد BASELINE-A ─────
console.log('\n════════ ج) رسم بـv1 (رأس الخطّ وحده) يعطي فجوة مريحة ════════');
let gapHeader;
{
  const { canvas: drawn, gap } = drawTwoLinesAndMeasureGap(lhHeader);
  gapHeader = gap;
  console.log(`    lineHeight من رأس الخطّ: ${lhHeader}px`);
  console.log(`    فجوة أوسع بين قاع السطر 1 وقمة السطر 2: ${gap}px`);
  assert(
    gap >= SAFE_GAP,
    `v1 يعطي فجوة مريحة (≥ ${SAFE_GAP}px) — رأس الخطّ الجديد كافٍ`,
    `${gap}px`
  );
  await writeFile(join(OUT, 'tashkil-header-ok.png'), drawn.toBufferSync('png'));
  console.log(`    ✓ out/tashkil-header-ok.png`);
}

// ── (د) البكسليّ والرأسيّ يعطيان فجوتَين متوازيتَين ─────────────
console.log('\n════════ د) v1 و البكسليّ يعطيان فجوة متوازية (فرق ≤ 3px) ════════');
{
  const { canvas: drawn, gap: gapPixel } = drawTwoLinesAndMeasureGap(lhPixel);
  const diff = Math.abs(gapPixel - gapHeader);
  console.log(`    فجوة v1 (رأس الخطّ): ${gapHeader}px`);
  console.log(`    فجوة البكسليّ: ${gapPixel}px`);
  console.log(`    الفرق المطلق: ${diff}px`);
  assert(
    diff <= 3,
    `الفجوتان متوازيتان — v1 يستبدل البكسليّ بلا خسارة`,
    `${diff}px`
  );
  await writeFile(join(OUT, 'tashkil-pixel-ok.png'), drawn.toBufferSync('png'));
  console.log(`    ✓ out/tashkil-pixel-ok.png`);
}

console.log('');
if (failed === 0) {
  console.log('════════ tashkil-collision gate ✓ (typo يحمل التشكيل — كما يجب) ════════');
  console.log('');
  console.log('  → هذا الفاحص يُطلَق أحمر إن رجع مصدر متريكات الخطّ إلى');
  console.log('    measureText/em-box، أو إذا انخفضت قيَم typoAscender بحيث');
  console.log('    لا تعود تحمل التشكيل. حارس انحدار على BASELINE-A.');
} else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  console.log('');
  console.log('  → السقوط يعني: مصدر متريكات الخطّ لم يعد يحمل التشكيل.');
  console.log('    راجع packages/engine/src/text/dynamic-line-height.ts');
  console.log('    وpackages/shared/src/default-brand.ts للمتريكات الحاليّة.');
  process.exit(1);
}
