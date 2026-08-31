// render-plan — يحسب كل ما لا يتغيّر عبر الزمن **مرة واحدة**.
//
// **السبب:** حلقة الفيديو تستدعي wrapOptimal + justifyLine + parseAnimations
// لكل إطار، رغم أن العنوان لا يتغيّر — 730ms/إطار (99.5% من زمن الرندر)
// تُهدر على إعادة حساب نفس النتيجة. القياس أثبت هذا (2026-08-31).
//
// **العقد:**
//   buildRenderPlan({ctx, size, template, brand, content, assets?, fps?})
//     → RenderPlan (قيمة خالصة، Canvas-independent).
//   drawAt يقبل plan؛ حين يُمرَّر، يتخطّى prepareHeadline و parseAnimations
//   و timelineOf ويستهلك الجاهز.
//
// **النقاء محفوظ:** الخطة تُشتقّ من نفس المدخلات وتُمرَّر كوسيط.
// لا تُخزَّن في وحدة، لا تتراكم بين استدعاءات drawAt. اختبار النقاء
// الزمني يبقى أخضر لأنه لا يمرّر plan (يبنيه drawAt داخلياً) — النتيجة
// حتمية إن مُرِّر أو لم يُمرَّر.

import type { BrandKit } from '@pf-mediakit/shared';
import type { Layer, Template } from '@pf-mediakit/templates';

import {
  prepareHeadline,
  type PreparedHeadline,
  type RenderFrameArgs,
  type RenderState,
  type RenderAssets,
} from './render.js';
import type {
  CanvasDrawContext,
  CanvasFontContext,
} from './text/index.js';
import type { CanvasSize } from './layers/image.js';
import {
  parseAnimations,
  timelineOf,
  type ResolvedAnimation,
  type Timeline,
} from './timeline/index.js';

// ── الخطة ─────────────────────────────────────────────

export interface RenderPlan {
  readonly timeline: Timeline;
  /**
   * تحضير العنوان إن كان في القالب. `measure` مُستثنى — يُنشأ في
   * `drawHeadlineLine` من ctx الرسم الحالي (الخطة Canvas-independent).
   */
  readonly headline?: PreparedHeadline;
  /** عدد الأسطر — يستعمله `parseAnimations` لحساب توقيت `after: "headline"`. */
  readonly headlineLineCount: number;
  readonly animations: Readonly<Record<string, ResolvedAnimation>>;
}

// ── مُدخلات البناء ────────────────────────────────────

export interface BuildRenderPlanArgs {
  /**
   * ctx يُستعمل مؤقتاً للقياس فقط — لا تُرسم شيء عليه هنا.
   * يمكن أن يكون أي canvas بنفس الخطوط المُسجَّلة عالمياً.
   */
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  readonly size: CanvasSize;
  readonly template: Template;
  readonly brand: BrandKit;
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets?: RenderAssets;
  readonly fps?: number;
}

// ── مساعد: يجرّد `measure` من prep ─────────────────────

function stripMeasure(prep: PreparedHeadline): PreparedHeadline {
  // نعيد ننشئ الكائن بلا measure — القيم البدائية الأخرى immutable.
  const {
    fontSize,
    lineHeight,
    chosenBoxW,
    rightX,
    centerX,
    firstBaseline,
    lastBaseline,
    linesJustified,
    align,
    bounds,
    accentSpans,
  } = prep;
  return {
    fontSize,
    lineHeight,
    chosenBoxW,
    rightX,
    centerX,
    firstBaseline,
    lastBaseline,
    linesJustified,
    align,
    bounds,
    accentSpans,
  };
}

// ── الواجهة العامة ─────────────────────────────────────

/**
 * يبني RenderPlan من مدخلات القالب/الهوية/المحتوى. يستدعي:
 *   • timelineOf — يحسب المدة.
 *   • prepareHeadline (مرة واحدة) — يعطي wrap + justify + مواضع.
 *   • parseAnimations — يحلّ توقيت `after` بمعرفة عدد أسطر العنوان.
 *
 * يُنَفَّذ **مرة واحدة قبل حلقة الإطار** — كل هذه القيم لا تعتمد على `t`.
 */
export function buildRenderPlan(args: BuildRenderPlanArgs): RenderPlan {
  const { ctx, size, template, brand, content, assets, fps } = args;
  const timeline = timelineOf(template, brand, content, fps ?? 30);

  const headlineLayer = template.layers.find(
    (l): l is Extract<Layer, { type: 'headline' }> => l.type === 'headline'
  );

  let headlinePrep: PreparedHeadline | undefined;
  if (headlineLayer) {
    const scratchState: RenderState = {};
    const rfArgs: RenderFrameArgs = {
      ctx,
      size,
      template,
      brand,
      content,
      ...(assets && { assets }),
    };
    const raw = prepareHeadline(headlineLayer, rfArgs, scratchState);
    if (raw) headlinePrep = stripMeasure(raw);
  }

  const headlineLineCount = headlinePrep?.linesJustified.length ?? 0;
  const animations = parseAnimations(template, brand, headlineLineCount);

  return headlinePrep
    ? { timeline, headline: headlinePrep, headlineLineCount, animations }
    : { timeline, headlineLineCount, animations };
}
