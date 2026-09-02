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
  AccentLayer,
  AttributionLayer,
  BadgeLayer,
  GradientLayer,
  HeadlineLayer,
  ImageLayer,
  KickerLayer,
  Layer,
  LayerOnlyIf,
  LogoLayer,
  SolidLayer,
  SourceLayer,
  Template,
  WatermarkLayer,
} from '@pf-mediakit/templates';
import type { BrandKit, PlatformKey, UrgentBadge } from '@pf-mediakit/shared';

import { resolve } from './brand/resolve.js';
import { loadDefaultLexicon, type Lexicon } from './arabic-lexicon/index.js';
import {
  drawAccentBar,
  drawAccentSpan,
  drawAttribution,
  drawBadge,
  drawGradient,
  drawImage,
  drawLogo,
} from './layers/index.js';
import type { CanvasSize, ImageCrop } from './layers/image.js';
import type { Path2DLike } from './text/index.js';
import type { GradientDirection } from './layers/gradient.js';
import {
  createCanvasMeasurer,
  parseTokens,
  preprocessBidi,
  wrapOptimal,
  justifyLine,
  drawLineRTL,
  drawLineCentered,
  breakPenalty,
  BREAK_INFINITY,
  measuredLineHeight,
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
  /**
   * Path2D مبنيّ لكل منصة (من `PLATFORM_PATH_STRINGS`) بواسطة المستدعي.
   * مطلوب فقط حين طبقة `attribution` تُرسم مع `logoMode='official'` فعلياً.
   * غيابه = تراجع صامت إلى 'generic'.
   */
  readonly attributionPaths?: Readonly<Partial<Record<PlatformKey, Path2DLike>>>;
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
  /**
   * قاموس مُخصَّص للكسر الدلالي (docs/07 §2). إن مُرِّر ExtendedLexicon
   * (extendLexicon(base, {titles, places, entities}))، تُطبَّق قواعد
   * الجزء (ب) — لقب+اسم، اسم مكان مركّب، كيان مؤسسي. الافتراضي: أساسي.
   */
  readonly lexicon?: Lexicon;
}

// ── حالة التخطيط بين الطبقات ─────────────────────────

export interface HeadlineBounds {
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
  /** الحافة الأفقية للأول baseline — للتموضع المتقدّم. */
  readonly firstBaseline: number;
}

export interface KickerBounds {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly centerX: number;
  readonly width: number;
  readonly baselineY: number;
  readonly fontSize: number;
  /** المسافة القياسية المفضّلة تحته (من brand.typography.kicker.gapBelow). */
  readonly gapBelow: number;
}

export interface AccentSpanBounds {
  readonly from: number;
  readonly to: number;
  readonly y: number;
}

/**
 * حالة عابرة بين الطبقات — تُملأ عند رسم بعض الطبقات وتُقرأ من طبقات
 * لاحقة (badge/source يقرآن headline; accent يقرأ kicker أو headline).
 *
 * **مُصدَّرة** لأن drawAt يبنيها بنفسه ثم يمرّرها إلى executeLayer/
 * drawHeadlineLine.
 */
