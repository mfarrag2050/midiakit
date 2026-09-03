// layers/caption — طبقة الترجمة الصوتية بتزمين مستوى الكلمة.
//
// المرجع: docs/12 §1 (التفريغ) + PHASES.md §3.8 + user directive 2026-09-03.
//
// **الفلسفة:** الأدوات الأجنبية (CapCut · VEED · Submagic · ZapCap) تعرض
// ترجمة عربية بكسر سطور خاطئ وبلا كشيدة. نحن نمرّرها بمحرّك الطباعة نفسه:
//   • **wrapOptimal** — سطر ترجمة يُقسم حسب المعنى لا حسب العرض
//   • **الكشيدة** تعمل عليها إن فُعّلت في الهوية
//   • **الكسر الدلالي** — «مجلس الأمن» لا تنقسم في الترجمة أيضاً
//   • **تلوين الكلمة النشطة من اليمين** — النمط العربي الصحيح
//
// **مبدأ حاسم (2026-09-03، بعد اكتشاف اهتزاز الكشيدة):** التخطيط
// (wrap + justify + خرائط الكلمات) يُحسَب **مرّة واحدة عبر عمر المقطع**،
// ويُخزَّن في `PreparedCaption`. الرسم (drawCaptionAt) يقرأ الجاهز
// ويغيّر **المظهر لا التخطيط**. يضمن ثبات موضع الكشيدة عبر الإطارات.

import type {
  BrandKit,
  CaptionHighlightMode,
  PlacementAnchor,
  PlacementSpec,
  Token,
  TypographyCaption,
  WordToken,
} from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasFontContext } from '../text/measurer.js';
import { createCanvasMeasurer } from '../text/measurer.js';
import { wrapOptimal } from '../text/wrap-optimal.js';
import { justifyLine } from '../text/kashida.js';
import { computeBreakPenalties } from '../render.js';
import { loadDefaultLexicon, type Lexicon } from '../arabic-lexicon/index.js';

// ── أنواع المدخلات ─────────────────────────────────────

export interface CaptionWord {
  readonly start: number;   // ثانية
  readonly end: number;
  readonly text: string;
  readonly probability?: number;
}

export interface CaptionSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words: readonly CaptionWord[];
}

// ── نتيجة التحضير — تُحسَب مرة، تُقرأ كثيراً ────────────

/** موضع كلمة مرسومة بعد التبرير (المرجع للرسم والتلوين). */
export interface PreparedCaptionWord {
  readonly text: string;        // النصّ بعد كشيدة (إن وُجدت)
  readonly width: number;       // العرض المقيس (px)
  readonly rightX: number;      // إحداثي الحافّة اليمنى للكلمة
  readonly baselineY: number;
  readonly wordIdx: number;     // مؤشر في segment.words للتزمين
  readonly lineIdx: number;
}

export interface PreparedCaption {
  readonly segment: CaptionSegment;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly nLines: number;
  readonly words: readonly PreparedCaptionWord[];
  readonly family: string;
}

export interface CaptionParams {
  readonly segments: readonly CaptionSegment[];
  /** الوقت الحالي (ثانية). */
  readonly t: number;
  readonly lexicon?: Lexicon;
}

// ── حسم الأنكور من brand.placement ─────────────────────

function resolveCaptionAnchor(
  brand: BrandKit
): { anchor: PlacementAnchor; offset: { x: number; y: number } } {
  const placement: PlacementSpec | undefined = brand.placement?.caption;
  if (placement) {
    return {
      anchor: placement.anchor,
      offset: { x: placement.offset.x, y: placement.offset.y },
    };
  }
  return { anchor: 'bottom-center', offset: { x: 0, y: 180 } };
}

// ── كاش للتحضير (بحسب هوية segment) ─────────────────────
// WeakMap يُفرِغ إن أُطلقت المرجعية على segment.
const PREPARED_CACHE = new WeakMap<CaptionSegment, PreparedCaption>();

const DEFAULT_LEXICON: Lexicon = loadDefaultLexicon();

// ── التحضير: مرة عبر عمر المقطع ────────────────────────

/**
 * يحسب wrap + justify + خرائط المواضع لمقطع كامل. النتيجة قابلة لإعادة
 * الاستعمال في كل إطار داخل [segment.start, segment.end]. يُخزَّن في
 * WeakMap بمفتاح مرجع الـsegment — نفس المرجع → إعادة نفس النتيجة.
 */
