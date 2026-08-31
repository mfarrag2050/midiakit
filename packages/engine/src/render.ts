// render — مفسّر طبقات القوالب (`docs/04-template-spec.md`).
//
// **العقد:**
//   renderFrame({ ctx, size, template, brand, content, assets? }) → void
//   يقرأ `template.layers` بالترتيب ويستدعي دالة الرسم المناسبة لكل نوع.
//
// **المسؤوليات:**
//   • حلّ المراجع `brand.*` من قيم القالب (مثل `brand.margins.badgeGap`).
//   • تقييم `onlyIf` (hasImage · isSquare · isPortrait).
//   • تشغيل `fallback` عند فشل الشرط أو غياب المصدر.
//   • تتبّع بيانات التخطيط عبر الطبقات (مثل حدود العنوان لتموضع الشارة).
//   • الوصل بين layers/* و text/* بدون تسريب template أو content إليها.
//
// **غير مسؤول عن:**
//   • التحقق من صحّة القالب — يفترض أنه مرّ بـ `validateTemplate` أولاً.
//   • تحميل الأصول — المستدعي يمرّرها في `assets`.

import type {
  BadgeLayer,
  GradientLayer,
  HeadlineLayer,
  ImageLayer,
  Layer,
  LayerOnlyIf,
  LogoLayer,
  SolidLayer,
  SourceLayer,
  Template,
  WatermarkLayer,
} from '@pf-mediakit/templates';
import type { BrandKit, UrgentBadge } from '@pf-mediakit/shared';

import { resolve } from './brand/resolve.js';
import { drawBadge, drawGradient, drawImage, drawLogo } from './layers/index.js';
import type { CanvasSize, ImageCrop } from './layers/image.js';
import type { GradientDirection } from './layers/gradient.js';
import {
  createCanvasMeasurer,
  parseTokens,
  preprocessBidi,
  wrapOptimal,
  justifyLine,
  drawLineRTL,
  drawLineCentered,
  type Measurer,
} from './text/index.js';
import type {
  CanvasDrawContext,
  CanvasFontContext,
  ImageLike,
} from './text/index.js';

// ── الواجهة العامة ─────────────────────────────────────

export interface RenderAssets {
  /** خرائط مفتاح-حقل → صورة قابلة للرسم. */
  readonly images?: Readonly<Record<string, ImageLike>>;
  /** خرائط الصور مع خيارات القص لكل حقل (اختياري). */
  readonly imageCrops?: Readonly<Record<string, ImageCrop>>;
}

export interface RenderFrameArgs {
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  readonly size: CanvasSize;
  readonly template: Template;
  /**
   * BrandKit **بعد** `resolveBrand()` — لا مراجع داخلية. المفسّر يفترض
   * أن `brand.colors.text` قيمة hex مباشرة، لا سلسلة `"colors.text"`.
   */
  readonly brand: BrandKit;
  /** ما يملأه المستخدم بحسب `template.fields`. */
  readonly content: Readonly<Record<string, unknown>>;
  /** أصول جانبية — الصور خصوصاً (الحقل `image`). */
  readonly assets?: RenderAssets;
}

// ── حالة التخطيط بين الطبقات ─────────────────────────

interface HeadlineBounds {
  /** أعلى الكتلة (تقريب: أول baseline − fontSize). */
  readonly top: number;
  /** أسفل الكتلة (آخر baseline). */
  readonly bottom: number;
  /** الحافة اليمنى (rightX). */
  readonly right: number;
  /** الحافة اليسرى (rightX − boxWidth). */
  readonly left: number;
  /** حجم الخط المُختار — يستعمله المصدر لحساب مسافة `fs × ratio`. */
  readonly fontSize: number;
}

interface RenderState {
  headline?: HeadlineBounds;
}

// ── مساعدات ────────────────────────────────────────────

/**
 * إن كانت القيمة سلسلة تبدأ بـ`brand.` (مرجع القالب)، تُحلّ عبر
 * `resolve` على brand. خلاف ذلك: تُعاد كما هي.
 */
function resolveRef(brand: BrandKit, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('brand.')) {
    return resolve(brand, value.slice('brand.'.length));
  }
  return value;
}

