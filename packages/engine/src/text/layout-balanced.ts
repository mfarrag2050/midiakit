// layoutBalanced — نُقل من reference/aa-media-kit.html §cvLayoutHeadline (1787–1801).
// التغييرات مقابل الأصل:
//   • measure يُمرَّر بدل cvCtx العام (قاعدة «المحرك خالص»).
//   • lineHeightRatio ثابت 1.34 داخل الأصل — نجعله وسيطاً (اقرأ من brand.typography.headline.lineHeight في المتصل).
//   • fs/lh أُعيدت التسمية إلى fontSize/lineHeight (مواصفة 05).
//
// السلوك محفوظ:
//   • n = 0 → لا أسطر.
//   • n = 1 → سطر واحد، والاختيار: أول fs يجعل الكلمة تسع في boxW.
//   • n ≥ 2 → لكل fs من maxFont نازلاً بخطوة 2px:
//       - نُجرّب كل قسمتين محتملتين
//       - نختار أدنى (w1 − w2) مع w1 ≥ w2 وكلاهما ≤ boxW.
//       - إن فشل، نأخذ أول قسمة صالحة (كلاهما ≤ boxW) بلا شرط توازن.
//   • تراجع أخير: minFont — بناء تسلسلي يملأ السطر الأول ثم الثاني.

import type { Token, WrapResult } from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

export function layoutBalanced(
  tokens: readonly Token[],
  boxW: number,
  maxFont: number,
  minFont: number,
  allBold: boolean,
  lineHeightRatio: number,
  measure: Measurer
): WrapResult {
  const words: Token[] = tokens.filter(isWord);
  const n = words.length;
  const lh = (fs: number): number => Math.round(fs * lineHeightRatio);

  for (let fs = maxFont; fs >= minFont; fs -= 2) {
    if (n === 0) {
      return { fontSize: fs, lines: [], lineHeight: lh(fs) };
    }

    if (n === 1) {
      // word() على WordToken آمن — الفلترة أعلاه تضمنه.
      const single = words[0]!;
      if (measure.word(single, fs, allBold) <= boxW) {
        return { fontSize: fs, lines: [[single]], lineHeight: lh(fs) };
      }
      continue;
    }

    // n ≥ 2 — نبحث عن أفضل قسمة متوازنة.
    let best: { k: number; d: number } | null = null;
    for (let k = 1; k < n; k++) {
      const l1 = words.slice(0, k);
      const l2 = words.slice(k);
      const w1 = measure.line(l1, fs, allBold);
      const w2 = measure.line(l2, fs, allBold);
      if (w1 <= boxW && w2 <= boxW && w1 >= w2) {
        const d = w1 - w2;
        if (best === null || d < best.d) best = { k, d };
      }
    }
    if (best !== null) {
      return {
        fontSize: fs,
        lines: [words.slice(0, best.k), words.slice(best.k)],
        lineHeight: lh(fs),
      };
    }

    // لا توازن ممكن — أي قسمة صالحة تنقذ الاتساع.
    for (let k = 1; k < n; k++) {
      const l1 = words.slice(0, k);
      const l2 = words.slice(k);
      if (
        measure.line(l1, fs, allBold) <= boxW &&
        measure.line(l2, fs, allBold) <= boxW
      ) {
        return { fontSize: fs, lines: [l1, l2], lineHeight: lh(fs) };
      }
    }
  }

  // تراجع أخير — كما في الأصل: عند minFont نملأ السطرين تسلسلياً.
  const fs = minFont;
  const lines: Token[][] = [[], []];
  let li: 0 | 1 = 0;
  for (const tk of words) {
    if (
      li === 0 &&
      lines[0]!.length > 0 &&
      measure.line(lines[0]!.concat(tk), fs, allBold) > boxW
    ) {
      li = 1;
    }
    lines[li]!.push(tk);
  }
  return { fontSize: fs, lines, lineHeight: lh(fs) };
}
