// scripts/preview.mjs — أول مخرج بصري للمحرك + بديل للمقارنة.
//
// **اختبار صحة معماري:** يُشغّل طبقات packages/engine مباشرةً من Node
// عبر skia-canvas بلا DOM ولا واجهة.
//
// **يُخرج ملفَّين للمقارنة البصرية:**
//   • out/preview.png    — بالإعداد الجديد (أولوية الملء ثم المقروئية،
//                          مع targetFill=0.9 وswap-down ±6px/+15%).
//   • out/preview-alt.png — بأكبر fs ممكن دون قاعدة swap-down ولا هدف
//                          ملء صريح — أي «الخيار الطباعي التقليدي».
//                          يُستعمل للمقارنة البصرية فقط.
//
// النموذج: بطاقة عاجل بمقاس Instagram العمودي (1080×1350).
// انظر تعليقات القرارات في التعليق أعلى مسار الرندر.

import { Canvas, FontLibrary } from 'skia-canvas';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  preprocessBidi,
  parseTokens,
  createCanvasMeasurer,
  wrapAlternating,
  wrapOptimal,
  drawLineRTL,
  drawSolid,
  drawGradient,
  drawBadge,
  drawLogo,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── تسجيل الخط ─────────────────────────────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };
const brand = resolveBrand(DEFAULT_BRAND);

const TEXT =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const SOURCE = 'مصدر طبي للأناضول';
const CENTER_LOWER_Y = 0.62;
const SOURCE_GAP_RATIO = 0.9;

const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

const {
  max,
  min,
  boxWidth,
  maxLines,
  minLines,
  preferredLines,
  readableMinRatio,
  targetFill,
  lineHeight,
  shortLineRatio,
  wrapMode,
} = brand.typography.breaking;

// readableMin يُشتقّ من عرض القماش (لا رقم مطلق).
const readableMin = Math.round(SIZE.w * readableMinRatio);

// ── دالة الرندر: نسختان بمعاملات مختلفة للاختيار ─────
async function renderCard({ label, outPath, wrapOptions }) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const measure = createCanvasMeasurer(ctx, brand);

  // (١) الخلفية والتدرّج
  drawSolid(ctx, SIZE, brand, { colorKey: 'urgentBg' });
  drawGradient(ctx, SIZE, brand, { direction: 'bottom' });

  // (٢) العنوان — لفّ باستخدام خيارات نسخة معيّنة
  const processed = preprocessBidi(TEXT, {
    numerals: brand.typography.bidi.numerals,
  });
  const tokens = parseTokens(processed);

  const wrap =
    wrapMode === 'alternating'
      ? wrapAlternating(
          tokens,
          boxWidth,
          max,
          min,
          false,
          maxLines,
          shortLineRatio,
          lineHeight,
          measure
        )
      : wrapOptimal(
          tokens,
          boxWidth,
          max,
          min,
          false,
          maxLines,
          shortLineRatio,
          lineHeight,
          measure,
          'uniform',
          wrapOptions
        );

  // (٣) التخطيط: anchor centerLower
  const rightX = SIZE.w - brand.margins.contentRight;
  const nLines = wrap.lines.length;
  const centerY = SIZE.h * CENTER_LOWER_Y;
  const firstBaseline = centerY - ((nLines - 1) * wrap.lineHeight) / 2;
  const lastBaseline = firstBaseline + (nLines - 1) * wrap.lineHeight;

  wrap.lines.forEach((ln, i) => {
    drawLineRTL(
      ctx,
      measure,
      ln,
      rightX,
      firstBaseline + i * wrap.lineHeight,
      wrap.fontSize,
      false,
      brand
    );
  });

  // (٤) الشارة فوق أول سطر
  drawBadge(ctx, SIZE, brand, {
    badge: brand.badges.urgent,
    rx: rightX,
    bottomY: firstBaseline - wrap.fontSize - brand.margins.badgeGap,
  });

  // (٥) المصدر أسفل السطر الأخير بمسافة نسبية
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  const sourceBaseline = lastBaseline + wrap.fontSize * SOURCE_GAP_RATIO;
  ctx.font = `${brand.typography.source.weight} ${brand.typography.source.size}px ${family}`;
  ctx.fillStyle = brand.colors.text;
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(SOURCE, rightX, sourceBaseline);

  drawLogo(ctx, SIZE, brand, {});

  await canvas.toFile(outPath);

  // (٦) تقرير الأرقام
  const widths = wrap.lines.map((ln) => measure.line(ln, wrap.fontSize, false));
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance =
    widths.reduce((s, w) => s + (w - mean) ** 2, 0) / widths.length;
  const stddev = Math.sqrt(variance);
  const minFill = Math.min(...widths.map((w) => w / boxWidth));

  console.log(`\n── ${label} → ${outPath}`);
  console.log(
    `   ${nLines} سطر · fs=${wrap.fontSize}px · lh=${wrap.lineHeight}px`
  );
  wrap.lines.forEach((ln, i) => {
    const w = widths[i];
    console.log(
      `   ${i + 1}. [${ln.length} كلمة · ${w.toFixed(0)}/${boxWidth}px · ${((w / boxWidth) * 100).toFixed(0)}%] ` +
        ln.map((t) => t.text).join(' ')
    );
  });
  console.log(
    `   إحصاء: متوسّط=${mean.toFixed(0)}px · انحراف=${stddev.toFixed(0)}px (${((stddev / mean) * 100).toFixed(1)}%) · أدنى ملء=${(minFill * 100).toFixed(1)}%`
  );

  return { fontSize: wrap.fontSize, nLines, minFill, stddevRatio: stddev / mean };
}

// ── (أ) الإعداد الجديد: الملء ثم المقروئية ─────────────
console.log(
  `[preview] قماش=${SIZE.w}×${SIZE.h} · readableMin=${readableMin}px (=${SIZE.w}×${readableMinRatio}) · targetFill=${targetFill}`
);

const primary = await renderCard({
  label: 'الإعداد الجديد (أولوية الملء)',
  outPath: join(OUT_DIR, 'preview.png'),
  wrapOptions: { minLines, preferredLines, readableMin, targetFill },
});

// ── (ب) البديل: أكبر fs ممكن بلا قاعدة swap ولا targetFill ─
// نُعطّل قاعدة التبديل نزولاً (swapMinFillGain=∞) وهدف الملء (targetFill=∞).
// النتيجة: الخوارزمية تبقى عند أكبر fs مقبول — «الخيار الطباعي التقليدي».
const alt = await renderCard({
  label: 'البديل (أكبر fs مقبول، بلا هدف ملء)',
  outPath: join(OUT_DIR, 'preview-alt.png'),
  wrapOptions: {
    minLines,
    preferredLines,
    readableMin,
    targetFill: 999, // مستحيل — يمنع مسار target-hit
    swapMinFillGain: 999, // مستحيل — يمنع swap-down
  },
});

console.log('\n── مقارنة ──');
console.log(
  `الجديد: fs=${primary.fontSize} أسطر=${primary.nLines} أدنى ملء=${(primary.minFill * 100).toFixed(1)}% انحراف=${(primary.stddevRatio * 100).toFixed(1)}%`
);
console.log(
  `البديل: fs=${alt.fontSize} أسطر=${alt.nLines} أدنى ملء=${(alt.minFill * 100).toFixed(1)}% انحراف=${(alt.stddevRatio * 100).toFixed(1)}%`
);
