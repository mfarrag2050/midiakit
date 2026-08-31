// drawAt — دالة خالصة من الزمن إلى إطار. **العماد المعماري لـADR-004**:
// لا حالة متراكمة بين الاستدعاءات. `drawAt(t=1.4)` بعد `drawAt(t=5.7)`
// **يجب** أن يعطي نفس نتيجة `drawAt(t=1.4)` معزولاً.
//
// **البنية:**
//   1. تحضير prep للـheadline مرة واحدة (يحتاج ctx للقياس) — يعطي
//      عدد الأسطر لحساب توقيت `after: "headline"` للمصدر.
//   2. parse animations إلى خريطة (target → ResolvedAnimation).
//   3. لكل طبقة في `template.layers` بالترتيب:
//      - احسب alpha و slideY و pulse-scale عند الزمن t.
//      - إن كانت headline مع stagger: ارسم كل سطر بتحريكه المستقل.
//      - غير ذلك: `executeLayer` مع ctx.save/restore + globalAlpha + translate.
//   4. outro: تراكب أسود بشفافية متزايدة عند نهاية المدة.

import type { Template } from '@pf-mediakit/templates';
import type { BrandKit } from '@pf-mediakit/shared';

import type {
  CanvasDrawContext,
  CanvasFontContext,
  ImageLike,
} from '../text/index.js';
import type { CanvasSize, ImageCrop } from '../layers/image.js';
import {
  executeLayer,
  drawHeadlineLine,
  type RenderFrameArgs,
  type RenderState,
  type PreparedHeadline,
  type AccentSpanBounds,
} from '../render.js';
import { buildRenderPlan, type RenderPlan } from '../render-plan.js';

import { getEasingFn } from './easing.js';
import type { ResolvedAnimation, Timeline } from './timeline.js';

export interface DrawAtArgs {
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  readonly size: CanvasSize;
  readonly template: Template;
  readonly brand: BrandKit;
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets?: {
    readonly images?: Readonly<Record<string, ImageLike>>;
    readonly imageCrops?: Readonly<Record<string, ImageCrop>>;
  };
  /** الزمن بالثواني — 0 هو أول إطار. */
  readonly t: number;
  /**
   * اختياري: `RenderPlan` مبنية مسبقاً (`buildRenderPlan`). عند تمريرها،
   * drawAt يتخطّى إعادة حساب wrap/justify/animations/timeline — يستهلك
   * القيم الجاهزة. **بلا كسر للنقاء:** الخطة مُشتقّة من نفس المدخلات،
   * تُمرَّر كوسيط. حين تُحذف الخطة، drawAt يبنيها داخلياً (المسار
   * القديم — مطلوب للتوافق ولـpreview.mjs).
   */
  readonly plan?: RenderPlan;
  /** @deprecated استعمل `plan.timeline` — يبقى كتراجع صامت. */
  readonly timeline?: Timeline;
}

// ── حسابات التحريك ────────────────────────────────────

interface LayerAnimState {
  /** شفافية الطبقة عند الزمن t (0–1). */
  readonly alpha: number;
  /** إزاحة رأسية (بكسل) عند الزمن t — للـslideY. */
  readonly translateY: number;
  /** عامل تكبير للنبض عند الزمن t (1 = بلا تكبير). */
  readonly pulseScale: number;
  /** true إن الطبقة لم تبدأ بعد (خارج مسار الرسم). */
  readonly notStarted: boolean;
}

function computeLayerAnim(
  anim: ResolvedAnimation | undefined,
  t: number,
  brand: BrandKit
): LayerAnimState {
  if (!anim) {
    return { alpha: 1, translateY: 0, pulseScale: 1, notStarted: false };
  }
  if (t < anim.startAt) {
    return { alpha: 0, translateY: 0, pulseScale: 1, notStarted: true };
  }
  const localT = t - anim.startAt;
  const easing = getEasingFn('easeOutCubic');
  const progress = anim.fade > 0 ? Math.min(1, localT / anim.fade) : 1;
  const eased = easing(progress);
  const alpha = eased;
  const translateY = anim.slideY * (1 - eased);

  // Pulse: نبضة قصيرة (0.15s بعد البدء) — scale من 1→1+badgePulse→1
  let pulseScale = 1;
  if (anim.pulse) {
    const pulseDur = 0.15;
    if (localT < pulseDur) {
      const p = localT / pulseDur;
      // ذروة عند p=0.5، عودة إلى 1 عند p=1
      const bell = Math.sin(p * Math.PI); // 0→1→0
      pulseScale = 1 + brand.motion.badgePulse * bell;
    }
  }

  return { alpha, translateY, pulseScale, notStarted: false };
}

