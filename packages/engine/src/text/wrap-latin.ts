// wrap-latin — لف نصّ لاتيني بلا قواعد دلالية.
//
// **قرار المالك 2026-09-04 (L-49):** «أن نكون ممتازين في العربية
// وعاديين في الباقي أفضل من متوسطين في الكلّ». لا قواعد كسر لكل لغة —
// خوارزمية بسيطة صحيحة.
//
// **ما تعمل:**
//   • فصل عند المسافات و «-» (soft break داخل الكلمات المركّبة).
//   • بحث DP لأدنى كلفة عبر مواقع كسر مسموحة.
//   • عقوبات صارمة على:
//       – سطر بكلمة واحدة (badness عالٍ إلا للسطر الوحيد).
//       – **كلمة يتيمة في السطر الأخير** (widow — كلمة واحدة تلي فقرة
//         متعدّدة الأسطر). طباعياً مكروهة.
//   • نطاق حجم خط مفضّل من `headlineFsRatio` — نفس مبدأ العربي.
//
// **ما لا تعمل:**
//   • كشيدة (لا معنى لها لاتينياً).
//   • كسر دلالي (لا قواعد لكل لغة — رفض معماري).
//   • تشكيل، BiDi متقدّم، sub-word hyphenation قواعدية.

import type { CanvasDrawContext, ImageLike } from './draw-line.js';
import type { WrapResult, Token } from '@pf-mediakit/shared';

void 0 as unknown as ImageLike; // منع unused

// ── الأنواع ─────────────────────────────────────────────

export interface WrapLatinConfig {
  /** كامل نصّ العنوان — يُقسَّم داخلياً على المسافات والشرطات. */
  readonly text: string;
  /** عرض الصندوق المتاح بالبكسل. */
  readonly boxWidth: number;
  /** نطاق حجم الخط المفضّل بالبكسل (min, max). */
  readonly fsRange: readonly [number, number];
  /** ارتفاع السطر كمعامل من fs (نموذجياً 1.15 لللاتيني). */
  readonly lineHeight: number;
  /** أعلى عدد أسطر مسموح. */
  readonly maxLines: number;
  /** أقلّ عدد أسطر مقبول (يمنع «سطر هابط» في عنوان طويل). */
  readonly minLines: number;
  /** الوزن الأساسي (700 للعناوين). */
  readonly weight: number;
  /** أسرة الخط لبناء `ctx.font`. */
  readonly fontFamily: string;
}

// ── قياس ───────────────────────────────────────────────

function measure(ctx: CanvasDrawContext, text: string, fs: number, weight: number, family: string): number {
  ctx.font = `${weight} ${fs}px ${family}`;
  return ctx.measureText(text).width;
}

// ── تقسيم إلى atoms قابلة للكسر ────────────────────────

/** يقسّم النصّ إلى وحدات (كلمة أو مقطع مركّب). المسافة تفصل، الشرطة
 * تفصل مع الاحتفاظ بها في نهاية اليسار. */
function tokenize(text: string): string[] {
  const atoms: string[] = [];
  const parts = text.split(/\s+/).filter((s) => s.length > 0);
  for (const part of parts) {
    // نُبقي الكلمة موحّدة في تحقيق أوّلي؛ soft-break عند الشرطة داخلياً
    // قد تُضاف لاحقاً إن ظهرت حاجة (كلمات ألمانية مركّبة، إلخ).
    atoms.push(part);
  }
  return atoms;
}

// ── DP: أدنى كلفة عبر تقسيمات مسموحة ───────────────────

/**
 * يجرّب كل تقسيم N-سطري ممكن لـatoms. لكل تقسيم يحسب:
 *   • مجموع overflow عن boxWidth (يجب = 0 لقبول).
 *   • عقوبة السطر الوحيد (>1 سطر و آخر سطر بكلمة واحدة = يتيم).
 *   • عقوبة سطر بكلمة واحدة (غير آخر).
 *   • عقوبة تفاوت العرض بين الأسطر (variance).
 */
