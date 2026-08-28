// scripts/preview.mjs — أول مخرج بصري للمحرك.
//
// **اختبار صحة معماري:** يُشغّل طبقات packages/engine مباشرةً من Node
// عبر skia-canvas بلا DOM ولا واجهة. إن نجح، فالمحرك محايد بيئياً كما
// تنصّ القاعدة 1 في CLAUDE.md.
//
// النموذج: بطاقة عاجل (`brk`) بمقاس Instagram العمودي (1080×1350) —
// مطابقة لتخطيط قالب `breaking` في docs/04-template-spec.md.
//
// ترتيب الطبقات (خلف → أمام):
//   1) solid   — لون خلفية العاجل من brand.colors.urgentBg
//   2) gradient — تدرّج من الأسفل لتغميق مكان النص
//   3) العنوان — preprocessBidi → parseTokens → wrapAlternating → drawLineRTL
//   4) badge   — شارة عاجل فوق أول سطر
//   5) source  — «مصدر طبي للأناضول» أسفل العنوان
//   6) logo    — يُخطى مع DEFAULT_BRAND (بلا شعار)
//
// ملاحظة: الملف .mjs لكنه يستورد TypeScript من الحزم. يُشغَّل عبر
// `node --import tsx` (تُعرَّف في package.json). tsx يفكّ الأنواع على الطاير
// دون build منفصل، فيبقى مسار التطوير مرناً.

import { Canvas, FontLibrary } from 'skia-canvas';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  preprocessBidi,
  parseTokens,
  createCanvasMeasurer,
  wrapAlternating,
  drawLineRTL,
  drawSolid,
  drawGradient,
  drawBadge,
  drawLogo,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 1. تسجيل الخط من assets/fonts (المستضاف ذاتياً) ────
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── 2. الإطار ─────────────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');

// نستعمل الهوية الافتراضية — اختبار صحّة الفصل: كل قيمة رسم تخرج منها.
const brand = DEFAULT_BRAND;

// ── 3. طبقة الخلفية ───────────────────────────────────
drawSolid(ctx, SIZE, brand, { colorKey: 'urgentBg' });

// ── 4. طبقة التدرّج (من الأسفل) ──────────────────────
drawGradient(ctx, SIZE, brand, { direction: 'bottom' });

// ── 5. طبقة العنوان ──────────────────────────────────
const text =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';

const processed = preprocessBidi(text, {
  numerals: brand.typography.bidi.numerals,
});
const tokens = parseTokens(processed);
const measure = createCanvasMeasurer(ctx, brand);

const { max, min, boxWidth, maxLines, lineHeight, shortLineRatio } =
  brand.typography.breaking;

const wrap = wrapAlternating(
  tokens,
  boxWidth,
  max,
  min,
  false, // allBold
  maxLines,
  shortLineRatio,
  lineHeight,
  measure
);

const rightX = SIZE.w - brand.margins.contentRight;
const bottomBaseline = SIZE.h - brand.margins.breakingBaseline;
const firstBaseline = bottomBaseline - (wrap.lines.length - 1) * wrap.lineHeight;

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

// ── 6. شارة عاجل — فوق أول سطر ──────────────────────
drawBadge(ctx, SIZE, brand, {
  badge: brand.badges.urgent,
  rx: rightX,
  bottomY: firstBaseline - wrap.fontSize - brand.margins.badgeGap,
});

// ── 7. سطر المصدر ────────────────────────────────────
const source = 'مصدر طبي للأناضول';
const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
ctx.font = `${brand.typography.source.weight} ${brand.typography.source.size}px ${family}`;
ctx.fillStyle = brand.colors.text;
ctx.textAlign = 'right';
ctx.direction = 'rtl';
ctx.textBaseline = 'alphabetic';
ctx.fillText(source, rightX, SIZE.h - brand.margins.sourceBaseline);

// ── 8. الشعار — تُخطى صامتاً مع DEFAULT_BRAND ────────
drawLogo(ctx, SIZE, brand, {});

// ── 9. الحفظ ─────────────────────────────────────────
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
const OUT = join(OUT_DIR, 'preview.png');
await canvas.toFile(OUT);

console.log(`[preview] كُتب: ${OUT}`);
console.log(
  `[preview] ${wrap.lines.length} سطر · fs=${wrap.fontSize}px · lh=${wrap.lineHeight}px`
);