export interface RenderState {
  headline?: HeadlineBounds;
  kicker?: KickerBounds;
  headlineAccentSpans?: readonly AccentSpanBounds[];
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

/**
 * الشعار المائي داخل خلفية العاجل — درسم صورة الشعار بمقياس/إزاحة/شفافية.
 *
 * السلوك:
 *   • `brand.logo.watermark.enabled = false` ⇒ لا يرسم.
 *   • لا صورة شعار متاحة (`assets.images.logo` غائبة) ⇒ تراجع صامت (مثل drawLogo).
 *   • خلاف ذلك: يرسم بمقاس نسبي `scale × size.w` وإزاحة نسبية
 *     `offsetX × size.w` وشفافية `opacity`.
 *
 * **دَين مؤجَّل:** التلوين (`tint`) بـcomposite operations. حالياً يرسم
 * بالشفافية فقط. يُنفَّذ عند أول عميل حقيقي بشعار — إمّا:
 *   • عبر offscreen canvas + `destination-in` لتطبيق اللون.
 *   • أو عبر `filter: 'brightness(0) invert(1) drop-shadow(...)'` (skia-canvas).
 */
function runWatermark(layer: WatermarkLayer, args: RenderFrameArgs): void {
  const wm = args.brand.logo.watermark;
  if (!wm.enabled) return;
  const key = (layer.from ?? 'brand.logo').replace(/^brand\./, '').split('.')[0];
  const image =
    args.assets?.images?.[layer.from ?? 'logo'] ?? args.assets?.images?.[key];
  if (!image) return; // تراجع صامت — الهوية الافتراضية بلا شعار

  const targetW = args.size.w * wm.scale;
  const aspect = image.height / image.width;
  const targetH = targetW * aspect;
  const x = args.size.w * wm.offsetX; // نسبة (سالبة = يسار الحافة)
  const y = (args.size.h - targetH) / 2;

  args.ctx.save();
  const prev = args.ctx.globalAlpha;
  args.ctx.globalAlpha = prev * wm.opacity;
  args.ctx.drawImage(image, x, y, targetW, targetH);
  args.ctx.globalAlpha = prev;
  args.ctx.restore();
}

// ── الكيكر (kicker) ───────────────────────────────────

interface KickerFontCfg {
  readonly max: number;
  readonly min: number;
  readonly weight: number;
  readonly boxWidth: number;
  readonly gapBelow: number;
}

function runKicker(
  layer: KickerLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  const { ctx, brand, size, content } = args;
  const text = content[layer.field];
  if (typeof text !== 'string' || text.length === 0) return;

  const fontCfg = resolveRef(brand, layer.font) as KickerFontCfg;
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;

  // بحث بسيط: أكبر fs ضمن max/min يسع boxWidth (لا نحتاج DP هنا —
  // الكيكر عادة كلمتان). خطوة 2 مطابقة لأسلوب wrap للـheadline اليدوي.
  let chosenFs = fontCfg.max;
  ctx.font = `${fontCfg.weight} ${chosenFs}px ${family}`;
  while (ctx.measureText(text).width > fontCfg.boxWidth && chosenFs > fontCfg.min) {
    chosenFs -= 2;
    ctx.font = `${fontCfg.weight} ${chosenFs}px ${family}`;
  }
  const measuredWidth = ctx.measureText(text).width;

  const centerX = size.w / 2;
  const verticalAnchor = layer.verticalAnchor ?? 0.4;
  const baselineY = size.h * verticalAnchor;

  ctx.fillStyle = brand.colors.text;
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  if (layer.align === 'right') {
    ctx.textAlign = 'right';
    const rx = size.w - (size.w - fontCfg.boxWidth) / 2;
    ctx.fillText(text, rx, baselineY);
    state.kicker = {
      top: baselineY - chosenFs,
      bottom: baselineY,
      right: rx,
      left: rx - measuredWidth,
      centerX: rx - measuredWidth / 2,
      width: measuredWidth,
      baselineY,
      fontSize: chosenFs,
      gapBelow: fontCfg.gapBelow,
    };
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, baselineY);
    state.kicker = {
      top: baselineY - chosenFs,
      bottom: baselineY,
      left: centerX - measuredWidth / 2,
      right: centerX + measuredWidth / 2,
      centerX,
      width: measuredWidth,
      baselineY,
      fontSize: chosenFs,
      gapBelow: fontCfg.gapBelow,
    };
  }
}

// ── التمييز (accent) ───────────────────────────────────

