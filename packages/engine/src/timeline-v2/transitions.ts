// timeline-v2/transitions — تنفيذ الانتقالات الخمسة بين عناصر مسار واحد.
//
// **العقد:** لكل نوع انتقال، دالة `applyTransitionFrame` تعدّل ctx لعرض
// عنصر «سابق» أو «تالٍ» بحالة الانتقال الحالية (progress ∈ [0, 1]).
// المستدعي (drawTimelineAt) يحضّر الرندر لكلا العنصرَين ويستدعي
// applyTransitionFrame داخل save/restore لكلٍّ منهما.
//
// **`progress` دلالته:**
//   • 0 = بداية الانتقال (prev كامل، next مخفي)
//   • 0.5 = المنتصف (تراكب أو تبديل جزئي)
//   • 1 = نهاية الانتقال (prev مخفي، next كامل)
//
// **الاتجاه (slide/wipe/zoom):** `rtl` = «next يدخل من اليمين» — الحركة
// من اليمين إلى اليسار داخل القماش. `ltr` = العكس. `auto` = يقرأ
// brand.direction (المستدعي يحلّه قبل الاستدعاء).
//
// **النقاء:** دوال رياضية بحتة. لا حالة، تُعطي نفس النتيجة لكل
// (type, role, progress, size, direction).

import type {
  Transition,
  TransitionDirection,
} from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/index.js';
import type { CanvasSize } from '../layers/image.js';

/** دور العنصر في الانتقال. */
export type TransitionRole = 'prev' | 'next';

/** حلّ `TransitionDirection` إلى `'rtl'` أو `'ltr'` نهائي. */
export function resolveDirection(
  d: TransitionDirection | undefined,
  brandDirection: 'rtl' | 'ltr'
): 'rtl' | 'ltr' {
  if (d === 'rtl' || d === 'ltr') return d;
  return brandDirection;
}

/**
 * يعدّل ctx (ألفا + تحويلات + قصّ) لعرض عنصر داخل انتقال. المستدعي
 * يحيط بـsave/restore. **لا يرسم بنفسه** — يجهّز فقط ctx لطبقة الرسم
 * (المؤثر التالي في item.effects، عادةً `draw-media` أو `template-layer`).
 *
 * **ملاحظة blurIn:** Canvas 2D لا يوفّر filter بشكل قياسي (skia-canvas
 * يوفّره كامتداد). للحفاظ على قابلية المتصفح، نحاكي blur بـalpha منخفض
 * مع scale خفيف (يعطي إحساس ضبابية بصرية بلا كلفة filter الفعلية).
 * التطبيق الكامل عبر filter يتم في جلسة لاحقة إن ثبت الحاجة.
 */
export function applyTransitionFrame(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  transition: Transition,
  role: TransitionRole,
  progress: number,
  direction: 'rtl' | 'ltr'
): void {
  switch (transition.type) {
    case 'crossfade':
      applyCrossfade(ctx, role, progress);
      return;
    case 'slide':
      applySlide(ctx, size, role, progress, direction);
      return;
    case 'wipe':
      applyWipe(ctx, size, role, progress, direction);
      return;
    case 'zoom':
      applyZoom(ctx, size, role, progress);
      return;
    case 'blurIn':
      applyBlurIn(ctx, size, role, progress);
      return;
  }
}

// ── crossfade — الشفافية فقط ───────────────────────

function applyCrossfade(
  ctx: CanvasDrawContext,
  role: TransitionRole,
  progress: number
): void {
  // prev: alpha 1 → 0 · next: alpha 0 → 1
  const alpha = role === 'prev' ? 1 - progress : progress;
  ctx.globalAlpha = ctx.globalAlpha * alpha;
}

// ── slide — الانزلاق الأفقي مع احترام الاتجاه ────

/**
 * slide RTL:
 *   next يدخل من اليمين (يبدأ عند x = +w، ينتهي عند x = 0).
 *   prev يخرج إلى اليسار (يبدأ عند x = 0، ينتهي عند x = -w).
 * slide LTR: عكس الاتجاه.
 */
