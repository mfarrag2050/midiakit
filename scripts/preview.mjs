// scripts/preview.mjs — معاينة متعدّدة الهويات.
//
// **الاستخدام:**
//   pnpm preview                              # هوية DEFAULT_BRAND
//   pnpm preview -- --brand=default
//   pnpm preview -- --brand=client-demo       # brands/client-demo.json
//
// **بوابة المرحلة 1:** «تشغيل الأداة بهويتين مختلفتين دون لمس كود
// الرسم». إثبات الفصل بين المحرك والهوية — كل الاختلاف يأتي من
// `BrandKit`، لا من تفريعات في المحرك.
//
// **المخرجات:**
//   • out/preview-<brand>.png            — الكشيدة مفعّلة
//   • out/preview-<brand>-nokashida.png  — مرجع بلا كشيدة

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  preprocessBidi,
  parseTokens,
  createCanvasMeasurer,
  wrapOptimal,
  drawLineRTL,
  drawSolid,
  drawGradient,
  drawBadge,
  drawLogo,
  detectFontCaps,
  justifyLine,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── وسائط سطر الأوامر ─────────────────────────────────
const brandArg = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--brand=(.+)$/);
    if (m) return m[1];
  }
  return 'default';
})();

// ── تحميل الهوية ──────────────────────────────────────
async function loadBrandRaw(name) {
  if (name === 'default') return DEFAULT_BRAND;
  const path = join(ROOT, 'brands', `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`[preview] brands/${name}.json غير موجود`);
  }
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

const brandRaw = await loadBrandRaw(brandArg);
const brand = resolveBrand(brandRaw);

// ── تسجيل الخط ديناميكياً من brand.fonts.primary.weights ─
//
// إن كانت weights.*.url فارغة (حالة DEFAULT_BRAND)، نستعمل خط IBM Plex
// المحلي كتراجع صامت — لأن DEFAULT_BRAND معماري لا ملفاتي.
const FONTS_DIR = join(ROOT, 'assets/fonts');
const IBM_PLEX_FALLBACK = [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
];

function resolveFontPath(url) {
  if (!url) return null;
  return isAbsolute(url) ? url : pathResolve(ROOT, url);
}

const weights = brand.fonts.primary.weights;
const fontPaths = [weights.light.url, weights.regular.url, weights.bold.url]
  .map(resolveFontPath)
  .filter(Boolean);

if (fontPaths.length > 0) {
  FontLibrary.use(brand.fonts.primary.family, fontPaths);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (${fontPaths.length} أوزان من brand.json)`
  );
} else {
  FontLibrary.use(brand.fonts.primary.family, IBM_PLEX_FALLBACK);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (تراجع IBM Plex — brand بلا مسارات)`
  );
}

// ── الثوابت المشتركة ──────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const TEXT =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const SOURCE = 'مصدر طبي للأناضول';
const CENTER_LOWER_Y = 0.62;
const SOURCE_GAP_RATIO = 1.4;

const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

const {
  max,
  min,
  boxWidth,
  boxWidthRange,
  headlineFsRatio,
  maxLines,
  minLines,
  preferredLines,
  readableMinRatio,
  lineHeight,
  shortLineRatio,
} = brand.typography.breaking;

const readableMin = Math.round(SIZE.w * readableMinRatio);

const [bwMinRatio, bwMaxRatio] = boxWidthRange;
const BW_STEPS = 10;
const boxWidthCandidates = [];
for (let i = 0; i < BW_STEPS; i++) {
  const t = i / (BW_STEPS - 1);
  const ratio = bwMinRatio + t * (bwMaxRatio - bwMinRatio);
  boxWidthCandidates.push(Math.round(SIZE.w * ratio));
}

const fsRange = [
  Math.round(SIZE.w * headlineFsRatio[0]),
  Math.round(SIZE.w * headlineFsRatio[1]),
];

// ── كشف قدرات الخط لمرة واحدة ─────────────────────────
{
  const probeCanvas = new Canvas(10, 10);
  const probeCtx = probeCanvas.getContext('2d');
  const probeMeasure = createCanvasMeasurer(probeCtx, brand);
  const detected = detectFontCaps(probeMeasure, 80);
  console.log(
    `[preview] detectFontCaps: kashida=${detected.kashida} method=${detected.kashidaMethod}`
  );
}

console.log(
  `[preview] brand=${brand.id} · قماش=${SIZE.w}×${SIZE.h} · fsRange=[${fsRange[0]}, ${fsRange[1]}]px · boxWidthCandidates=[${boxWidthCandidates[0]}..${boxWidthCandidates[boxWidthCandidates.length - 1]}]`
);
console.log(
  `[preview] justify: mode=${brand.typography.justify.mode} · maxSitesPerWord=${brand.typography.justify.maxSitesPerWord} · minLineFill=${brand.typography.justify.minLineFill}`
);

// ── معالجة النص مرة واحدة ─────────────────────────────
const tokensCached = parseTokens(
  preprocessBidi(TEXT, { numerals: brand.typography.bidi.numerals })
);

// ── دالة رندر بطاقة واحدة ─────────────────────────────
async function renderCard({ label, outPath, kashidaOn }) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const measure = createCanvasMeasurer(ctx, brand);

  const justifyCfg = {
    ...brand.typography.justify,
    mode: kashidaOn ? 'kashida' : 'none',
  };

  drawSolid(ctx, SIZE, brand, { colorKey: 'urgentBg' });
  drawGradient(ctx, SIZE, brand, { direction: 'bottom' });

  const wrap = wrapOptimal(
    tokensCached,
    boxWidth,
    max,
    min,
    false,
    maxLines,
    shortLineRatio,
    lineHeight,
    measure,
    'uniform',
    {
      minLines,
      preferredLines,
      readableMin,
      preferLargestFs: true,
      absoluteMinFill: brand.typography.justify.minLineFill,
      boxWidthCandidates,
      fsRange,
      justifyCapacityConfig: {
        cfg: brand.typography.justify,
        fontCaps: brand.fonts.capabilities,
      },
    }
  );

  const chosenBoxW = wrap.boxWidth;
  const preFillWidths = wrap.lines.map((ln) =>
    measure.line(ln, wrap.fontSize, false)
  );

  const linesJustified = wrap.lines.map((line, i) =>
    justifyLine(
      line,
      chosenBoxW,
      wrap.fontSize,
      false,
      justifyCfg,
      brand.fonts.capabilities,
      measure,
      { isLast: i === wrap.lines.length - 1 }
    )
  );

  const boxOffsetX = (SIZE.w - chosenBoxW) / 2;
  const rightX = SIZE.w - boxOffsetX;
  const nLines = linesJustified.length;
  const centerY = SIZE.h * CENTER_LOWER_Y;
  const firstBaseline = centerY - ((nLines - 1) * wrap.lineHeight) / 2;
  const lastBaseline = firstBaseline + (nLines - 1) * wrap.lineHeight;

  linesJustified.forEach((ln, i) => {
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

  drawBadge(ctx, SIZE, brand, {
    badge: brand.badges.urgent,
    rx: rightX,
    bottomY: firstBaseline - wrap.fontSize - brand.margins.badgeGap,
  });

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

  const postWidths = linesJustified.map((ln) =>
    measure.line(ln, wrap.fontSize, false)
  );
  console.log(`\n── ${label} → ${outPath}`);
  console.log(
    `   fs=${wrap.fontSize}px (${((wrap.fontSize / SIZE.w) * 100).toFixed(1)}% من القماش) · boxWidth=${chosenBoxW}px (${((chosenBoxW / SIZE.w) * 100).toFixed(0)}%) · ${nLines} سطر`
  );
  linesJustified.forEach((ln, i) => {
    const pre = preFillWidths[i];
    const post = postWidths[i];
    const preFillPct = (pre / chosenBoxW) * 100;
    const postFillPct = (post / chosenBoxW) * 100;
    const delta = post - pre;
    const marker = i === nLines - 1 ? ' (أخير)' : '';
    const arrow = delta > 0.5 ? ` → ${postFillPct.toFixed(0)}% (+${delta.toFixed(0)}px)` : '';
    console.log(
      `   ${i + 1}. [${ln.length} كلمة]${marker} ملء ${preFillPct.toFixed(0)}%${arrow}  ${ln.map((t) => t.text).join(' ')}`
    );
  });

  return { fontSize: wrap.fontSize, boxWidth: chosenBoxW, nLines };
}

const withK = await renderCard({
  label: `${brand.name} — الكشيدة مفعّلة`,
  outPath: join(OUT_DIR, `preview-${brand.id}.png`),
  kashidaOn: true,
});

const noK = await renderCard({
  label: `${brand.name} — بلا كشيدة (المرجع)`,
  outPath: join(OUT_DIR, `preview-${brand.id}-nokashida.png`),
  kashidaOn: false,
});

console.log(
  `\n[preview] brand=${brand.id} · نتيجة: fs=${withK.fontSize} · boxW=${withK.boxWidth} · أسطر=${withK.nLines}`
);
