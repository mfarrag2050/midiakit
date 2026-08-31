// wrapOptimal — لف سطور بأولوية «الملء ثم المقروئية».
//
// **قرار المالك (2026-08-28، الإصدار الثالث):**
// المقروئية شرط، لكن الملء أثرها البصري أكبر بكثير من فرق fs ضمن نطاق آمن.
// الفروق البصرية:
//   • فرق 2–6px في fs = **غير مرئي** فعلياً على الشاشة
//   • فرق 15%+ في ملء السطر = **مرئي بوضوح** (سطور فارغة تبدو محبوسة)
//
// **الآلية الجديدة:**
//   1) `readableMin` صار **نسبة من عرض القماش** (`readableMinRatio`)،
//      يُحسَب كـ `canvasWidth × ratio` من قِبل المستدعي (preview.mjs).
//      على 1080px بنسبة 0.045 = 48.6px. القاعدة تُطبَّق كأرضية صلبة.
//   2) `targetFill` هدف صريح (0.90). **الحلّ الذي يبلغه بأيّ fs ضمن
//      النطاق الآمن يفوز** على حلّ بخط أكبر وملء أدنى.
//   3) عند غياب حلٍّ يبلغ الهدف: يُختار أكبر fs نظيف، ثم تُطبَّق قاعدة
//      «التبديل نزولاً»: إن كان حلّ بـfs أدنى بفارق ≤ 6px يعطي ملء
//      أعلى بـ 15%+، يُختار بدلاً منه.
//
// **معيار «النظافة» (شرط قبول أساسي):**
//   • لا سطر بكلمة واحدة
//   • عدد الأسطر ∈ [minLines, maxLines]
//   • انحراف معياري ≤ stddevMax (افتراضي 15%)
//   • السطر الأخير ≥ lastMinRatio من المتوسّط (افتراضي 60%)
//   • أدنى ملء ≥ 50% (أرضية «لا يبدو مُهملاً»)
//
// **دور DP:** يبقى داخل كل زوج (fs, k) لإيجاد أفضل تقسيم للـ k أسطر.
// دالة الكلفة تُبقى كما هي — تُوجّه اختيار التقسيم ضمن fs معيّن، لا
// اختيار fs. هذا الفصل هو التصحيح الجوهري.

