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

// ── drawTextItemTypewriterRTL — حرف بحرف من اليمين ────

/**
 * يرسم كل سطور prep حرفاً-بحرف من اليمين. أدقّ من byWord — كل حرف
 * يُكشف في وقت محدد. الترتيب: السطر الأول أوّلاً (حروفه من اليمين
 * لليسار)، ثم الثاني، إلخ.
 *
 * **الكشيدة داخل الكلمة:** إن حَوَت الكلمة تطويلاً (مثل «الاســـتقبال»)،
 * الحروف الأصلية تُكشف بالترتيب مع تخطّي محارف التطويل (U+0640) —
 * محرَف التطويل يُرسم مع الحرف الذي قبله لا كخطوة مستقلة، وإلا ظهرت
 * فجوات بصرية.
 *
 * **تنفيذ:** لكل كلمة، نحسب مواضع الحروف الجزئية بقياس نصّ متزايد
 * (نصف الكلمة أوّلاً، ثم كلها…). طريقة ثقيلة لكن آمنة — الأسلوب
 * الطبيعي في محرّرات الفيديو.
 */
export function drawTextItemTypewriterRTL(
  ctx: CanvasDrawContext & CanvasFontContext,
  brand: BrandKit,
  prep: PreparedHeadline,
  localT: number,
  charStagger: number
): void {
  const measure = createCanvasMeasurer(ctx, brand);
  const rightX = prep.rightX;

  // نبني قائمة كل الحروف عبر السطور بترتيب الكشف، مع مواضعها البصرية.
  // مبسّط: نتعامل مع كل كلمة كوحدة رسم — الحروف الجزئية تُرسم بقصّ
  // النصّ إلى prefix (كلمة كاملة — عدد حروف مكشوفة).
  //
  // المؤشّر العالمي:
  //   charGlobalIdx يزداد لكل حرف (تجاهل الكشيدة داخل الكلمات).
  //   الحرف يُكشف عند localT ≥ charGlobalIdx × charStagger.
  //
  // لأن Canvas يقيس كامل النصّ لا حرفاً-بحرف بسهولة، نستعمل هذه
  // الاستراتيجية: لكل كلمة نحسب «كم حرفاً مكشوفاً» ونرسم نصّاً
  // مقصوصاً `word.slice(0, revealedChars)`.

  let charGlobalIdx = 0;
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
      // نحسب عدد الحروف الأصلية (بلا تطويل) للكلمة.
      const chars = [...tok.text];
      const originalLen = chars.filter((c) => c !== 'ـ').length;

      // كم حرفاً مكشوفاً حتى الآن؟ نحسب من charGlobalIdx وlocalT.
      const revealedTotal = charStagger > 0
        ? Math.max(0, Math.floor((localT / charStagger) - charGlobalIdx) + 1)
        : originalLen;
      const revealedInWord = Math.min(originalLen, revealedTotal);

      if (revealedInWord > 0) {
        // نبني السلسلة المكشوفة — نأخذ أول revealedInWord حرف أصلي مع
        // كل الكشيدة المصاحبة (الكشيدة تُرسم مع الحرف الذي قبلها).
        let out = '';
        let origCount = 0;
        for (const ch of chars) {
          if (ch !== 'ـ') {
            if (origCount >= revealedInWord) break;
            origCount++;
          }
          out += ch;
        }
        ctx.font = fontString(prep.fontSize, tok.bold, brand);
        ctx.fillText(out, x, y);
      }
      // نتقدّم إلى موقع الكلمة التالية باستعمال العرض الكامل (الكشف
      // يجب أن يبقى محاذياً لموضع الكلمة النهائي).
      const wFull = measure.word(tok, prep.fontSize, false);
      x -= wFull + sp;
      charGlobalIdx += originalLen;
    }
  }
}
