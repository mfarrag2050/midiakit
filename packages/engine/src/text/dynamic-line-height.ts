// dynamic-line-height — يحسب lineHeight من الارتفاع الفعلي للسطر.
//
// **العلّة (docs/07 §3):** التشكيل يزيد الارتفاع فوق الحرف الأساسي (فتحة،
// شدّة، تنوين ضم). ارتفاع ثابت بنسبة fs (1.34 / 1.42) يترك مسافة كافية
// لخطّ عاري لكنه يسمح بتصادم علامات سطر مع الحرف الأدنى من السطر الذي فوقه
// حين يظهر التشكيل. الحلّ: قياس فعلي عبر `actualBoundingBoxAscent/Descent`،
// وجعل النسبة الثابتة **حداً أدنى** لا قيمة نهائية.
//
// **النقاء محفوظ:** الدالة تأخذ ctx كوسيط وتعيد رقماً. لا حالة عابرة.
// المستدعي (render.ts.prepareHeadline) يقرّر تطبيقها حسب
// `brand.typography.lineHeightMode`.

import type { Token } from '@pf-mediakit/shared';
import { isBreak } from '@pf-mediakit/shared';

/**
 * الحد الأدنى من واجهة Canvas لقياس bounding box — يتجاوز
 * `CanvasFontContext` (الذي يعيد {width} فقط) ليضيف الارتفاعات.
 * skia-canvas و`CanvasRenderingContext2D` في المتصفح كلاهما يوفّرها.
 */
export interface CanvasBoundsContext {
  font: string;
  measureText(text: string): {
    width: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
  };
}

/**
 * أعلى ارتفاع فعلي لأيّ من الأسطر — يقاس عبر التوكن الأطول ارتفاعاً في
 * كل سطر (عملياً: كل كلمة). نجمع أقصى ascent + أقصى descent لكل سطر،
 * ثم نأخذ ذُروة الأسطر (السطر الأكثف تشكيلاً يفرض المسافة).
 *
 * @param minLineHeight الحدّ الأدنى من `wrap.lineHeight` (fs × ratio).
 *   إن كان القياس أقلّ منه (نصّ بلا تشكيل)، نُبقيه — لا نضغط المسافة.
 * @param safetyPad إضافة ثابتة (نسبة من fs) لمنع التلاصق الحرفي بين
 *   قمة التشكيل وأسفل الحرف الأدنى فوقها. الافتراضي 0.05.
 */
export function measuredLineHeight(
  ctx: CanvasBoundsContext,
  lines: readonly (readonly Token[])[],
  fs: number,
  fontFamily: string,
  allBold: boolean,
  minLineHeight: number,
  safetyPad = 0.05
): number {
  if (lines.length === 0) return minLineHeight;
  const previousFont = ctx.font;

  let maxLineHeight = 0;
  for (const line of lines) {
    let ascent = 0;
    let descent = 0;
    for (const tok of line) {
      if (isBreak(tok)) continue;
      ctx.font = `${tok.bold || allBold ? '700' : '400'} ${fs}px ${fontFamily}`;
      const m = ctx.measureText(tok.text);
      const a = m.actualBoundingBoxAscent ?? 0;
      const d = m.actualBoundingBoxDescent ?? 0;
      if (a > ascent) ascent = a;
      if (d > descent) descent = d;
    }
    const rawHeight = ascent + descent;
    if (rawHeight > maxLineHeight) maxLineHeight = rawHeight;
  }
  ctx.font = previousFont;

  if (maxLineHeight <= 0) return minLineHeight;
  const withPad = Math.ceil(maxLineHeight * (1 + safetyPad));
  return Math.max(minLineHeight, withPad);
}