function asNumber(brand: BrandKit, v: unknown, where: string): number {
  const resolved = resolveRef(brand, v);
  if (typeof resolved !== 'number') {
    throw new Error(
      `[renderFrame] ${where}: يجب أن يكون رقماً، وُجد ${typeof resolved}`
    );
  }
  return resolved;
}

function asString(brand: BrandKit, v: unknown, where: string): string {
  const resolved = resolveRef(brand, v);
  if (typeof resolved !== 'string') {
    throw new Error(
      `[renderFrame] ${where}: يجب أن يكون string، وُجد ${typeof resolved}`
    );
  }
  return resolved;
}

function evalCondition(cond: LayerOnlyIf, args: RenderFrameArgs): boolean {
  switch (cond) {
    case 'hasImage': {
      const imgs = args.assets?.images;
      return !!imgs && Object.keys(imgs).length > 0;
    }
    case 'isSquare':
      return args.size.w === args.size.h;
    case 'isPortrait':
      return args.size.h > args.size.w;
  }
}

// ── منفّذو الطبقات ────────────────────────────────────

function runSolid(layer: SolidLayer, args: RenderFrameArgs): void {
  const fill = asString(args.brand, layer.fill, 'solid.fill');
  args.ctx.fillStyle = fill;
  args.ctx.fillRect(0, 0, args.size.w, args.size.h);
}

function runGradient(layer: GradientLayer, args: RenderFrameArgs): void {
  drawGradient(args.ctx, args.size, args.brand, {
    direction: layer.direction as GradientDirection,
    ...(layer.opacity !== undefined && { opacity: layer.opacity }),
    ...(layer.reach !== undefined && { reach: layer.reach }),
  });
}

function runImage(
  layer: ImageLayer,
  args: RenderFrameArgs,
  state: RenderState
): boolean {
  const key = layer.field ?? 'image';
  const image = args.assets?.images?.[key];
  if (!image) {
    if (layer.fallback) {
      for (const fb of layer.fallback) executeLayer(fb, args, state);
    }
    return false;
  }
  const crop = args.assets?.imageCrops?.[key];
  drawImage(args.ctx, args.size, image, crop ? { crop } : {});
  return true;
}

function runLogo(_layer: LogoLayer, args: RenderFrameArgs): void {
  drawLogo(args.ctx, args.size, args.brand, {});
}

function runWatermark(_layer: WatermarkLayer, _args: RenderFrameArgs): void {
  // سيُنفَّذ عند وصول طبقة الشعار المائي (Phase 2 body — لم يبدأ).
  // نتراجع صامتاً بدل الرمي؛ القوالب قد تُسند watermark للـfallback ونحن
  // نتخطاها بلا كسر بقية الطبقات.
}

// ── العنوان ────────────────────────────────────────────

interface HeadlineFontCfg {
  readonly max: number;
  readonly min: number;
  readonly boxWidth: number;
  readonly lineHeight: number;
  readonly shortLineRatio: number;
  readonly maxLines: number;
  readonly minLines: number;
  readonly preferredLines: number;
  readonly readableMinRatio: number;
  readonly headlineFsRatio: readonly [number, number];
  readonly boxWidthRange: readonly [number, number];
}