import type {
  FontCaps,
  JustifyConfig,
  Token,
  WrapResult,
} from '@pf-mediakit/shared';
import { isBreak, isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';
import { estimateLineCapacity } from './kashida.js';

/** وضع اللف — يقابل `brand.typography.breaking.wrapMode`. */
export type OptimalMode = 'uniform' | 'alternating';

/** خيارات لضبط سلوك الاختيار (تُمرَّر من الهوية عبر preview.mjs مثلاً). */
export interface WrapOptimalOptions {
  /** الحدّ الأدنى لعدد الأسطر. افتراضي 1. */
  minLines?: number;
  /** العدد المفضّل من الأسطر عند تكافؤ الحلول. افتراضي = maxLines (لا تفضيل). */
  preferredLines?: number;
  /** أرضية صلبة لحجم الخط بالبكسل. افتراضي = minFont. */
  readableMin?: number;
  /**
   * الملء المستهدف — الحلّ الذي يبلغه بأيّ fs ضمن النطاق الآمن يفوز
   * على حلّ بخط أكبر وملء أدنى. افتراضي 0.9.
   */
  targetFill?: number;
  /** انحراف معياري أقصى (نسبة من المتوسّط) لقبول الحلّ. افتراضي 0.15. */
  stddevMax?: number;
  /** أدنى ملء مطلق لأي سطر (أرضية «لا يبدو مُهملاً»). افتراضي 0.5. */
  absoluteMinFill?: number;
  /** أدنى نسبة للسطر الأخير من متوسّط الأسطر. افتراضي 0.6. */
  lastMinRatio?: number;
  /**
   * فارق fs الأقصى لقاعدة «التبديل نزولاً» (بكسلات).
   * إن كان حلّ بـfs أدنى بفارق ≤ هذا الرقم يعطي ملء أعلى بمقدار
   * `swapMinFillGain`، يُختار بدلاً من الأكبر. افتراضي 6.
   */
  swapMaxFsDiff?: number;
  /** مكسب الملء المطلوب لتفعيل التبديل نزولاً. افتراضي 0.15. */
  swapMinFillGain?: number;
  /**
   * تفضيل الخط الأكبر بلا شرط ملء أو انحراف — يُستعمل عندما تكون
   * مسؤولية الملء على `justifyLine` (الكشيدة) لا على اللف.
   *
   * السلوك عند التفعيل:
   *   • قيود القبول تتقلّص إلى: كل الأسطر ضمن `boxW`، لا سطر بكلمة
   *     واحدة، `k ∈ [minLines, maxLines]`.
   *   • يُختار **أكبر fs** له حلّ مقبول؛ عند التعادل، الأقرب إلى
   *     `preferredLines`.
   *   • تُتجاوز `stddevMax` و `absoluteMinFill` و `lastMinRatio` و
   *     `targetFill` و «التبديل نزولاً» — لأن الكشيدة ستُبرِّر الأسطر
   *     بعد اللف.
   *
   * افتراضي `false` — للحفاظ على السلوك الحالي حين لا كشيدة.
   */
  preferLargestFs?: boolean;
  /**
   * قائمة عروض صندوق مرشّحة (بالبكسل). عند تمريرها مع `preferLargestFs`،
   * يستكشف اللف عدة عروض ويختار التركيبة `(fs, boxWidth, k)` التي:
   *   1) تعطي أكبر `fs`، ثم
   *   2) أكبر `boxWidth` (حضور بصري أقوى)، ثم
   *   3) أدنى انحراف بين الأسطر، ثم
   *   4) أقرب إلى `preferredLines`.
   *
   * **السبب المعماري:** كشيدة أداة ضبط دقيق. عرض صندوق ثابت قد يخلق
   * فجوة تفوق سعتها؛ عرض أضيق يعطي ملء طبيعي ≥ 0.82 فتُكمل الكشيدة.
   *
   * تُشتقّ عادةً من `brand.typography.breaking.boxWidthRange × canvas.w`.
   * الترتيب المُدخل غير مهمّ — تُفرَز داخلياً من الأكبر إلى الأصغر.
   */
  boxWidthCandidates?: readonly number[];
  /**
   * **نطاق حجم الخط المفضّل** بالبكسل — يُشتقّ من
   * `brand.typography.breaking.headlineFsRatio × canvas.w`.
   *
   * السلوك مع `preferLargestFs`:
   *   • **الطور الأول:** يقصر بحث fs على `[max(effectiveMin, fsRange[0]),
   *     min(maxFont, fsRange[1])]` ويطبّق قبولاً كاملاً (post-kashida
   *     ≥ absoluteMinFill، لا سطر بكلمة واحدة، stddev ≤ stddevMax).
   *   • **الطور الثاني (تراجع):** إن فشل، يُعاد البحث على المدى الكامل
   *     `[effectiveMinFs, maxFont]` بنفس القبول — تنازل عن التفضيل، لا
   *     عن الجودة.
   */
  fsRange?: readonly [number, number];
  /**
   * تكوين الكشيدة لتقدير سعة التمدد لكل سطر أثناء اختيار (fs, boxW, k).
   *
   * عند تمريره: القبول يستعمل `(rawWidth + capacity) / boxW` بدلاً من
   * `rawWidth / boxW`. السبب: كشيدة تسدّ آخر 5-15%؛ لو ثبت اللف على
   * ملء ≥ 0.82 خام، لا حاجة لها — والقيود لا تعكس دورها الحقيقي.
   *
   * السعة تُحسَب: `Σ_words min(kashidaSites(word).length, maxSitesPerWord)
   * × maxTatweelsPerSite × tatweelUnit` — مطابقة لسلوك `justifyLine`.
   */
  justifyCapacityConfig?: {
    readonly cfg: JustifyConfig;
    readonly fontCaps: FontCaps;
  };
}

// ── أوزان دالة كلفة uniform (تُوجّه DP داخل fs, k) ────────
const U_UNDERFILL_SEVERE = 5000;
const U_UNDERFILL_SEVERE_THRESHOLD = 0.6;
const U_UNDERFILL_MILD = 500;
const U_UNDERFILL_MILD_THRESHOLD = 0.8;
const U_VARIANCE = 2000;
const U_SINGLE_WORD = 8000;
const U_LAST_ORPHAN = 3000;
const U_LAST_MIN_RATIO = 0.6;

// ── أوزان دالة كلفة alternating (الموروثة) ──────────────
const A_UNDERFILL = 100;
const A_SINGLE_WORD = 800;
const A_ORPHAN = 1600;
const A_PYRAMID_BREAK = 400;
const A_ORPHAN_FILL_THRESHOLD = 0.4;

const INF = Number.POSITIVE_INFINITY;

interface Cell {
  total: number;
  prevJ: number;
  lineWidth: number;
}

interface SolveResult {
  fontSize: number;
  lines: Token[][];
  totalCost: number;
}

interface AcceptCriteria {
  readonly stddevMax: number;
  readonly absoluteMinFill: number;
  readonly lastMinRatio: number;
}

/**
 * أدنى ملء بعد الكشيدة بين كل الأسطر (السطر الأخير مستثنى — طبيعي).
 * يُستعمل داخل قبول `preferLargestFs` بديلاً عن `metrics.minFill` الخام.
 * السعة تُقدَّر عبر `estimateLineCapacity` من kashida.ts (مصدر وحيد).
 */
function minPostKashidaFill(
  lines: readonly (readonly Token[])[],
  widths: readonly number[],
  boxW: number,
  fs: number,
  allBold: boolean,
  cfg: JustifyConfig,
  fontCaps: FontCaps,
  measure: Measurer,
  lastLineNatural: boolean
): number {
  let min = 1;
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    // آخر سطر طبيعي مستثنى — لا كشيدة تُطبَّق عليه.
    if (isLast && lastLineNatural) continue;
    const raw = widths[i]!;
    const cap = estimateLineCapacity(
      lines[i]!,
      fs,
      allBold,
      cfg,
      fontCaps,
      measure
    );
    const fill = boxW > 0 ? Math.min(1, (raw + cap) / boxW) : 0;
    if (fill < min) min = fill;
  }
  return min;
}