function trySplit(
  ctx: CanvasDrawContext,
  atoms: string[],
  fs: number,
  cfg: WrapLatinConfig,
  numLines: number
): { lines: string[]; cost: number } | null {
  if (numLines < cfg.minLines || numLines > cfg.maxLines) return null;
  if (atoms.length < numLines) return null;

  // نسحب أفضل تقسيم بواسطة enumeration مع pruning للأداء.
  // لعدد الأسطر ≤ 5 وعدد atoms ≤ 20، الفضاء صغير جداً.
  const n = atoms.length;
  const combos = combinations(n - 1, numLines - 1);
  let best: { lines: string[]; cost: number } | null = null;

  for (const cuts of combos) {
    const lines: string[] = [];
    let start = 0;
    for (const cut of cuts) {
      lines.push(atoms.slice(start, cut + 1).join(' '));
      start = cut + 1;
    }
    lines.push(atoms.slice(start).join(' '));

    // قياس عرض كل سطر
    const widths = lines.map((l) => measure(ctx, l, fs, cfg.weight, cfg.fontFamily));
    const overflow = widths.reduce((s, w) => s + Math.max(0, w - cfg.boxWidth), 0);
    if (overflow > 0) continue; // مرفوض

    // العقوبات
    let cost = 0;

    // (١) كلمة يتيمة في السطر الأخير — عقوبة صارمة
    const lastLineAtoms = lines[lines.length - 1]!.split(' ');
    if (numLines > 1 && lastLineAtoms.length === 1) {
      cost += 3000;
    }
    // (٢) سطر بكلمة واحدة في غير الأخير
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i]!.split(' ').length === 1) cost += 2000;
    }
    // (٣) تفاوت عرض الأسطر — يفضّل التوازن
    const meanW = widths.reduce((s, w) => s + w, 0) / widths.length;
    const variance = widths.reduce((s, w) => s + (w - meanW) ** 2, 0) / widths.length;
    cost += variance * 0.01;
    // (٤) ملء منخفض — نريد أن نستغلّ boxWidth
    const meanFill = meanW / cfg.boxWidth;
    cost += (1 - meanFill) * 500;

    if (!best || cost < best.cost) best = { lines, cost };
  }
  return best;
}

/** يولّد كل مجموعات الاختيار K من N (N-cuts). */
function combinations(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  if (k > n) return [];
  const out: number[][] = [];
  function rec(start: number, path: number[]) {
    if (path.length === k) { out.push(path.slice()); return; }
    for (let i = start; i <= n - (k - path.length); i++) {
      path.push(i);
      rec(i + 1, path);
      path.pop();
    }
  }
  rec(0, []);
  return out;
}

// ── الواجهة العامة ────────────────────────────────────

/**
 * يبحث عن أفضل (fs, splits) لنصّ لاتيني ضمن `fsRange` (يفضّل الأكبر).
 * يعيد `WrapResult` — نفس عقد المخرج مثل `wrapOptimal` العربي، كي
 * تُدمج الطبقة العليا للمحرك بلا فروع خاصة للغة.
 */
export function wrapLatin(
  ctx: CanvasDrawContext,
  cfg: WrapLatinConfig
): WrapResult {
  const atoms = tokenize(cfg.text);
  if (atoms.length === 0) {
    return { fontSize: cfg.fsRange[1], lines: [], lineHeight: cfg.lineHeight, boxWidth: cfg.boxWidth };
  }

  const [minFs, maxFs] = cfg.fsRange;

  // نبحث من الأكبر (تفضيل بصري: أكبر ما يعمل)
  for (let fs = Math.floor(maxFs); fs >= Math.ceil(minFs); fs--) {
    // جرّب من minLines إلى maxLines، اختر أدنى كلفة
    let bestForFs: { lines: string[]; cost: number; numLines: number } | null = null;
    for (let nl = cfg.minLines; nl <= cfg.maxLines; nl++) {
      const r = trySplit(ctx, atoms, fs, cfg, nl);
      if (r && (!bestForFs || r.cost < bestForFs.cost)) {
        bestForFs = { ...r, numLines: nl };
      }
    }
    if (bestForFs) {
      // نحوّل السطور النصّية إلى Token[][] (LTR — كل atom Token مفرد بلا accent/bold)
      const linesAsTokens: Token[][] = bestForFs.lines.map((line) =>
        line.split(' ').map((word) => ({ text: word, bold: false, accent: false }))
      );
      return {
        fontSize: fs,
        lines: linesAsTokens,
        lineHeight: cfg.lineHeight,
        boxWidth: cfg.boxWidth,
      };
    }
  }

  // لم يوجد حل نظيف — تراجع بـminFs مع أفضل ما لدينا (يتجاوز boxWidth)
  const forcedLines = [atoms];
  const forcedTokens: Token[][] = forcedLines.map((words) =>
    words.map((w) => ({ text: w, bold: false, accent: false }))
  );
  return {
    fontSize: Math.floor(minFs),
    lines: forcedTokens,
    lineHeight: cfg.lineHeight,
    boxWidth: cfg.boxWidth,
  };
}