function applySlide(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  role: TransitionRole,
  progress: number,
  direction: 'rtl' | 'ltr'
): void {
  const w = size.w;
  const sign = direction === 'rtl' ? 1 : -1; // +1: next من اليمين
  let tx: number;
  if (role === 'prev') {
    // من 0 إلى -sign × w
    tx = -sign * w * progress;
  } else {
    // من +sign × w إلى 0
    tx = sign * w * (1 - progress);
  }
  ctx.translate(tx, 0);
}

// ── wipe — القصّ من اتجاه ─────────────────────────

/**
 * wipe RTL: next يُكشف تدريجياً من اليمين (قناع يتّسع من x=w إلى x=0).
 *          prev يُخفى من اليمين (قناعه ينكمش نحو اليسار).
 * wipe LTR: عكس الاتجاه.
 *
 * التنفيذ عبر ctx.rect + ctx.clip داخل save/restore الحاضنة.
 */
function applyWipe(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  role: TransitionRole,
  progress: number,
  direction: 'rtl' | 'ltr'
): void {
  const { w, h } = size;
  let clipX: number;
  let clipW: number;
  if (direction === 'rtl') {
    // next: القناع يبدأ صغيراً من اليمين ويكبر لليسار
    // prev: القناع يبدأ كاملاً وينكمش من اليمين لليسار
    if (role === 'next') {
      clipX = w * (1 - progress);
      clipW = w * progress;
    } else {
      clipX = 0;
      clipW = w * (1 - progress);
    }
  } else {
    // LTR — عكس
    if (role === 'next') {
      clipX = 0;
      clipW = w * progress;
    } else {
      clipX = w * progress;
      clipW = w * (1 - progress);
    }
  }
  if (clipW <= 0) {
    // لا شيء يُرسم — نطبّق قناعاً فارغاً
    ctx.beginPath();
    ctx.rect(0, 0, 0, 0);
    ctx.clip();
    return;
  }
  ctx.beginPath();
  ctx.rect(clipX, 0, clipW, h);
  ctx.clip();
}

// ── zoom — التكبير/التصغير ────────────────────────

/**
 * zoom: prev يتقلّص إلى المركز (scale 1 → 0)، next يكبر من المركز (0 → 1).
 * الاتجاه لا يؤثّر — دائماً من/إلى المركز (يمكن توسيعه لاحقاً).
 * alpha يُطبَّق أيضاً لتفادي وميض الحواف عند مقاسات قصوى.
 */
function applyZoom(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  role: TransitionRole,
  progress: number
): void {
  const cx = size.w / 2;
  const cy = size.h / 2;
  let scale: number;
  let alpha: number;
  if (role === 'prev') {
    scale = 1 - progress * 0.5; // 1 → 0.5 (بلا اختفاء كامل بصرياً)
    alpha = 1 - progress;
  } else {
    scale = 0.5 + progress * 0.5; // 0.5 → 1
    alpha = progress;
  }
  ctx.globalAlpha = ctx.globalAlpha * alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}

// ── blurIn — محاكاة الضبابية بـscale خفيف + alpha ─

/**
 * blurIn: prev يبقى كامل الوضوح (alpha 1 → 0)، next يظهر بـscale خفيف
 * ينخفض من 1.05 إلى 1.0 مع alpha 0 → 1. المحاكاة تعطي إحساس «ضبابية
 * ظاهرة» بصرياً بلا كلفة filter الفعلي (غير مضمون في Canvas 2D قياسي).
 */
function applyBlurIn(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  role: TransitionRole,
  progress: number
): void {
  const cx = size.w / 2;
  const cy = size.h / 2;
  let alpha: number;
  let scale: number;
  if (role === 'prev') {
    alpha = 1 - progress;
    scale = 1;
  } else {
    alpha = progress;
    scale = 1.05 - progress * 0.05; // 1.05 → 1
  }
  ctx.globalAlpha = ctx.globalAlpha * alpha;
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
}
