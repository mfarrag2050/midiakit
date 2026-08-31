// wrapAlternating — نُقل من reference/aa-media-kit.html §cvWrapTokens (1817–1843).
// التغييرات مقابل الأصل:
//   • shortRatio و lineHeightRatio (LEAD) صارا وسيطين لا ثابتين — قاعدة «صفر قيم مثبتة».
//   • measure يُمرَّر من الخارج — يستبدل cvCtx العام.
//   • fs, lines, lh أُعيدت التسمية إلى fontSize/lines/lineHeight (مواصفة 05).
//
// السلوك محفوظ حرفياً:
//   • احترام \n اليدوي: عند وجود أي BreakToken تُبنى الأسطر كما رسمها المستخدم،
//     ويُبحث عن أكبر fs تسع فيه كل السطور ضمن boxW.
//   • خلاف ذلك: التبناء بالتناوب — سطر فردي ≤ boxW، سطر زوجي ≤ boxW × shortRatio.
//   • البحث عن fs يبدأ من maxFont وينزل بخطوة 2px حتى minFont؛
//     يعيد أول fs يعطي عدد أسطر ≤ maxLines.
//   • إن لم يوجد: يعيد minFont مع البنية المُنتَجة عنده.
//
// **@deprecated** — احتفظنا بها للتوافق مع نقل الأصل ولأغراض المقارنة.
// الاستخدام الجديد ينبغي أن يمرّ عبر `wrapOptimal` (الافتراضي في
// `brand.typography.breaking.wrapMode`). الجشِعة تسمح بسطر بكلمة واحدة
// عبر `curLine.length === 0 ||` وهو نمط مرفوض في الطباعة الصحفية.

import type { Token, WrapResult } from '@pf-mediakit/shared';
import { isBreak, isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

/**
 * @deprecated استخدم `wrapOptimal` — الجشِعة تسمح بسطر كلمة واحدة
 * وهو غير مقبول طباعياً. تبقى هذه للتوافق ومقارنة الأداء فقط.
 */
export function wrapAlternating(
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
  // ── الوضع اليدوي: احترام \n حرفياً ────────────────────
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

  // ── الوضع التلقائي: بناء بالتناوب ─────────────────────
  const words: Token[] = tokens.filter(isWord);

  const build = (fs: number): Token[][] => {
    const out: Token[][] = [];
    let curLine: Token[] = [];
    let li = 0;
    const limit = (): number => (li % 2 === 0 ? boxW : boxW * shortRatio);

    for (const tk of words) {
      const test = curLine.concat(tk);
      if (curLine.length === 0 || measure.line(test, fs, allBold) <= limit()) {
        curLine = test;
      } else {
        out.push(curLine);
        curLine = [tk];
        li++;
      }
    }
    if (curLine.length > 0) out.push(curLine);
    return out;
  };

  for (let fs = maxFont; fs >= minFont; fs -= 2) {
    const lines = build(fs);
    if (lines.length <= maxLines) {
      return {
        fontSize: fs,
        lines,
        lineHeight: Math.round(fs * lineHeightRatio),
        boxWidth: boxW,
      };
    }
  }

  const lines = build(minFont);
  return {
    fontSize: minFont,
    lines,
    lineHeight: Math.round(minFont * lineHeightRatio),
    boxWidth: boxW,
  };
}