// ── رسم headline بتحريك per-line ──────────────────────

function drawHeadlineAnimated(
  prep: PreparedHeadline,
  args: DrawAtArgs,
  anim: ResolvedAnimation | undefined,
  state: RenderState
): void {
  const accentSpans: AccentSpanBounds[] = [];
  if (!anim || anim.stagger === 0) {
    // بلا stagger: طبقة كاملة بشفافية موحّدة (يحسبها المستدعي بـsave/restore).
    for (let i = 0; i < prep.linesJustified.length; i++) {
      const span = drawHeadlineLine(args.ctx, args.brand, prep, i);
      if (span) accentSpans.push(span);
    }
    state.headlineAccentSpans = accentSpans;
    return;
  }

  // stagger: كل سطر يبدأ بعد `stagger` من الذي قبله. نستعمل ctx.save
  // لعزل alpha و translate بين السطور.
  const easing = getEasingFn('easeOutCubic');
  for (let i = 0; i < prep.linesJustified.length; i++) {
    const lineStart = anim.startAt + i * anim.stagger;
    if (args.t < lineStart) continue; // السطر لم يبدأ
    const localT = args.t - lineStart;
    const progress = anim.fade > 0 ? Math.min(1, localT / anim.fade) : 1;
    const eased = easing(progress);
    const alpha = eased;
    const dy = anim.slideY * (1 - eased);

    args.ctx.save();
    args.ctx.globalAlpha = args.ctx.globalAlpha * alpha;
    if (dy !== 0) args.ctx.translate(0, dy);
    const span = drawHeadlineLine(args.ctx, args.brand, prep, i);
    args.ctx.restore();
    if (span) accentSpans.push(span);
  }
  state.headlineAccentSpans = accentSpans;
}

// ── الواجهة الأساسية ─────────────────────────────────

/**
 * يرسم إطاراً من `template` عند الزمن `t`. **دالة خالصة** — لا حالة
 * محفوظة بين الاستدعاءات في وحدة التصدير. المستدعي يمسح `ctx` قبل
 * الاستدعاء (fillRect بالخلفية).
 */
export function drawAt(args: DrawAtArgs): void {
  const { ctx, size, template, brand, content, assets, t } = args;

  // 1) الخطة: مُمرَّرة أم تُبنى؟ البناء الداخلي يبقى للتوافق
  //    (preview.mjs، اختبار النقاء). في مسار الفيديو، المستدعي يبنيها مرة
  //    قبل الحلقة ويمرّرها هنا — هو الأثر الجوهري للأداء.
  const plan: RenderPlan =
    args.plan ??
    buildRenderPlan({
      ctx,
      size,
      template,
      brand,
      content,
      ...(assets && { assets }),
    });

  const state: RenderState = {};
  const asRenderFrameArgs: RenderFrameArgs = {
    ctx,
    size,
    template,
    brand,
    content,
    ...(assets && { assets }),
  };

  const prep = plan.headline;
  if (prep) state.headline = prep.bounds;

  const anims = plan.animations;
  const timeline = plan.timeline;

  // 2) رسم الطبقات بالترتيب
  for (const layer of template.layers) {
    const anim = anims[layer.type];
    const lstate = computeLayerAnim(anim, t, brand);
    if (lstate.notStarted) continue;
    if (lstate.alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * lstate.alpha;

    if (layer.type === 'headline' && prep) {
      // إعادة الشفافية الأصلية داخل headline — كل سطر يديرها بنفسه
      // (drawHeadlineAnimated يحسب alpha per-line).
      ctx.globalAlpha = ctx.globalAlpha / lstate.alpha;
      drawHeadlineAnimated(prep, args, anim, state);
    } else {
      if (lstate.translateY !== 0) ctx.translate(0, lstate.translateY);
      if (lstate.pulseScale !== 1) {
        // scale حول مركز الطبقة — للنبضة، نطبّقها حول مركز canvas تقريباً
        // (المركز الدقيق للشارة يتطلّب علم بحدودها — للـMVP كافٍ).
        ctx.translate(size.w / 2, size.h / 2);
        ctx.scale(lstate.pulseScale, lstate.pulseScale);
        ctx.translate(-size.w / 2, -size.h / 2);
      }
      executeLayer(layer, asRenderFrameArgs, state);
    }
    ctx.restore();
  }

  // 4) outro: تلاشٍ إلى الأسود عند نهاية المدة.
  const outroStart = timeline.duration - timeline.outro;
  if (t > outroStart && timeline.outro > 0) {
    const outroAlpha = Math.min(1, (t - outroStart) / timeline.outro);
    ctx.save();
    ctx.globalAlpha = outroAlpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.restore();
  }
}