function runAccent(
  layer: AccentLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  switch (layer.mode) {
    case 'underline': {
      // خط أفقي تحت العنصر المستهدف — يجب أن يقع **بعد الحرف النازل**
      // (ي، ق، ن — نسبتها ≈ 0.20-0.25 من fs في IBM Plex/Almarai). 0.12
      // كانت متعسفة وأنتجت تقاطعاً بصرياً مع النازل. 0.32 تعطي فراغاً
      // نظيفاً ومسافة قراءة معقولة.
      const target = layer.target ?? 'kicker';
      const bounds = target === 'kicker' ? state.kicker : state.headline;
      if (!bounds) return; // ترتيب طبقات غير صالح — نتراجع صامتاً
      const centerX =
        'centerX' in bounds ? bounds.centerX : (bounds.left + bounds.right) / 2;
      const width = 'width' in bounds ? bounds.width : bounds.right - bounds.left;
      const descenderClearance = Math.round(bounds.fontSize * 0.32);
      const yBase =
        'baselineY' in bounds
          ? bounds.baselineY + descenderClearance
          : bounds.bottom + descenderClearance;
      drawAccentBar(args.ctx, args.size, args.brand, {
        cx: centerX,
        y: yBase,
        w: width,
      });
      return;
    }
    case 'above-first-line': {
      // شريط قصير فوق أول سطر من العنوان (نمط تحرير)
      const bounds = state.headline;
      if (!bounds) return;
      const width = args.brand.typography.accentBar.minWidth;
      const cx = (bounds.left + bounds.right) / 2;
      // شريط فوق الحدّ العلوي بمسافة معقولة (≈ ارتفاع السطر × 0.25)
      const y = bounds.top - Math.round(bounds.fontSize * 0.35);
      drawAccentBar(args.ctx, args.size, args.brand, { cx, y, w: width });
      return;
    }
    case 'span': {
      // شرائط تحت الكلمات المُعلَّمة بـ`_word_` داخل العنوان
      const spans = state.headlineAccentSpans;
      if (!spans || spans.length === 0) return; // لا كلمات مميّزة
      for (const s of spans) {
        drawAccentSpan(args.ctx, args.size, args.brand, {
          x0: s.from,
          x1: s.to,
          y: s.y,
        });
      }
      return;
    }
  }
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

/**
 * يدمج تكوين خط العنوان (مثل `brand.typography.headline` أو `title3l`)
 * مع `brand.typography.breaking` لسدّ الحقول الناقصة. النتيجة: كل تكوين
 * font يحتاج فقط `max/min/lineHeight/boxWidth`؛ كل knobs تخطيط اللف
 * (headlineFsRatio, boxWidthRange, minLines, …) تُوَرَّث من breaking إن غابت.
 *
 * السبب: TypographyHeadline و TypographyTitle3L في `brand-kit.ts` بسيطة
 * (لا تحمل knobs التخطيط)؛ توسيعها في shared يعني تكرار قيم في كل
 * `brand`. الوراثة من `breaking` تُبقي الإعداد جاف.
 */
function normalizeHeadlineFont(
  brand: BrandKit,
  raw: Record<string, unknown>
): HeadlineFontCfg {
  const fb = brand.typography.breaking;
  return {
    max: (raw['max'] as number) ?? fb.max,
    min: (raw['min'] as number) ?? fb.min,
    boxWidth: (raw['boxWidth'] as number) ?? fb.boxWidth,
    lineHeight: (raw['lineHeight'] as number) ?? fb.lineHeight,
    shortLineRatio: (raw['shortLineRatio'] as number) ?? fb.shortLineRatio,
    maxLines: (raw['maxLines'] as number) ?? fb.maxLines,
    minLines: (raw['minLines'] as number) ?? fb.minLines,
    preferredLines: (raw['preferredLines'] as number) ?? fb.preferredLines,
    readableMinRatio: (raw['readableMinRatio'] as number) ?? fb.readableMinRatio,
    headlineFsRatio:
      (raw['headlineFsRatio'] as readonly [number, number]) ?? fb.headlineFsRatio,
    boxWidthRange:
      (raw['boxWidthRange'] as readonly [number, number]) ?? fb.boxWidthRange,
  };
}

/**
 * القاموس الافتراضي للعربية — يُبنى مرة عند أول استيراد لهذه الوحدة.
 * يُستعمل تلقائياً في prepareHeadline عند تفعيل semanticBreaks بلا
 * قاموس مُخصَّص مُمرَّر. الكلفة عند التحميل ≈ 1ms (بناء 16 Set).
 */
const DEFAULT_ARABIC_LEXICON: Lexicon = loadDefaultLexicon();

/**
 * يحسب مصفوفة عقوبات الكسر لكل موضع في `tokens`.
 * يُستدعى مرة في `buildRenderPlan` (أو `prepareHeadline`) وتُمرَّر
 * النتيجة إلى `wrapOptimal.breakPenalties` — تفادي إعادة الحساب داخل
 * حلقة DP (L-07).
 *
 * @returns مصفوفة بطول `tokens.length + 1`. index i = عقوبة الكسر
 *   قبل tokens[i]. index 0 و n = Infinity (لا كسر عند الأطراف).
 */
export function computeBreakPenalties(
  tokens: readonly Token[],
  lexicon: Lexicon = DEFAULT_ARABIC_LEXICON
): readonly number[] {
  const n = tokens.length;
  const out = new Array<number>(n + 1);
  out[0] = BREAK_INFINITY; // لا كسر قبل الكلمة الأولى
  out[n] = BREAK_INFINITY; // لا كسر بعد الكلمة الأخيرة
  for (let i = 1; i < n; i++) {
    out[i] = breakPenalty(tokens, i, lexicon);
  }
  return out;
}

/**
 * تحضير العنوان — يحسب اللف، التبرير، والمواضع، **بلا رسم**.
 * تُستعمل نتيجته إمّا لرسم دفعة واحدة (runHeadline) أو لرسم سطر بسطر
 * مع تحريك مستقل (drawAt في timeline/).
 *
 * **مُهم:** `measure` **اختياري** — يبقى مربوطاً بـctx الذي بُني عليه
 * prep. للخطط الـCanvas-independent (`buildRenderPlan` في render-plan.ts)،
 * يُترك undefined ويُنشأ measurer طازج في `drawHeadlineLine` من ctx
 * الرسم الحالي. الخطوط مُسجَّلة عالمياً في skia-canvas عبر
 * `FontLibrary.use`، فالقياس نفسه بغضّ النظر عن الـcanvas.
 */
export interface PreparedHeadline {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly chosenBoxW: number;
  readonly rightX: number;
  readonly centerX: number;
  readonly firstBaseline: number;
  readonly lastBaseline: number;
  readonly linesJustified: readonly (readonly Token[])[];
  readonly align: HeadlineLayer['align'];
  readonly bounds: HeadlineBounds;
  readonly accentSpans: readonly AccentSpanBounds[];
  readonly measure?: Measurer;
}

export function prepareHeadline(
  layer: HeadlineLayer,
  args: RenderFrameArgs,
  state: RenderState
): PreparedHeadline | null {
  const { brand, ctx, size, content } = args;
  const text = content[layer.field];
  if (typeof text !== 'string' || text.length === 0) return null;

  const measure: Measurer = createCanvasMeasurer(ctx, brand);

  const rawFontCfg = resolveRef(brand, layer.font) as Record<string, unknown>;
  const fontCfg = normalizeHeadlineFont(brand, rawFontCfg);
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

  // الكسر الدلالي (docs/07 §2): يُحسب مصفوفة العقوبات مرة هنا (L-07)
  // إن كان مُفعَّلاً في الهوية. wrapOptimal يستهلكها بلا إعادة حساب.
  // نمرِّر lexicon الموسَّع إن كان في args — يُفعِّل قواعد الجزء (ب).
  const semanticEnabled = brand.typography.semanticBreaks.enabled;
  const breakPenalties = semanticEnabled
    ? computeBreakPenalties(tokens, args.lexicon ?? DEFAULT_ARABIC_LEXICON)
    : undefined;

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
      ...(breakPenalties && { breakPenalties }),
    }
  );

  const chosenBoxW = wrap.boxWidth;
  const boxOffsetX = (size.w - chosenBoxW) / 2;
  const rightX = size.w - boxOffsetX;
  const centerX = size.w / 2;
  const nLines = wrap.lines.length;

  // justify أولاً — قد يُدخل كشيدة تزيد ارتفاع بعض الحروف قليلاً، لكن
  // القرار الرئيسي في ارتفاع السطر يعتمد على التشكيل لا الكشيدة.
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

  // lineHeight الديناميكي (docs/07 §3): يُفعَّل تلقائياً حين التشكيل
  // مُفعَّل (`diacritics.enabled`)، أو حين الهوية تفرضه صراحةً
  // (`lineHeightMode='dynamic'`). النسبة الثابتة (fs × 1.34/1.42) تصبح
  // **حداً أدنى**؛ نقيس الارتفاع الفعلي عبر actualBoundingBoxAscent/Descent
  // ونأخذ الأكبر. عند 'fixed' وبلا تشكيل نُبقي wrap.lineHeight كما هو
  // (سلوك سابق) — snapshots الذهبية تبقى مطابقة بايت-بايت.
  const dynamicActive =
    brand.typography.lineHeightMode === 'dynamic' ||
    brand.typography.diacritics.enabled;
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  const finalLineHeight = dynamicActive
    ? measuredLineHeight(
        ctx,
        linesJustified,
        wrap.fontSize,
        family,
        false,
        wrap.lineHeight
      )
    : wrap.lineHeight;

  const anchorY = computeHeadlineAnchorY(
    layer.anchor,
    layer.verticalAnchor,
    size,
    nLines,
    finalLineHeight,
    wrap.fontSize,
    state
  );
  const firstBaseline = anchorY;
  const lastBaseline = firstBaseline + (nLines - 1) * finalLineHeight;

  // نُقاس accent spans عبر «رسم صامت» على measure فقط — لا يُخلّ بالنقاء
  // (النتيجة نفسها في أي استدعاء بنفس الوسائط).
  const accentSpans: AccentSpanBounds[] = [];
  linesJustified.forEach((ln, i) => {
    const y = firstBaseline + i * finalLineHeight;
    // نستعمل drawLine* لكن نُلغي التأثيرات عبر عدم استدعائها هنا —
    // بدلاً من ذلك نحسب accent bounds من الإحداثيات مباشرةً.
    // الأبسط: احتفظ بحدود accent فقط عند الرسم الفعلي في drawHeadlineLine.
    void ln; void y;
  });

  const bounds: HeadlineBounds = {
    top: firstBaseline - wrap.fontSize,
    bottom: lastBaseline,
    right: rightX,
    left: rightX - chosenBoxW,
    fontSize: wrap.fontSize,
    firstBaseline,
  };

  return {
    fontSize: wrap.fontSize,
    lineHeight: finalLineHeight,
    chosenBoxW,
    rightX,
    centerX,
    firstBaseline,
    lastBaseline,
    linesJustified,
    align: layer.align,
    bounds,
    accentSpans,
    measure,
  };
}