export function prepareCaption(
  ctx: CanvasDrawContext & CanvasFontContext,
  size: { readonly w: number; readonly h: number },
  brand: BrandKit,
  segment: CaptionSegment,
  lexicon?: Lexicon
): PreparedCaption | null {
  const cached = PREPARED_CACHE.get(segment);
  if (cached) return cached;

  const cfg: TypographyCaption | undefined = brand.typography.caption;
  if (!cfg) return null;
  if (segment.words.length === 0) return null;

  // (١) بناء tokens من الكلمات، بترتيبها في المصدر.
  const tokens: Token[] = segment.words.map((w) => ({
    text: w.text.trim(), bold: false, accent: false,
  }));

  // (٢) قياسات + wrapOptimal.
  const measure = createCanvasMeasurer(ctx, brand);
  const readableMin = Math.round(size.w * cfg.readableMinRatio);
  const [bwMinR, bwMaxR] = cfg.boxWidthRange;
  const BW_STEPS = 8;
  const boxWidthCandidates: number[] = [];
  for (let i = 0; i < BW_STEPS; i++) {
    const p = i / (BW_STEPS - 1);
    boxWidthCandidates.push(Math.round(size.w * (bwMinR + p * (bwMaxR - bwMinR))));
  }
  const fsRange: [number, number] = [
    Math.round(size.w * cfg.headlineFsRatio[0]),
    Math.round(size.w * cfg.headlineFsRatio[1]),
  ];

  const semanticEnabled = brand.typography.semanticBreaks.enabled;
  const breakPenalties = semanticEnabled
    ? computeBreakPenalties(tokens, lexicon ?? DEFAULT_LEXICON)
    : undefined;

  const justifyCfg = brand.typography.justify;
  const wrap = wrapOptimal(
    tokens, cfg.boxWidth, cfg.max, cfg.min, false,
    cfg.maxLines, 1.0, cfg.lineHeight, measure, 'uniform',
    {
      minLines: cfg.minLines,
      preferredLines: cfg.preferredLines,
      readableMin,
      preferLargestFs: true,
      absoluteMinFill: justifyCfg.minLineFill,
      boxWidthCandidates,
      fsRange,
      justifyCapacityConfig: { cfg: justifyCfg, fontCaps: brand.fonts.capabilities },
      ...(breakPenalties && { breakPenalties }),
    }
  );

  const linesJustified = wrap.lines.map((line, i) =>
    justifyLine(
      line, wrap.boxWidth, wrap.fontSize, false, justifyCfg,
      brand.fonts.capabilities, measure,
      { isLast: i === wrap.lines.length - 1 }
    )
  );

  // (٣) موقع الكتلة + قياس عرض كل كلمة بعد الكشيدة.
  const { anchor, offset } = resolveCaptionAnchor(brand);
  const nLines = linesJustified.length;
  const [vert, horiz] = anchor.split('-') as [
    'top' | 'middle' | 'bottom', 'left' | 'center' | 'right'
  ];
  let firstBaseline: number;
  switch (vert) {
    case 'top':    firstBaseline = offset.y + wrap.fontSize; break;
    case 'bottom': firstBaseline = size.h - offset.y - (nLines - 1) * wrap.lineHeight; break;
    default:       firstBaseline = size.h / 2 - ((nLines - 1) * wrap.lineHeight) / 2;
  }
  const chosenBoxW = wrap.boxWidth;
  let rightXBase: number;
  switch (horiz) {
    case 'right':  rightXBase = size.w - offset.x; break;
    case 'left':   rightXBase = offset.x + chosenBoxW; break;
    default:       rightXBase = size.w / 2 + chosenBoxW / 2;
  }

  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  // نضبط ctx.font للقياس فقط — الرسم يعيد ضبطه مطابقاً.
  ctx.font = `700 ${wrap.fontSize}px ${family}`;

  const spaceW = wrap.fontSize * 0.28;
  const words: PreparedCaptionWord[] = [];
  let wordCursor = 0;
  for (let lineIdx = 0; lineIdx < linesJustified.length; lineIdx++) {
    const line = linesJustified[lineIdx]!;
    const y = firstBaseline + lineIdx * wrap.lineHeight;
    let x = rightXBase;
    for (const tok of line) {
      if (!isWord(tok)) continue;
      const wt = tok as WordToken;
      const wWidth = ctx.measureText(wt.text).width;
      words.push({
        text: wt.text,
        width: wWidth,
        rightX: x,
        baselineY: y,
        wordIdx: wordCursor,
        lineIdx,
      });
      wordCursor++;
      x -= wWidth + spaceW;
    }
  }

  const prepared: PreparedCaption = {
    segment,
    fontSize: wrap.fontSize,
    lineHeight: wrap.lineHeight,
    nLines,
    words,
    family,
  };
  PREPARED_CACHE.set(segment, prepared);
  return prepared;
}

// ── الرسم عند t — يقرأ الجاهز، يغيّر المظهر فقط ────────

