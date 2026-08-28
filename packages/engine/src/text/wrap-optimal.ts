// wrapOptimal — لف سطور بالبرمجة الديناميكية على نمط هرمي بديل.
//
// **الغرض:** يُنتج تقسيماً *أمثلياً* للسطور بأقل كلفة إجمالية، بديلاً
// عن `wrapAlternating` الجشِعة (نقل حرفي للأصل — كانت تسمح صراحة بسطر
// بكلمة واحدة عبر `!cur.length ||`).
//
// **المنهج:**
//   1) لكل حجم خط `fs` من `maxFont` نزولاً إلى `minFont` بخطوة 2:
//      نبني جدول `dp[i][k]` = أقل كلفة لتقسيم أول `i` كلمة إلى `k` سطر.
//      إن وُجد `k ≤ maxLines` بكلفة منتهية، نُرجع أفضل تقسيم لذلك `fs`.
//   2) لم ينجح أي `fs`؟ نتراجع إلى `minFont` بميزانية أسطر موسّعة (حتى
//      عدد الكلمات) — دائماً قابل للتحقيق طالما أضخم كلمة ≤ `boxW`.
//
// **دالة الكلفة** — عناصر تُجمَع خطياً:
//   • انحراف تربيعي عن حدّ السطر (يدفع نحو ملء السطر لحدّه)
//   • عقوبة سطر بكلمة واحدة (ثقيلة، ليست مانعة — يستطيع DP اختيارها
//     لو كانت الكلمة أعرض من حدّ السطر التالي وحدها)
//   • عقوبة سطر أخير يتيم (كلمة واحدة أو ملء أقل من 40%)
//   • عقوبة تفاوت غير منتظم: سطر زوجي (قصير) أعرض من سابقه الفردي
//     يكسر النمط الهرمي
//   • تجاوز `maxLines` مانع خلال البحث الأمثلي (يظهر التراجع لاحقاً)
//
// **النمط الهرمي محفوظ:** سطر بفهرس زوجي (0،2،4…) حدّه `boxW`،
// وسطر فردي (1،3،5…) حدّه `boxW × shortRatio`. القاعدة ذاتها في
// `wrapAlternating` — الفرق أن DP يوزّع الكلمات ليقترب من الحدّين معاً
// بدل الالتصاق بأول تقسيم يعمل.