function lineLimit(
  lineIdx: number,
  boxW: number,
  shortRatio: number,
  mode: OptimalMode
): number {
  if (mode === 'uniform') return boxW;
  return lineIdx % 2 === 0 ? boxW : boxW * shortRatio;
}

// ── دوال كلفة السطر (تُوجّه DP الداخلي) ────────────────

function costUniform(params: {
  width: number;
  boxW: number;
  wordCount: number;
  isLast: boolean;
  lineIdx: number;
  prevLineWidth: number;
}): number {
  const { width, boxW, wordCount, isLast, lineIdx, prevLineWidth } = params;
  let cost = 0;
  const fill = width / boxW;
  if (fill < U_UNDERFILL_SEVERE_THRESHOLD) {
    const under = U_UNDERFILL_SEVERE_THRESHOLD - fill;
    cost += under * under * U_UNDERFILL_SEVERE;
  } else if (fill < U_UNDERFILL_MILD_THRESHOLD) {
    const under = U_UNDERFILL_MILD_THRESHOLD - fill;
    cost += under * under * U_UNDERFILL_MILD;
  }
  if (wordCount === 1) cost += U_SINGLE_WORD;
  if (lineIdx > 0) {
    const diff = (width - prevLineWidth) / boxW;
    cost += diff * diff * U_VARIANCE;
  }
  if (isLast && prevLineWidth > 0) {
    const ratio = width / prevLineWidth;
    if (ratio < U_LAST_MIN_RATIO) {
      const under = U_LAST_MIN_RATIO - ratio;
      cost += under * under * U_LAST_ORPHAN;
    }
  }
  return cost;
}

function costAlternating(params: {
  width: number;
  limit: number;
  wordCount: number;
  isLast: boolean;
  lineIdx: number;
  prevLineWidth: number;
  prevLimit: number;
}): number {
  const {
    width,
    limit,
    wordCount,
    isLast,
    lineIdx,
    prevLineWidth,
    prevLimit,
  } = params;
  const fillRatio = width / limit;
  const underfill = Math.max(0, 1 - fillRatio);
  let cost = underfill * underfill * A_UNDERFILL;
  if (wordCount === 1) cost += A_SINGLE_WORD;
  if (isLast) {
    if (wordCount === 1 || fillRatio < A_ORPHAN_FILL_THRESHOLD) {
      cost += A_ORPHAN;
    }
  }
  if (lineIdx > 0 && lineIdx % 2 === 1 && prevLimit > limit) {
    if (width > prevLineWidth) {
      const excess = (width - prevLineWidth) / limit;
      cost += excess * excess * A_PYRAMID_BREAK;
    }
  }
  return cost;
}