/**
 * يرسم الترجمة عند وقت t باستهلاك التحضير المُخزَّن.
 * **لا يغيّر التخطيط.** الكشيدة والمواضع والأحجام ثابتة عبر الإطارات.
 */
export function drawCaption(
  ctx: CanvasDrawContext & CanvasFontContext,
  size: { readonly w: number; readonly h: number },
  brand: BrandKit,
  params: CaptionParams
): void {
  const cfg = brand.typography.caption;
  if (!cfg) return;

  const t = params.t;
  const active = params.segments.find((s) => s.start <= t && t <= s.end);
  if (!active) return;

  const prep = prepareCaption(ctx, size, brand, active, params.lexicon);
  if (!prep) return;

  const mode: CaptionHighlightMode = cfg.highlightMode ?? 'wordColor';
  if (mode === 'none') {
    drawFixedText(ctx, prep, brand);
    return;
  }

  ctx.font = `700 ${prep.fontSize}px ${prep.family}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  const highlightColor = cfg.highlightColor ?? brand.colors.accent;
  const pastOpacity = cfg.pastOpacity ?? 1.0;
  const futureOpacity =
    cfg.futureOpacity ?? cfg.futureWordOpacity ?? 0.55;

  for (const w of prep.words) {
    const word = active.words[w.wordIdx];
    if (!word) continue;
    const status =
      t < word.start ? 'future'
      : t <= word.end ? 'active'
      : 'past';

    switch (mode) {
      case 'progressiveReveal': {
        if (status === 'future') continue; // لا رسم للاحقة
        const color = status === 'active' ? highlightColor : brand.colors.text;
        drawWord(ctx, w, color, 1.0);
        break;
      }
      case 'wordBackground': {
        if (status === 'active') {
          drawWordBackground(ctx, w, prep.fontSize, highlightColor);
          drawWord(ctx, w, brand.colors.surface, 1.0);
        } else {
          const alpha = status === 'past' ? pastOpacity : futureOpacity;
          drawWord(ctx, w, brand.colors.text, alpha);
        }
        break;
      }
      case 'wordScale': {
        if (status === 'active') {
          drawWordScaled(ctx, w, brand.colors.text, highlightColor, 1.12, prep.fontSize, prep.family);
        } else {
          const alpha = status === 'past' ? pastOpacity : futureOpacity;
          drawWord(ctx, w, brand.colors.text, alpha);
        }
        break;
      }
      case 'wordColor':
      default: {
        if (status === 'active') {
          drawWord(ctx, w, highlightColor, 1.0);
        } else {
          const alpha = status === 'past' ? pastOpacity : futureOpacity;
          drawWord(ctx, w, brand.colors.text, alpha);
        }
      }
    }
  }
}

// ── مساعدات رسم منخفضة المستوى ─────────────────────────

function drawWord(
  ctx: CanvasDrawContext,
  w: PreparedCaptionWord,
  fill: string,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillText(w.text, w.rightX, w.baselineY);
  ctx.restore();
}

function drawWordBackground(
  ctx: CanvasDrawContext,
  w: PreparedCaptionWord,
  fontSize: number,
  fill: string
): void {
  const pad = Math.round(fontSize * 0.18);
  const height = Math.round(fontSize * 1.15);
  const bgY = w.baselineY - height + Math.round(fontSize * 0.28);
  const bgX = w.rightX - w.width - pad;
  ctx.save();
  ctx.fillStyle = fill;
  const r = Math.round(fontSize * 0.15);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, w.width + pad * 2, height, r);
    ctx.fill();
  } else {
    ctx.fillRect(bgX, bgY, w.width + pad * 2, height);
  }
  ctx.restore();
}

function drawWordScaled(
  ctx: CanvasDrawContext & CanvasFontContext,
  w: PreparedCaptionWord,
  _baseColor: string,
  highlightColor: string,
  scale: number,
  fontSize: number,
  family: string
): void {
  // نُكبّر بلمس خط الأساس فقط — بلا إخلال بمواضع الكلمات الأخرى.
  ctx.save();
  ctx.translate(w.rightX, w.baselineY);
  ctx.scale(scale, scale);
  ctx.fillStyle = highlightColor;
  ctx.font = `700 ${fontSize}px ${family}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(w.text, 0, 0);
  ctx.restore();
}

function drawFixedText(
  ctx: CanvasDrawContext & CanvasFontContext,
  prep: PreparedCaption,
  brand: BrandKit
): void {
  ctx.font = `700 ${prep.fontSize}px ${prep.family}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = brand.colors.text;
  for (const w of prep.words) {
    ctx.fillText(w.text, w.rightX, w.baselineY);
  }
}