import type { Token, WrapResult } from '@pf-mediakit/shared';
import { isBreak, isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

// ── أوزان دالة الكلفة (قابلة للضبط لاحقاً من الهوية) ─────
//
// الأرقام نسبية — القيمة المطلقة لا تهم، فقط ترتيب الأحجام:
//   انحراف كامل (سطر فارغ) = 100
//   سطر بكلمة واحدة        = 800  (8× الانحراف الأقصى)
//   يتيم أخير              = 1600 (16× — أشد ما نتجنّبه)
//   خرق الهرم (زوجي > فردي) = 400
const W_UNDERFILL = 100;
const W_SINGLE_WORD = 800;
const W_ORPHAN = 1600;
const W_PYRAMID_BREAK = 400;
const ORPHAN_FILL_THRESHOLD = 0.4;

const INF = Number.POSITIVE_INFINITY;

interface Cell {
  total: number;
  prevJ: number;
  lineWidth: number;
}

function lineLimit(lineIdx: number, boxW: number, shortRatio: number): number {
  return lineIdx % 2 === 0 ? boxW : boxW * shortRatio;
}

function costOfLine(params: {
  width: number;
  limit: number;
  wordCount: number;
  isLast: boolean;
  lineIdx: number;
  prevLineWidth: number;
  prevLimit: number;
}): number {
  const { width, limit, wordCount, isLast, lineIdx, prevLineWidth, prevLimit } =
    params;

  const fillRatio = width / limit;
  const underfill = Math.max(0, 1 - fillRatio);
  let cost = underfill * underfill * W_UNDERFILL;

  if (wordCount === 1) cost += W_SINGLE_WORD;

  if (isLast) {
    if (wordCount === 1 || fillRatio < ORPHAN_FILL_THRESHOLD) {
      cost += W_ORPHAN;
    }
  }

  // خرق الهرم: سطر زوجي (قصير) أعرض من سابقه الفردي (طويل).
  // الشرط lineIdx > 0 يستثني السطر الأول، والفهرس الفردي = خانة قصيرة
  // في النمط (limit أصغر). النمط يقتضي: طويل ≥ قصير + هامش.
  if (lineIdx > 0 && lineIdx % 2 === 1) {
    // limit الحالي < prevLimit (طويل)، لكن العرض الفعلي قد يقلب ذلك
    if (width > prevLineWidth) {
      const excess = (width - prevLineWidth) / limit;
      cost += excess * excess * W_PYRAMID_BREAK;
    }
  }

  // مرجع صامت — نمرّر prevLimit لكيلا يشتكي المصنّف من متغير غير مستعمل،
  // وقد يفيد في تعديلات لاحقة (مثل عقوبة تسلسلي فارغ).
  void prevLimit;

  return cost;
}

interface SolveResult {
  fontSize: number;
  lines: Token[][];
  totalCost: number;
}

function solveDP(
  words: readonly Token[],
  fs: number,
  boxW: number,
  shortRatio: number,
  maxLines: number,
  allBold: boolean,
  measure: Measurer
): SolveResult | null {
  const n = words.length;
  if (n === 0) {
    return { fontSize: fs, lines: [], totalCost: 0 };
  }

  // dp[i][k] = أفضل حالة لتقسيم أول i كلمة إلى k سطر
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
    const limit = lineLimit(lineIdx, boxW, shortRatio);
    const prevLimit =
      k >= 2 ? lineLimit(lineIdx - 1, boxW, shortRatio) : boxW;

    for (let i = 1; i <= n; i++) {
      let best = dp[i]![k]!;
      for (let j = 0; j < i; j++) {
        const prev = dp[j]![k - 1]!;
        if (prev.total === INF) continue;
        const slice = words.slice(j, i);
        const w = measure.line(slice, fs, allBold);
        if (w > limit) continue; // قيد صلب

        const isLast = i === n; // مؤقتاً — سنُصححها بعد اختيار k النهائي
        const c = costOfLine({
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

  // اختر k بأقل كلفة إجمالية عند i = n
  let bestK = -1;
  let bestTotal = INF;
  for (let k = 1; k <= maxLines; k++) {
    const cell = dp[n]![k]!;
    if (cell.total < bestTotal) {
      bestTotal = cell.total;
      bestK = k;
    }
  }
  if (bestK < 0 || bestTotal === INF) return null;

  // استعادة الأسطر بالسير عكسياً
  const linesReversed: Token[][] = [];
  let i = n;
  let k = bestK;
  while (k > 0) {
    const cell = dp[i]![k]!;
    const j = cell.prevJ;
    linesReversed.push(words.slice(j, i));
    i = j;
    k--;
  }
  const lines = linesReversed.reverse();
  return { fontSize: fs, lines, totalCost: bestTotal };
}

/**
 * لف الأسطر بالبرمجة الديناميكية — الأسلوب الافتراضي.
 *
 * توقيع مطابق لـ `wrapAlternating` — قابل للتبديل مباشرة.
 * يحترم `\n` اليدوي بنفس طريقة الجشِع (بحث عن أكبر `fs` يسع كل السطور).
 *
 * @param tokens الكلمات + فواصل السطور اليدوية
 * @param boxW عرض السطر الطويل (فردي 0،2،4…)
 * @param maxFont أكبر حجم يُجرَّب
 * @param minFont أصغر حجم مسموح
 * @param allBold إجبار جميع الكلمات على وزن عريض
 * @param maxLines سقف الأسطر خلال البحث الأمثلي (يُوسَّع عند الحاجة تراجعاً)
 * @param shortRatio نسبة السطر القصير (زوجي 1،3،5…) من `boxW`
 * @param lineHeightRatio نسبة ارتفاع السطر إلى `fs`
 * @param measure واجهة القياس المحقونة
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
  measure: Measurer
): WrapResult {
  // ── الوضع اليدوي: احترام \n (نفس منطق wrapAlternating) ───
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
        };
      }
    }
    return {
      fontSize: minFont,
      lines,
      lineHeight: Math.round(minFont * lineHeightRatio),
    };
  }

  const words: Token[] = tokens.filter(isWord);
  if (words.length === 0) {
    return {
      fontSize: maxFont,
      lines: [],
      lineHeight: Math.round(maxFont * lineHeightRatio),
    };
  }

  // حالة عائدة: كلمة واحدة (لا اختيار طباعياً — تُرجَع كما هي بأكبر خط يسع)
  if (words.length === 1) {
    for (let fs = maxFont; fs >= minFont; fs -= 2) {
      if (measure.line(words, fs, allBold) <= boxW) {
        return {
          fontSize: fs,
          lines: [words],
          lineHeight: Math.round(fs * lineHeightRatio),
        };
      }
    }
    return {
      fontSize: minFont,
      lines: [words],
      lineHeight: Math.round(minFont * lineHeightRatio),
    };
  }

  // ── معيار النظافة الطباعية ───────────────────────────
  // «نظيف» = لا سطر بكلمة واحدة، السطر الأخير ليس يتيماً،
  // وكل الأسطر غير الأخيرة فِيلها ≥ MIN_FILL_NONLAST (≈ ±30% من الحدّ).
  // يُقارَب بذلك هدف المستخدم «±15% من الحد المستهدف» — لكن نتساهل
  // 30% كي لا يفشل النصّ القصير الذي لا يبلغ ملء الحدّ في أي حجم.
  const MIN_FILL_NONLAST = 0.7;
  const MIN_FILL_LAST = 0.4;

  const isTypographicallyClean = (
    res: SolveResult,
    fs: number
  ): boolean => {
    const n = res.lines.length;
    for (let i = 0; i < n; i++) {
      const line = res.lines[i]!;
      if (line.length === 1) return false;
      const w = measure.line(line, fs, allBold);
      const limit = lineLimit(i, boxW, shortRatio);
      const fill = w / limit;
      const isLast = i === n - 1;
      const floor = isLast ? MIN_FILL_LAST : MIN_FILL_NONLAST;
      if (fill < floor) return false;
    }
    return true;
  };

  // ── البحث الأمثلي: من الأكبر إلى الأصغر ─────────────
  // نمسك أفضل حلّ نظيف (أكبر fs يعطي نظافة) — أفضل من مجرد أول حلّ ممكن.
  // في الوقت نفسه نمسك أفضل حلّ بالكلفة كتراجع لو لم يوجد نظيف أبداً.
  let bestClean: SolveResult | null = null;
  let bestByCost: SolveResult | null = null;

  for (let fs = maxFont; fs >= minFont; fs -= 2) {
    const res = solveDP(words, fs, boxW, shortRatio, maxLines, allBold, measure);
    if (res === null) continue;

    if (bestByCost === null || res.totalCost < bestByCost.totalCost) {
      bestByCost = res;
    }

    if (isTypographicallyClean(res, fs)) {
      // أكبر fs نظيف يفوز — نتوقّف عند أول نظافة نصادفها
      bestClean = res;
      break;
    }
  }

  if (bestClean !== null) {
    return {
      fontSize: bestClean.fontSize,
      lines: bestClean.lines,
      lineHeight: Math.round(bestClean.fontSize * lineHeightRatio),
    };
  }

  if (bestByCost !== null) {
    return {
      fontSize: bestByCost.fontSize,
      lines: bestByCost.lines,
      lineHeight: Math.round(bestByCost.fontSize * lineHeightRatio),
    };
  }

  // ── تراجع: عند minFont، وسّع ميزانية الأسطر إلى n ─────
  // (كل كلمة على سطرها ضمانة نظرية طالما أضخم كلمة ≤ boxW)
  const fallback = solveDP(
    words,
    minFont,
    boxW,
    shortRatio,
    Math.max(maxLines, words.length),
    allBold,
    measure
  );
  if (fallback !== null) {
    return {
      fontSize: minFont,
      lines: fallback.lines,
      lineHeight: Math.round(minFont * lineHeightRatio),
    };
  }

  // ── تراجع أخير: كل كلمة سطراً منفصلاً ────────────────
  // نصل هنا فقط لو كلمة أعرض من boxW عند minFont — خط أو حجم غير صالحين.
  return {
    fontSize: minFont,
    lines: words.map((w) => [w]),
    lineHeight: Math.round(minFont * lineHeightRatio),
  };
}