/**
 * يرسم سطراً واحداً من prep. يستعمله runHeadline (تسلسل) و drawAt
 * (بتحريك). يعيد accent bounds إن وُجدت في السطر — المستدعي يجمعها.
 */
export function drawHeadlineLine(
  ctx: CanvasDrawContext & CanvasFontContext,
  brand: BrandKit,
  prep: PreparedHeadline,
  lineIdx: number
): AccentSpanBounds | null {
  const ln = prep.linesJustified[lineIdx];
  if (!ln) return null;
  const y = prep.firstBaseline + lineIdx * prep.lineHeight;
  // measurer: من الخطة إن وُجد، وإلا نُنشئه من ctx الحالي (الحالة عند
  // استعمال RenderPlan المبنية Canvas-independent).
  const measure = prep.measure ?? createCanvasMeasurer(ctx, brand);
  const result =
    prep.align === 'center'
      ? drawLineCentered(ctx, measure, ln, prep.centerX, y, prep.fontSize, false, brand)
      : drawLineRTL(ctx, measure, ln, prep.rightX, y, prep.fontSize, false, brand);
  if (result.accentFrom !== null && result.accentTo !== null) {
    return {
      from: result.accentFrom,
      to: result.accentTo,
      y: y + Math.round(prep.fontSize * 0.1),
    };
  }
  return null;
}