// ── DP يعيد أفضل تقسيم لكل k في [1, maxLines] ─────────

function solveDPPerK(
  words: readonly Token[],
  fs: number,
  boxW: number,
  shortRatio: number,
  maxLines: number,
  allBold: boolean,
  measure: Measurer,
  mode: OptimalMode
): (SolveResult | null)[] {
  const n = words.length;
  const results: (SolveResult | null)[] = new Array(maxLines + 1).fill(null);
  if (n === 0) return results;

  const dp: Cell[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: maxLines + 1 }, () => ({
      total: INF,
      prevJ: -1,
      lineWidth: 0,
    }))
  );
  dp[0]![0]! = { total: 0, prevJ: -1, lineWidth: 0 };

  for (let k = 1; k <= maxLines; k++) {
    const lineIdx = k - 1;
    const limit = lineLimit(lineIdx, boxW, shortRatio, mode);
    const prevLimit =
      k >= 2 ? lineLimit(lineIdx - 1, boxW, shortRatio, mode) : boxW;

    for (let i = 1; i <= n; i++) {
      let best = dp[i]![k]!;
      for (let j = 0; j < i; j++) {
        const prev = dp[j]![k - 1]!;
        if (prev.total === INF) continue;
        const slice = words.slice(j, i);
        const w = measure.line(slice, fs, allBold);
        if (w > limit) continue;

        const isLast = i === n;
        const c =
          mode === 'uniform'
            ? costUniform({
                width: w,
                boxW,
                wordCount: slice.length,
                isLast,
                lineIdx,
                prevLineWidth: prev.lineWidth,
              })
            : costAlternating({
                width: w,
                limit,
                wordCount: slice.length,
                isLast,
                lineIdx,
                prevLineWidth: prev.lineWidth,
                prevLimit,
              });
        const total = prev.total + c;
        if (total < best.total) {
          best = { total, prevJ: j, lineWidth: w };
        }
      }
      dp[i]![k] = best;
    }
  }

  // Trace back لكل k فيه حلّ منتهي
  for (let k = 1; k <= maxLines; k++) {
    const cell = dp[n]![k]!;
    if (cell.total === INF) continue;
    const linesReversed: Token[][] = [];
    let i = n;
    let curK = k;
    while (curK > 0) {
      const c = dp[i]![curK]!;
      const j = c.prevJ;
      linesReversed.push(words.slice(j, i));
      i = j;
      curK--;
    }
    results[k] = {
      fontSize: fs,
      lines: linesReversed.reverse(),
      totalCost: cell.total,
    };
  }

  return results;
}

// ── قياس + معيار قبول ─────────────────────────────────

interface Metrics {
  widths: number[];
  mean: number;
  stddev: number;
  stddevRatio: number;
  minFill: number;
  lastRatio: number;
}

function computeMetrics(
  res: SolveResult,
  fs: number,
  boxW: number,
  allBold: boolean,
  measure: Measurer
): Metrics {
  const widths = res.lines.map((l) => measure.line(l, fs, allBold));
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance =
    widths.reduce((s, w) => s + (w - mean) ** 2, 0) / widths.length;
  const stddev = Math.sqrt(variance);
  return {
    widths,
    mean,
    stddev,
    stddevRatio: mean === 0 ? 0 : stddev / mean,
    minFill: boxW === 0 ? 0 : Math.min(...widths.map((w) => w / boxW)),
    lastRatio: mean === 0 ? 0 : widths[widths.length - 1]! / mean,
  };
}

function isAcceptable(
  res: SolveResult,
  metrics: Metrics,
  criteria: AcceptCriteria,
  mode: OptimalMode,
  boxW: number,
  shortRatio: number,
  fs: number,
  allBold: boolean,
  measure: Measurer
): boolean {
  // منع سطر بكلمة واحدة — قيد صلب
  if (res.lines.some((l) => l.length === 1)) return false;

  if (mode === 'uniform') {
    if (metrics.stddevRatio > criteria.stddevMax) return false;
    if (metrics.minFill < criteria.absoluteMinFill) return false;
    if (metrics.lastRatio < criteria.lastMinRatio) return false;
    return true;
  }

  // Alternating: كل سطر يفحص ملء موقعه (فردي/زوجي)
  for (let i = 0; i < res.lines.length; i++) {
    const w = measure.line(res.lines[i]!, fs, allBold);
    const limit = lineLimit(i, boxW, shortRatio, mode);
    const fill = w / limit;
    const isLast = i === res.lines.length - 1;
    const floor = isLast ? 0.4 : 0.7;
    if (fill < floor) return false;
  }
  return true;
}