function runHeadline(
  layer: HeadlineLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  const { brand, ctx, size, content } = args;
  const text = content[layer.field];
  if (typeof text !== 'string' || text.length === 0) return;

  const measure: Measurer = createCanvasMeasurer(ctx, brand);

  const fontCfg = resolveRef(brand, layer.font) as HeadlineFontCfg;
  const justifyCfg =
    layer.justify !== undefined
      ? (resolveRef(brand, layer.justify) as BrandKit['typography']['justify'])
      : brand.typography.justify;

  // اشتقاق نطاقات fs و boxWidth من نسبيّ القماش (درس L-02).
  const readableMin = Math.round(size.w * fontCfg.readableMinRatio);
  const [bwMinR, bwMaxR] = fontCfg.boxWidthRange;
  const BW_STEPS = 10;
  const boxWidthCandidates: number[] = [];
  for (let i = 0; i < BW_STEPS; i++) {
    const t = i / (BW_STEPS - 1);
    boxWidthCandidates.push(Math.round(size.w * (bwMinR + t * (bwMaxR - bwMinR))));
  }
  const fsRange: [number, number] = [
    Math.round(size.w * fontCfg.headlineFsRatio[0]),
    Math.round(size.w * fontCfg.headlineFsRatio[1]),
  ];

  const processed = preprocessBidi(text, {
    numerals: brand.typography.bidi.numerals,
  });
  const tokens = parseTokens(processed);

  const wrap = wrapOptimal(
    tokens,
    fontCfg.boxWidth,
    fontCfg.max,
    fontCfg.min,
    false,
    fontCfg.maxLines,
    fontCfg.shortLineRatio,
    fontCfg.lineHeight,
    measure,
    layer.wrap === 'alternating' ? 'alternating' : 'uniform',
    {
      minLines: fontCfg.minLines,
      preferredLines: fontCfg.preferredLines,
      readableMin,
      preferLargestFs: true,
      absoluteMinFill: justifyCfg.minLineFill,
      boxWidthCandidates,
      fsRange,
      justifyCapacityConfig: {
        cfg: justifyCfg,
        fontCaps: brand.fonts.capabilities,
      },
    }
  );

  const chosenBoxW = wrap.boxWidth;
  const boxOffsetX = (size.w - chosenBoxW) / 2;
  const rightX = size.w - boxOffsetX;
  const centerX = size.w / 2;
  const nLines = wrap.lines.length;

  // موضع y — يعتمد anchor
  const anchorY = computeHeadlineAnchorY(
    layer.anchor,
    layer.verticalAnchor,
    size,
    nLines,
    wrap.lineHeight,
    wrap.fontSize
  );
  const firstBaseline = anchorY;
  const lastBaseline = firstBaseline + (nLines - 1) * wrap.lineHeight;

  const linesJustified = wrap.lines.map((line, i) =>
    justifyLine(
      line,
      chosenBoxW,
      wrap.fontSize,
      false,
      justifyCfg,
      brand.fonts.capabilities,
      measure,
      { isLast: i === nLines - 1 }
    )
  );

  linesJustified.forEach((ln, i) => {
    const y = firstBaseline + i * wrap.lineHeight;
    if (layer.align === 'center') {
      drawLineCentered(ctx, measure, ln, centerX, y, wrap.fontSize, false, brand);
    } else {
      drawLineRTL(ctx, measure, ln, rightX, y, wrap.fontSize, false, brand);
    }
  });

  state.headline = {
    top: firstBaseline - wrap.fontSize,
    bottom: lastBaseline,
    right: rightX,
    left: rightX - chosenBoxW,
    fontSize: wrap.fontSize,
  };
}

/**
 * يُرجع y لأول baseline بحسب anchor.
 *
 * • `centerLower`: مركز الكتلة عند `size.h × verticalAnchor` (تقريب النسبة
 *   الذهبية عادةً 0.62). يوازن التخطيط بغضّ النظر عن عدد الأسطر.
 * • `middle`: نفس المفهوم عند 0.5.
 * • `bottom`: آخر baseline عند 85% من الارتفاع (يترك مساحة لـsource/logo).
 * • `top`: أول baseline عند 15% من الارتفاع.
 */
function computeHeadlineAnchorY(
  anchor: HeadlineLayer['anchor'],
  verticalAnchor: number | undefined,
  size: CanvasSize,
  nLines: number,
  lineHeight: number,
  _fontSize: number
): number {
  switch (anchor) {
    case 'centerLower': {
      const va = verticalAnchor ?? 0.62;
      const centerY = size.h * va;
      return centerY - ((nLines - 1) * lineHeight) / 2;
    }
    case 'middle': {
      const centerY = size.h * 0.5;
      return centerY - ((nLines - 1) * lineHeight) / 2;
    }
    case 'bottom': {
      const lastY = size.h * 0.85;
      return lastY - (nLines - 1) * lineHeight;
    }
    case 'top':
      return size.h * 0.15;
  }
}