function runHeadline(
  layer: HeadlineLayer,
  args: RenderFrameArgs,
  state: RenderState
): void {
  const prep = prepareHeadline(layer, args, state);
  if (!prep) return;
  const accentSpans: AccentSpanBounds[] = [];
  for (let i = 0; i < prep.linesJustified.length; i++) {
    const span = drawHeadlineLine(args.ctx, args.brand, prep, i);
    if (span) accentSpans.push(span);
  }
  state.headline = prep.bounds;
  state.headlineAccentSpans = accentSpans;
}

/**
 * يُرجع y لأول baseline بحسب anchor.
 *
 * • `centerLower`: مركز الكتلة عند `size.h × verticalAnchor` (تقريب النسبة
 *   الذهبية عادةً 0.62). يوازن التخطيط بغضّ النظر عن عدد الأسطر.
 * • `middle`: نفس المفهوم عند 0.5.
 * • `bottom`: آخر baseline عند 85% من الارتفاع (يترك مساحة لـsource/logo).
 * • `top`: أول baseline عند 15% من الارتفاع.
 * • `below-kicker`: أول baseline بعد الكيكر بمسافة `kicker.gapBelow`.
 *   يتطلّب طبقة `kicker` مرسومة قبل هذه — RenderState.kicker يجب أن يكون
 *   مهيَّأ.
 */
