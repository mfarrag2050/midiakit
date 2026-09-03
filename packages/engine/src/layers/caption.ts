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
// **العقد:**
//   drawCaption(ctx, size, brand, params) — يرسم الترجمة الفعّالة في t
//   يقرأ segments من params، يجد الفعّال، يبني tokens من words، يستدعي
//   wrapOptimal، يرسم بتلوين per-word حسب t.

import type {
  BrandKit,
  PlacementAnchor,
  PlacementSpec,
  Token,
  TypographyCaption,
  WordToken,
} from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasFontContext } from '../text/measurer.js';
import type { CanvasSize } from './image.js';
import { createCanvasMeasurer } from '../text/measurer.js';
import { parseTokens } from '../text/parse-tokens.js';
import { wrapOptimal } from '../text/wrap-optimal.js';
import { justifyLine } from '../text/kashida.js';
import { computeBreakPenalties } from '../render.js';
import { loadDefaultLexicon, type Lexicon } from '../arabic-lexicon/index.js';

// ── أنواع المدخلات ─────────────────────────────────────

/** كلمة موقوتة — من مخرج التفريغ. */
export interface CaptionWord {
  readonly start: number;   // ثانية
  readonly end: number;
  readonly text: string;
  readonly probability?: number;
}

/** مقطع ترجمة — مجموعة كلمات ضمن نافذة زمنية. */
export interface CaptionSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words: readonly CaptionWord[];
}

export interface CaptionParams {
  readonly segments: readonly CaptionSegment[];
  /** الوقت الحالي (ثانية) — يحدّد المقطع الفعّال + الكلمة النشطة. */
  readonly t: number;
  /** قاموس دلالي مخصّص (اختياري) — يمرَّر إلى wrapOptimal. */
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

// ── الدالة الرئيسية ────────────────────────────────────

const DEFAULT_LEXICON: Lexicon = loadDefaultLexicon();

export function drawCaption(
  ctx: CanvasDrawContext & CanvasFontContext,
  size: CanvasSize,
  brand: BrandKit,
  params: CaptionParams
): void {
  // الخط الطباعي اختياري — عند غيابه لا رسم.
  const cfg: TypographyCaption | undefined = brand.typography.caption;
  if (!cfg) return;

  // (١) إيجاد المقطع الفعّال — أوّل مقطع يحوي t.
  const t = params.t;
  const active = params.segments.find((s) => s.start <= t && t <= s.end);
  if (!active || active.words.length === 0) return;

  // (٢) بناء tokens من الكلمات.
  // **مهم:** `wrapOptimal` قد يستنسخ tokens أو يكون بنائها الداخلي
  // يفقد Object identity. لذلك **لا نعتمد Map<Token, index>**؛ بدلاً
  // منها نعتمد أن `wrapOptimal` يحفظ ترتيب الكلمات — نُحصي مؤشراً
  // متتابعاً على الأسطر النهائية ونربطه بـactive.words[i].
  const tokens: Token[] = active.words.map((w) => {
    const tok: WordToken = { text: w.text.trim(), bold: false, accent: false };
    return tok;
  });

  // (٣) قياسات + إعداد wrapOptimal (نفس knobs headline).
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

  // كسر دلالي مطبَّق على tokens إن فُعِّل في الهوية.
  const semanticEnabled = brand.typography.semanticBreaks.enabled;
  const breakPenalties = semanticEnabled
    ? computeBreakPenalties(tokens, params.lexicon ?? DEFAULT_LEXICON)
    : undefined;

  const justifyCfg = brand.typography.justify;
  const wrap = wrapOptimal(
    tokens,
    cfg.boxWidth,
    cfg.max,
    cfg.min,
    false,
    cfg.maxLines,
    1.0,           // shortLineRatio — الترجمة uniform
    cfg.lineHeight,
    measure,
    'uniform',
    {
      minLines: cfg.minLines,
      preferredLines: cfg.preferredLines,
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

  // (٤) تبرير الأسطر (كشيدة).
  const linesJustified = wrap.lines.map((line, i) =>
    justifyLine(
      line,
      wrap.boxWidth,
      wrap.fontSize,
      false,
      justifyCfg,
      brand.fonts.capabilities,
      measure,
      { isLast: i === wrap.lines.length - 1 }
    )
  );

  // (٥) حساب الموضع من brand.placement.caption.
  const { anchor, offset } = resolveCaptionAnchor(brand);
  const nLines = linesJustified.length;
  const blockHeight = nLines * wrap.lineHeight;
  const [vert, horiz] = anchor.split('-') as [
    'top' | 'middle' | 'bottom',
    'left' | 'center' | 'right'
  ];

  // مركز الحاوية العمودي (أول baseline).
  let firstBaseline: number;
  switch (vert) {
    case 'top':
      firstBaseline = offset.y + wrap.fontSize;
      break;
    case 'bottom':
      firstBaseline = size.h - offset.y - (nLines - 1) * wrap.lineHeight;
      break;
    case 'middle':
    default:
      firstBaseline = size.h / 2 - ((nLines - 1) * wrap.lineHeight) / 2;
      break;
  }

  // الحافة اليمنى للنص — للـRTL نضع rightX عند الحافة اليمنى للـboxWidth
  // المحسوب حول أنكور أفقي.
  const chosenBoxW = wrap.boxWidth;
  let rightX: number;
  switch (horiz) {
    case 'right':
      rightX = size.w - offset.x;
      break;
    case 'left':
      rightX = offset.x + chosenBoxW;
      break;
    case 'center':
    default:
      rightX = size.w / 2 + chosenBoxW / 2;
      break;
  }

  // (٦) رسم كل سطر مع تلوين per-word بحسب t.
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  ctx.font = `700 ${wrap.fontSize}px ${family}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  // نستعمل مؤشراً متتابعاً على كل الكلمات عبر كل الأسطر — يفترض أن
  // wrapOptimal يحفظ ترتيب الكلمات (يفعل ذلك — DP على تسلسل).
  let wordCursor = 0;
  for (let lineIdx = 0; lineIdx < linesJustified.length; lineIdx++) {
    const line = linesJustified[lineIdx]!;
    const y = firstBaseline + lineIdx * wrap.lineHeight;
    // نرسم كلمة كلمة من اليمين لليسار — يمكّن التلوين per-word.
    let x = rightX;
    for (const tok of line) {
      if (!isWord(tok)) continue;
      const wt = tok;
      // ربط الترتيبي مع active.words — يفترض تطابق ترتيب wrap مع input.
      const w = active.words[wordCursor];
      wordCursor++;
      // تلوين:
      //   • t < w.start ⇒ لاحق (شفافية)
      //   • w.start <= t <= w.end ⇒ نشط (accent)
      //   • t > w.end ⇒ سابق (نصّ عادي)
      let fill = brand.colors.text;
      let alpha = 1.0;
      if (w) {
        if (t < w.start) { alpha = brand.typography.caption?.futureWordOpacity ?? 0.55; }
        else if (t <= w.end) { fill = brand.colors.accent; }
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillText(wt.text, x, y);
      const wWidth = ctx.measureText(wt.text).width;
      ctx.restore();
      const spaceW = wrap.fontSize * 0.28;
      x -= wWidth + spaceW;
    }
  }
}
