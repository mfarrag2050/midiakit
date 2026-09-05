// dynamic-line-height — يحسب lineHeight من الارتفاع الفعلي للسطر.
//
// **العلّة (docs/07 §3):** التشكيل يزيد الارتفاع فوق الحرف الأساسي (فتحة،
// شدّة، تنوين ضم). ارتفاع ثابت بنسبة fs (1.34 / 1.42) يترك مسافة كافية
// لخطّ عاري لكنه يسمح بتصادم علامات سطر مع الحرف الأدنى من السطر الذي فوقه
// حين يظهر التشكيل. الحلّ: قياس فعلي عبر `actualBoundingBoxAscent/Descent`،
// وجعل النسبة الثابتة **حداً أدنى** لا قيمة نهائية.
//
// **تصحيح 2026-09-04 (L-50):** `measureText` يُخفي التشكيل — يُبلّغ bounds
// الحرف الأساسي فقط، ويتجاهل combining marks (فتحة، ضمة، كسرة، …).
// التشخيص في `scripts/diagnose-measured-vs-pixel.mjs` أظهر خفاء يصل
// **31 بكسل** للتشكيل الكامل. الحلّ: عند اكتشاف tashkil، نتحوّل إلى
// `measurePixelHeight` (يرسم على قماش مؤقّت ويقرأ البكسلات). أبطأ لكن
// دقيق. النصوص بلا تشكيل تبقى على المسار السريع.
//
// **النقاء محفوظ:** الدالة تأخذ ctx كوسيط وتعيد رقماً. لا حالة عابرة.
// المستدعي (render.ts.prepareHeadline) يقرّر تطبيقها حسب
// `brand.typography.lineHeightMode`.

import type { Token } from '@pf-mediakit/shared';
import { isBreak } from '@pf-mediakit/shared';
import { hasTashkil, measurePixelHeight, type PixelHeightFactory } from './pixel-height.js';

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
  safetyPad = 0.05,
  /**
   * **L-50 fix (2026-09-04):** حين اكتشاف tashkil، `measureText` يُخفي
   * الارتفاع (13-31px). نقيس من البكسلات المرسومة. يتطلّب factory
   * لإنشاء قماش مؤقّت (skia-canvas في Node، OffscreenCanvas في المتصفح).
   * إن غاب `pixelHeightFactory`، نقع على السلوك القديم مع تحذير.
   */
  pixelHeightFactory?: PixelHeightFactory
): number {
  if (lines.length === 0) return minLineHeight;
  const previousFont = ctx.font;

  let maxLineHeight = 0;
  for (const line of lines) {
    let ascent = 0;
    let descent = 0;

    // L-50: كشف tashkil في السطر — إن وُجد ومتاح factory، قِس بكسلياً.
    const lineText = line
      .flatMap((t) => (isBreak(t) ? [] : [t.text]))
      .join(' ');
    const needsPixelMeasure = hasTashkil(lineText);

    if (needsPixelMeasure && pixelHeightFactory) {
      const fontString = `${allBold ? '700' : '400'} ${fs}px ${fontFamily}`;
      // القياس البكسلي للسطر الكامل — يكشف ذُروة التشكيل الفعلية.
      const pxH = measurePixelHeight(pixelHeightFactory, lineText, fontString);
      ascent = pxH.ascent;
      descent = pxH.descent;
    } else {
      // المسار السريع (بلا تشكيل، أو بلا factory): API فقط.
      for (const tok of line) {
        if (isBreak(tok)) continue;
        ctx.font = `${tok.bold || allBold ? '700' : '400'} ${fs}px ${fontFamily}`;
        const m = ctx.measureText(tok.text);
        const a = m.actualBoundingBoxAscent ?? 0;
        const d = m.actualBoundingBoxDescent ?? 0;
        if (a > ascent) ascent = a;
        if (d > descent) descent = d;
      }
    }

    const rawHeight = ascent + descent;
    if (rawHeight > maxLineHeight) maxLineHeight = rawHeight;
  }
  ctx.font = previousFont;

  if (maxLineHeight <= 0) return minLineHeight;
  const withPad = Math.ceil(maxLineHeight * (1 + safetyPad));
  return Math.max(minLineHeight, withPad);
}