function computeHeadlineAnchorY(
  anchor: HeadlineLayer['anchor'],
  verticalAnchor: number | undefined,
  size: CanvasSize,
  nLines: number,
  lineHeight: number,
  fontSize: number,
  state: RenderState
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
    case 'below-kicker': {
      const k = state.kicker;
      if (!k) {
        throw new Error(
          '[renderFrame] headline anchor=below-kicker قبل رسم kicker — راجع ترتيب الطبقات'
        );
      }
      // أول baseline = أسفل الكيكر + gapBelow + fontSize (لأن baseline في الأسفل)
      return k.baselineY + k.gapBelow + fontSize;
    }
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

// ── الإسناد (attribution) ────────────────────────────

/**
 * ينفّذ طبقة الإسناد. يتراجع صامتاً حين المحتوى المطلوب مفقود — لا
 * يخلّ بلقطات القوالب التي لا تُغذّي حقول الإسناد.
 *
 * **قاعدة قانونية:** `logoMode='official'` لا يُرسم إلا إن كان
 * `brand.attribution.logoAcks[platform].licenseAck === true` **و**
 * `assets.attributionPaths[platform]` مُمرَّراً. غياب أيّهما = تراجع
 * إلى 'generic' (يُعالجه resolveEffectiveLogoMode داخل الطبقة).
 */
function runAttribution(
  layer: AttributionLayer,
  args: RenderFrameArgs
): void {
  const handle = layer.handleField
    ? (args.content[layer.handleField] as string | undefined)
    : undefined;
  const name = layer.nameField
    ? (args.content[layer.nameField] as string | undefined)
    : undefined;

  // تراجع صامت عند غياب المحتوى المطلوب — نفس نمط source.
  const needsHandle = layer.mode === 'handle' || layer.mode === 'both';
  const needsName = layer.mode === 'name' || layer.mode === 'both';
  if (needsHandle && (!handle || handle.length === 0)) return;
  if (needsName && (!name || name.length === 0)) return;

  const officialPath = args.assets?.attributionPaths?.[layer.platform];

  drawAttribution(args.ctx, args.size, args.brand, {
    platform: layer.platform,
    mode: layer.mode,
    // anchor: مرَّر فقط حين يحمله القالب — الغياب = دَع الهوية تحدّد.
    ...(layer.anchor !== undefined && { anchor: layer.anchor }),
    ...(handle !== undefined && { handle }),
    ...(name !== undefined && { name }),
    ...(layer.prefixLabel !== undefined && { prefixLabel: layer.prefixLabel }),
    ...(layer.logoModeOverride !== undefined && {
      logoModeOverride: layer.logoModeOverride,
    }),
    ...(officialPath !== undefined && { officialPath }),
    ...(layer.margin !== undefined && { margin: layer.margin }),
  });
}

// ── الموزّع الرئيسي ──────────────────────────────────

/**
 * ينفّذ طبقة واحدة على `ctx` مع تقييم `onlyIf` و `fallback` recursive.
 * مُصدَّر ليتمكّن `drawAt` (في timeline/) من رسم طبقات فرديّة مع تحريك،
 * دون تكرار منطق الموزّع.
 */
export function executeLayer(
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
      runKicker(layer, args, state);
      return;
    case 'accent':
      runAccent(layer, args, state);
      return;
    case 'attribution':
      runAttribution(layer, args);
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
