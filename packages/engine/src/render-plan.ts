// render-plan — يحضّر PreparedHeadline مرة قبل حلقة الإطار.
//
// **العلّة (L-07):** wrapOptimal + justifyLine يعطيان نفس النتيجة لكل
// إطار (العنوان لا يتغيّر عبر الزمن). حسابها 730ms/إطار في السابق =
// 99.5% من زمن الرندر. الخطة تنقلها خارج الحلقة، الأثر ~99% تخفيض.
//
// **بعد حذف @legacy timeline (2026-09-02):** timelineOf و parseAnimations
// انتقلا إلى `timeline-v2/template-adapter.ts` كجزء من `templateToTimeline`.
// RenderPlan تقلّصت إلى `{ headline?, headlineLineCount }` — كل ما تحتاجه
// timeline-v2 لبناء Timeline. حساب مدة القالب والحركات الآن مسؤولية
// `templateToTimeline`، لا `buildRenderPlan`.
//
// **العقد:**
//   buildRenderPlan({ctx, size, template, brand, content, assets?, fps?, lexicon?})
//     → RenderPlan (قيمة خالصة، Canvas-independent).
//
// **النقاء محفوظ:** الخطة تُشتقّ من نفس المدخلات، تُمرَّر كوسيط. لا
// حالة، لا آثار جانبية.

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
import type { Lexicon } from './arabic-lexicon/index.js';
import type { CanvasSize } from './layers/image.js';

// ── الخطة ─────────────────────────────────────────────

export interface RenderPlan {
  /**
   * تحضير العنوان إن كان في القالب. `measure` مُستثنى — يُنشأ في
   * `drawHeadlineLine` من ctx الرسم الحالي (الخطة Canvas-independent).
   */
  readonly headline?: PreparedHeadline;
  /**
   * عدد الأسطر — يستعمله `templateToTimeline` لحساب توقيت
   * `after: "headline"` في الحركات.
   */
  readonly headlineLineCount: number;
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
  /**
   * قاموس عربي مُخصَّص. إن مُرِّر ExtendedLexicon (من extendLexicon)،
   * تُطبَّق قواعد الجزء (ب): title-name, place-pair, entity-pair.
   * الافتراضي: القاموس الأساسي (الجزء أ فقط) — لا يحتاج تحميل ملفات.
   */
  readonly lexicon?: Lexicon;
}

// ── مساعد: يجرّد `measure` من prep ─────────────────────

function stripMeasure(prep: PreparedHeadline): PreparedHeadline {
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
 * يبني RenderPlan من مدخلات القالب/الهوية/المحتوى. يستدعي
 * `prepareHeadline` (مرة واحدة) — يعطي wrap + justify + مواضع.
 *
 * يُنَفَّذ **مرة واحدة قبل حلقة الإطار** — كل هذه القيم لا تعتمد على `t`.
 */
export function buildRenderPlan(args: BuildRenderPlanArgs): RenderPlan {
  const { ctx, size, template, brand, content, assets, lexicon } = args;

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
      ...(lexicon && { lexicon }),
    };
    const raw = prepareHeadline(headlineLayer, rfArgs, scratchState);
    if (raw) headlinePrep = stripMeasure(raw);
  }

  const headlineLineCount = headlinePrep?.linesJustified.length ?? 0;

  return headlinePrep
    ? { headline: headlinePrep, headlineLineCount }
    : { headlineLineCount };
}