// ── الشارة والمصدر ───────────────────────────────────

function runBadge(
  layer: BadgeLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  const bounds = state.headline;
  if (!bounds) {
    throw new Error(
      '[renderFrame] badge (above-headline) قبل headline — راجع ترتيب الطبقات'
    );
  }
  const badge = resolveRef(args.brand, layer.use) as UrgentBadge;
  // إن مُرِّرت field: استبدل label من content.
  const finalBadge = layer.field
    ? { ...badge, label: String(args.content[layer.field] ?? badge.label) }
    : badge;
  const gap = asNumber(args.brand, layer.gap, 'badge.gap');
  const bottomY =
    layer.anchor === 'above-headline'
      ? bounds.top - gap
      : bounds.bottom + gap + finalBadge.height;
  drawBadge(args.ctx, args.size, args.brand, {
    badge: finalBadge,
    rx: bounds.right,
    bottomY,
  });
}

interface SourceFontCfg {
  readonly size: number;
  readonly weight: number;
}

function runSource(
  layer: SourceLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  const bounds = state.headline;
  if (!bounds) {
    throw new Error(
      '[renderFrame] source قبل headline — راجع ترتيب الطبقات'
    );
  }
  const text = args.content[layer.field];
  if (typeof text !== 'string' || text.length === 0) return;
  const fontCfg = resolveRef(args.brand, layer.font) as SourceFontCfg;
  const gapPx = bounds.fontSize * layer.gapFsRatio;
  const baseline = bounds.bottom + gapPx;
  const family = `"${args.brand.fonts.primary.family}", ${args.brand.fonts.fallback}`;
  args.ctx.font = `${fontCfg.weight} ${fontCfg.size}px ${family}`;
  args.ctx.fillStyle = args.brand.colors.text;
  args.ctx.textAlign = 'right';
  args.ctx.direction = 'rtl';
  args.ctx.textBaseline = 'alphabetic';
  args.ctx.fillText(text, bounds.right, baseline);
}

// ── الموزّع الرئيسي ──────────────────────────────────

function executeLayer(
  layer: Layer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  // شرط onlyIf: إن فشل شغّل fallback بدل الطبقة الأصلية.
  if (layer.onlyIf !== undefined && !evalCondition(layer.onlyIf, args)) {
    if (layer.fallback) {
      for (const fb of layer.fallback) executeLayer(fb, args, state);
    }
    return;
  }

  switch (layer.type) {
    case 'solid':
      runSolid(layer, args);
      return;
    case 'gradient':
      runGradient(layer, args);
      return;
    case 'image': {
      // runImage يعالج fallback داخلياً عند غياب الصورة
      runImage(layer, args, state);
      return;
    }
    case 'headline':
      runHeadline(layer, args, state);
      return;
    case 'badge':
      runBadge(layer, args, state);
      return;
    case 'source':
      runSource(layer, args, state);
      return;
    case 'logo':
      runLogo(layer, args);
      return;
    case 'watermark':
      runWatermark(layer, args);
      return;
    case 'kicker':
    case 'accent':
      // مؤجَّل — القوالب card_kicker و card_bottom يستعملانه.
      // renderFrame الحالي لا يرسمها؛ تُرفَع في المرحلة 2 عند تشغيلها.
      return;
  }
}

// ── الواجهة العامة ─────────────────────────────────────

/**
 * ينفّذ قالباً على `ctx` بمقاس `size` بهوية `brand` ومحتوى `content`.
 * الطبقات تُنفَّذ بالترتيب، مع دعم `onlyIf` و `fallback` وتتبّع الحدود.
 *
 * **يُنتظر أن يكون:**
 *   • `template` قد مرّ بـ `validateTemplate` (لا فحص هنا — مسار حرج).
 *   • `brand` مسطَّح عبر `resolveBrand` (لا مراجع داخلية).
 *   • `ctx` مخصَّص بالمقاس الصحيح.
 */
export function renderFrame(args: RenderFrameArgs): void {
  const state: RenderState = {};
  for (const layer of args.template.layers) {
    executeLayer(layer, args, state);
  }
}