// ── اختيار k مفضّل عند fs معيّن ────────────────────────

function pickPreferredK(
  candidates: readonly { k: number; res: SolveResult; metrics: Metrics }[],
  preferredLines: number
): { k: number; res: SolveResult; metrics: Metrics } {
  const sorted = [...candidates].sort((a, b) => {
    const dA = Math.abs(a.k - preferredLines);
    const dB = Math.abs(b.k - preferredLines);
    if (dA !== dB) return dA - dB;
    return b.k - a.k; // تعادل: أكثر أسطر
  });
  return sorted[0]!;
}

interface FsCandidate {
  fs: number;
  k: number;
  res: SolveResult;
  metrics: Metrics;
}

// ── الواجهة العامة ─────────────────────────────────────

/**
 * لف الأسطر مع أولوية «الملء ثم المقروئية».
 *
 * @param mode 'uniform' (افتراضي) أو 'alternating' (موروث)
 * @param options ضبط دقيق لقيود عدد الأسطر والملء والمقروئية
 */
export function wrapOptimal(
  tokens: readonly Token[],
  boxW: number,
  maxFont: number,
  minFont: number,
  allBold: boolean,
  maxLines: number,
  shortRatio: number,
  lineHeightRatio: number,
  measure: Measurer,
  mode: OptimalMode = 'uniform',
  options: WrapOptimalOptions = {}
): WrapResult {
  const minLines = options.minLines ?? 1;
  const preferredLines = options.preferredLines ?? maxLines;
  const readableMin = options.readableMin ?? minFont;
  const targetFill = options.targetFill ?? 0.9;
  const criteria: AcceptCriteria = {
    stddevMax: options.stddevMax ?? 0.15,
    absoluteMinFill: options.absoluteMinFill ?? 0.5,
    lastMinRatio: options.lastMinRatio ?? 0.6,
  };
  const swapMaxFsDiff = options.swapMaxFsDiff ?? 6;
  const swapMinFillGain = options.swapMinFillGain ?? 0.15;
  const preferLargestFs = options.preferLargestFs ?? false;

  // ── الوضع اليدوي: احترام \n ─────────────────────────
  const hasManualBreaks = tokens.some(isBreak);
  if (hasManualBreaks) {
    const manual: Token[][] = [];
    let cur: Token[] = [];
    for (const t of tokens) {
      if (isBreak(t)) {
        manual.push(cur);
        cur = [];
      } else {
        cur.push(t);
      }
    }
    manual.push(cur);
    const lines = manual.filter((l) => l.length > 0);

    for (let fs = maxFont; fs >= minFont; fs -= 2) {
      if (lines.every((l) => measure.line(l, fs, allBold) <= boxW)) {
        return {
          fontSize: fs,
          lines,
          lineHeight: Math.round(fs * lineHeightRatio),
          boxWidth: boxW,
        };
      }
    }
    return {
      fontSize: minFont,
      lines,
      lineHeight: Math.round(minFont * lineHeightRatio),
      boxWidth: boxW,
    };
  }

  const words: Token[] = tokens.filter(isWord);
  if (words.length === 0) {
    return {
      fontSize: maxFont,
      lines: [],
      lineHeight: Math.round(maxFont * lineHeightRatio),
      boxWidth: boxW,
    };
  }

  // كلمة واحدة: لا خيار طباعياً
  if (words.length === 1) {
    for (let fs = maxFont; fs >= minFont; fs -= 2) {
      if (measure.line(words, fs, allBold) <= boxW) {
        return {
          fontSize: fs,
          lines: [words],
          lineHeight: Math.round(fs * lineHeightRatio),
          boxWidth: boxW,
        };
      }
    }
    return {
      fontSize: minFont,
      lines: [words],
      lineHeight: Math.round(minFont * lineHeightRatio),
      boxWidth: boxW,
    };
  }

  const effectiveMinFs = Math.max(minFont, readableMin);

  const toResult = (r: SolveResult, bw: number = boxW): WrapResult => ({
    fontSize: r.fontSize,
    lines: r.lines,
    lineHeight: Math.round(r.fontSize * lineHeightRatio),
    boxWidth: bw,
  });

  // ── (٠) وضع preferLargestFs: مسؤولية الملء على justifyLine (كشيدة) ─
  //
  // بحث ثنائي الأطوار:
  //   الطور 1: fs محصور بـ `fsRange` (النطاق الصحفي المفضّل).
  //   الطور 2: تراجع إلى المدى الكامل [effectiveMinFs, maxFont].
  //
  // قبول موحّد في الطورين:
  //   • كل الأسطر ضمن `bw` (قيد صلب داخل DP).
  //   • لا سطر بكلمة واحدة.
  //   • `k ∈ [minLines, maxLines]`.
  //   • انحراف ≤ `stddevMax` (افتراضي 0.15).
  //   • إن مُرِّرت `justifyCapacityConfig`: أدنى ملء **بعد الكشيدة** ≥
  //     `absoluteMinFill` (السطر الأخير مستثنى إن `lastLine='natural'`).
  //     خلاف ذلك: أدنى ملء **خام** ≥ `absoluteMinFill`.
  //
  // ترتيب الفوز: أكبر fs → أكبر boxWidth → أدنى انحراف → أقرب preferredLines.
  if (preferLargestFs) {
    const floorForPrefer = options.absoluteMinFill ?? 0.5;
    const stddevMax = options.stddevMax ?? 0.15;
    const boxWidths =
      options.boxWidthCandidates && options.boxWidthCandidates.length > 0
        ? [...new Set(options.boxWidthCandidates)].sort((a, b) => b - a)
        : [boxW];
    const capCfg = options.justifyCapacityConfig;
    const lastLineNatural = capCfg?.cfg.lastLine === 'natural';

    interface Cross {
      readonly fs: number;
      readonly bw: number;
      readonly k: number;
      readonly res: SolveResult;
      readonly metrics: Metrics;
      readonly minPostFill: number;
    }

    const searchIn = (fsLo: number, fsHi: number): readonly Cross[] => {
      const out: Cross[] = [];
      const lo = Math.max(effectiveMinFs, fsLo);
      const hi = Math.min(maxFont, fsHi);
      if (lo > hi) return out;
      for (const bw of boxWidths) {
        for (let fs = hi; fs >= lo; fs -= 2) {
          const perK = solveDPPerK(
            words,
            fs,
            bw,
            shortRatio,
            maxLines,
            allBold,
            measure,
            mode
          );
          for (let k = Math.max(minLines, 1); k <= maxLines; k++) {
            const r = perK[k];
            if (!r) continue;
            if (r.lines.some((l) => l.length === 1)) continue;
            const metrics = computeMetrics(r, fs, bw, allBold, measure);
            if (metrics.stddevRatio > stddevMax) continue;

            let postFill: number;
            if (capCfg) {
              postFill = minPostKashidaFill(
                r.lines,
                metrics.widths,
                bw,
                fs,
                allBold,
                capCfg.cfg,
                capCfg.fontCaps,
                measure,
                lastLineNatural
              );
            } else {
              postFill = metrics.minFill;
            }
            if (postFill < floorForPrefer) continue;

            out.push({ fs, bw, k, res: r, metrics, minPostFill: postFill });
          }
        }
      }
      return out;
    };

    const pickWinner = (
      candidates: readonly Cross[]
    ): Cross | null => {
      if (candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) => {
        if (a.fs !== b.fs) return b.fs - a.fs;
        if (a.bw !== b.bw) return b.bw - a.bw;
        if (a.metrics.stddevRatio !== b.metrics.stddevRatio) {
          return a.metrics.stddevRatio - b.metrics.stddevRatio;
        }
        const dA = Math.abs(a.k - preferredLines);
        const dB = Math.abs(b.k - preferredLines);
        return dA - dB;
      });
      return sorted[0]!;
    };

    // الطور 1: داخل fsRange (إن قُدّم)
    if (options.fsRange) {
      const [lo, hi] = options.fsRange;
      const phase1 = searchIn(lo, hi);
      const w1 = pickWinner(phase1);
      if (w1) return toResult(w1.res, w1.bw);
    }

    // الطور 2: المدى الكامل
    const phase2 = searchIn(effectiveMinFs, maxFont);
    const w2 = pickWinner(phase2);
    if (w2) return toResult(w2.res, w2.bw);

    // لا حلّ عند أي (fs, bw) — نسقط إلى مسار التراجع أدناه.
  }

  // ── (١) اجمع كل المرشحين (fs, k) المقبولين
  //         نُبقي كل الأزواج، لا نُلغي k المرغوبة قبل فحص التارجت.
  const allPairs: FsCandidate[] = [];
  for (let fs = maxFont; fs >= effectiveMinFs; fs -= 2) {
    const perK = solveDPPerK(
      words,
      fs,
      boxW,
      shortRatio,
      maxLines,
      allBold,
      measure,
      mode
    );
    for (let k = Math.max(minLines, 1); k <= maxLines; k++) {
      const r = perK[k];
      if (!r) continue;
      const metrics = computeMetrics(r, fs, boxW, allBold, measure);
      if (
        isAcceptable(
          r,
          metrics,
          criteria,
          mode,
          boxW,
          shortRatio,
          fs,
          allBold,
          measure
        )
      ) {
        allPairs.push({ fs, k, res: r, metrics });
      }
    }
  }

  if (allPairs.length > 0) {
    // ── (٢أ) يبلغ الملء المستهدف؟ رتّب: أكبر fs، ثم الأقرب لـpreferredLines
    const targetHits = allPairs.filter(
      (c) => c.metrics.minFill >= targetFill
    );
    if (targetHits.length > 0) {
      const sorted = [...targetHits].sort((a, b) => {
        if (a.fs !== b.fs) return b.fs - a.fs;
        const dA = Math.abs(a.k - preferredLines);
        const dB = Math.abs(b.k - preferredLines);
        if (dA !== dB) return dA - dB;
        return b.k - a.k;
      });
      return toResult(sorted[0]!.res);
    }

    // ── (٢ب) لا يبلغ أحد الهدف. اختر k المفضّل عند كل fs، ثم الأكبر
    //         مع تطبيق قاعدة التبديل نزولاً (±6px، +15% ملء)
    const bestPerFs: FsCandidate[] = [];
    const fsSet = [...new Set(allPairs.map((c) => c.fs))].sort((a, b) => b - a);
    for (const fs of fsSet) {
      const atFs = allPairs.filter((c) => c.fs === fs);
      const preferred = pickPreferredK(atFs, preferredLines);
      bestPerFs.push({
        fs,
        k: preferred.k,
        res: preferred.res,
        metrics: preferred.metrics,
      });
    }

    let best = bestPerFs[0]!; // أكبر fs
    for (let i = 1; i < bestPerFs.length; i++) {
      const c = bestPerFs[i]!;
      if (best.fs - c.fs > swapMaxFsDiff) break;
      if (c.metrics.minFill >= best.metrics.minFill + swapMinFillGain) {
        best = c;
      }
    }
    return toResult(best.res);
  }

  // ── (٣) لا مرشّح مقبول — تراجع: أفضل ما يعطيه DP عند effectiveMinFs
  const perK = solveDPPerK(
    words,
    effectiveMinFs,
    boxW,
    shortRatio,
    maxLines,
    allBold,
    measure,
    mode
  );
  let bestFallback: SolveResult | null = null;
  for (let k = Math.max(minLines, 1); k <= maxLines; k++) {
    const r = perK[k];
    if (r && (bestFallback === null || r.totalCost < bestFallback.totalCost)) {
      bestFallback = r;
    }
  }
  if (bestFallback) return toResult(bestFallback);

  // ── (٤) توسيع ميزانية الأسطر عند effectiveMinFs كضمان الوصول
  const perKExpanded = solveDPPerK(
    words,
    effectiveMinFs,
    boxW,
    shortRatio,
    Math.max(maxLines, words.length),
    allBold,
    measure,
    mode
  );
  for (let k = 1; k < perKExpanded.length; k++) {
    if (perKExpanded[k]) return toResult(perKExpanded[k]!);
  }

  // ── (٥) الملاذ: كلمة واحدة لكل سطر
  return {
    fontSize: effectiveMinFs,
    lines: words.map((w) => [w]),
    lineHeight: Math.round(effectiveMinFs * lineHeightRatio),
    boxWidth: boxW,
  };
}
