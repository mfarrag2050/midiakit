// timeline-v2/text-effects — رسم النصوص المستقلة على مسارات text.
//
// **الفرق عن template-headline:** أولئك يخدم قالب breaking الموروث
// (per-line stagger مع slideY، مربوط بـplan.headline الفردي). هنا نخدم
// مسارات text المتعددة في timeline-v2 — كل عنصر بنصّه، بمواضعه المحسوبة
// من prep الخاصة به، وبآلية reveal مستقلة.
//
// **المفاهيم:**
//   • `text-item-lines`: يرسم كل أسطر العنصر بلا تدرّج زمني — opacity
//     تأتي من keyframes على مستوى العنصر (تُطبَّق قبل الدخول هنا).
//   • `text-item-byWord`: يرسم كلمة بكلمة بترتيب RTL (يمين→يسار) مع
//     stagger بين الكلمات وfade لكل واحدة. يخدم القاعدة 7 في CLAUDE.md:
//     محرّك حركة عربي — الكلمة الأولى يميناً تظهر أولاً.
//
// **ثبات الكشيدة عبر الإطارات:** التطويل مطبَّق في `prep.linesJustified`
// (خرج justifyLine داخل prepareHeadline)، والذي يُحسب مرة في
// buildTimelinePlan. drawTimelineAt يستهلك هذه القيم الجاهزة — بلا
// إعادة حساب في الحلقة. الكشيدة لكل كلمة ثابتة عبر كل الإطارات.

import type { BrandKit, Token } from '@pf-mediakit/shared';
import { isBreak, isWord } from '@pf-mediakit/shared';
import type { PreparedHeadline } from '../render.js';
import type { CanvasDrawContext, CanvasFontContext } from '../text/index.js';
import { createCanvasMeasurer } from '../text/index.js';

// ── سلاسل الخط ─────────────────────────────────────────

const familyOf = (brand: BrandKit): string =>
  `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;

const fontString = (fs: number, bold: boolean, brand: BrandKit): string =>
  `${bold ? '700' : '400'} ${fs}px ${familyOf(brand)}`;

// ── drawTextItemLines — كل السطور، بلا تدرّج ────────

/**
 * يرسم كل سطور PreparedHeadline بموضعها الأصلي. opacity/translate تأتي
 * من ctx.globalAlpha و transforms التي يتحمّلها المستدعي — هذه الدالة
 * ترسم فقط. تكرار مع `justifyLine` أصلاً غير مطلوب — نستهلك ما في prep.
 */
export function drawTextItemLines(
  ctx: CanvasDrawContext & CanvasFontContext,
  brand: BrandKit,
  prep: PreparedHeadline
): void {
  const measure = createCanvasMeasurer(ctx, brand);
  const rightX = prep.rightX;

  for (let li = 0; li < prep.linesJustified.length; li++) {
    const line = prep.linesJustified[li]!;
    const y = prep.firstBaseline + li * prep.lineHeight;
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = brand.colors.text;

    let x = rightX;
    const sp = measure.space(prep.fontSize);
    for (const tok of line) {
      if (isBreak(tok)) continue;
      ctx.font = fontString(prep.fontSize, tok.bold, brand);
      ctx.fillText(tok.text, x, y);
      const w = measure.word(tok, prep.fontSize, false);
      x -= w + sp;
    }
  }
}

// ── drawTextItemByWordRTL — كلمة بكلمة من اليمين ────

/**
 * يرسم كل سطور prep كلمة-بكلمة من اليمين، بتدرّج زمني.
 *
 * **الترتيب:** السطر الأوّل أوّلاً (كلماته من اليمين لليسار)، ثم السطر
 * الثاني (كلماته من اليمين لليسار)، إلخ. **مؤشّر الكلمة العالمي** يمرّ
 * أفقياً ثم رأسياً — الكلمة رقم N تظهر عند t = N × stagger.
 *
 * **`ctx.globalAlpha` عند الدخول:** يُحتَرَم — كل ألفا الكلمة يُضرَب فيه،
 * فأي بهتان على مستوى العنصر (من keyframes) يبقى ساري.
 */
export function drawTextItemByWordRTL(
  ctx: CanvasDrawContext & CanvasFontContext,
  brand: BrandKit,
  prep: PreparedHeadline,
  localT: number,
  stagger: number,
  fadeDuration: number
): void {
  const measure = createCanvasMeasurer(ctx, brand);
  const rightX = prep.rightX;
  const baseAlpha = ctx.globalAlpha;

  let wordGlobalIdx = 0;
  for (let li = 0; li < prep.linesJustified.length; li++) {
    const line = prep.linesJustified[li]!;
    const y = prep.firstBaseline + li * prep.lineHeight;
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = brand.colors.text;

    let x = rightX;
    const sp = measure.space(prep.fontSize);
    for (const tok of line) {
      if (isBreak(tok) || !isWord(tok)) continue;
      const wordStart = wordGlobalIdx * stagger;
      const progress = fadeDuration > 0
        ? Math.min(1, Math.max(0, (localT - wordStart) / fadeDuration))
        : (localT >= wordStart ? 1 : 0);

      if (progress > 0) {
        ctx.globalAlpha = baseAlpha * progress;
        ctx.font = fontString(prep.fontSize, tok.bold, brand);
        ctx.fillText(tok.text, x, y);
      }

      const w = measure.word(tok, prep.fontSize, false);
      x -= w + sp;
      wordGlobalIdx++;
    }
  }

  // استعادة ألفا القاعدي — المستدعي يتوقّع أن يجده كما كان.
  ctx.globalAlpha = baseAlpha;
}

/** عدد الكلمات الكلي في prep — للحساب المسبق لمدة reveal الكاملة. */
export function totalWordCount(prep: PreparedHeadline): number {
  let n = 0;
  for (const line of prep.linesJustified) {
    for (const tok of line) if (isWord(tok as Token)) n++;
  }
  return n;
}
