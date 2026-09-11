// render-plan — يحضّر PreparedHeadline مرة قبل حلقة الإطار.
//
// **العلّة (L-07):** wrapOptimal + justifyLine يعطيان نفس النتيجة لكل
// إطار (العنوان لا يتغيّر عبر الزمن). حسابها 730ms/إطار في السابق =
// 99.5% من زمن الرندر. الخطة تنقلها خارج الحلقة، الأثر ~99% تخفيض.
//
// **العقد بعد WIRE-1-FIX (2026-09-09 · ينقض جزءاً من KICKER-2):**
// نُحاول `prepareHeadline` بحالة scratch فارغة أوّلاً — النجاح يعطي
// خطة كاملة ببـ `bounds` (كل القوالب عدا card_kicker). الفشل بسبب
// `below-kicker` بلا `kicker` في state → ننزل إلى `computeHeadlineLayout`
// (خطة بلا bounds لـcard_kicker وحده).
//
// **لماذا هذا النقض:** KICKER-2 حاول جعل الخطة «تخطيطاً بلا موضع»
// دائماً — كسر `state.headline = plan.headline.bounds` في
// draw-timeline-at.ts:212، فرَمى badges above/below-headline في
// breaking + reel. النوع الواحد بحقول اختيارية يصلح الحالتين. راجع L-69.
//
// **قاعدة صارمة على الاستثناء:** نلتقط استثناء `below-kicker` وحده —
// أيّ استثناء آخر يُعاد رميه (خطأ برمجي حقيقي، لا حالة متوقّعة).
//
// **بعد حذف @legacy timeline (2026-09-02):** timelineOf و parseAnimations
// انتقلا إلى `timeline-v2/template-adapter.ts` كجزء من `templateToTimeline`.
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
  computeHeadlineLayout,
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
   * PreparedHeadline إن كان في القالب طبقة headline. حقول الموضع
   * (`firstBaseline` · `lastBaseline` · `bounds`) موجودة لكل القوالب
   * عدا card_kicker (`below-kicker` يحتاج state.kicker غير المتوفّر هنا).
   * consumers الذين يعتمدون على `bounds` يفحصون وجودها.
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

// ── الواجهة العامة ─────────────────────────────────────

/** رسالة `computeHeadlineAnchorY` عند غياب `state.kicker` لـ`below-kicker`. */
const BELOW_KICKER_MARKER = 'anchor=below-kicker';

/**
 * يبني RenderPlan من مدخلات القالب/الهوية/المحتوى.
 *
 * **الاستراتيجية (WIRE-1-FIX):** نُحاول `prepareHeadline` بحالة scratch
 * فارغة أوّلاً — النجاح يعطي `PreparedHeadline` كامل ببـ `bounds` (يستعمله
 * `draw-timeline-at.ts:212` لملء `state.headline` قبل حلقة الطبقات).
 * الفشل بسبب `below-kicker` بلا `kicker` → ننزل إلى `computeHeadlineLayout`
 * (خطة بلا bounds لـcard_kicker وحده).
 *
 * أيّ استثناء آخر — يُعاد رميه، لأنّه ليس حالة متوقّعة.
 */
export function buildRenderPlan(args: BuildRenderPlanArgs): RenderPlan {
  const { ctx, size, template, brand, content, assets, lexicon } = args;

  const headlineLayer = template.layers.find(
    (l): l is Extract<Layer, { type: 'headline' }> => l.type === 'headline'
  );

  let headlinePrep: PreparedHeadline | undefined;
  if (headlineLayer) {
    const rfArgs: RenderFrameArgs = {
      ctx,
      size,
      template,
      brand,
      content,
      ...(assets && { assets }),
      ...(lexicon && { lexicon }),
    };

    try {
      const scratchState: RenderState = {};
      const full = prepareHeadline(headlineLayer, rfArgs, scratchState);
      if (full) headlinePrep = full;
    } catch (err) {
      // نلتقط استثناء `below-kicker` وحده (card_kicker). أيّ خطأ آخر
      // يُعاد رميه.
      if (err instanceof Error && err.message.includes(BELOW_KICKER_MARKER)) {
        const layoutOnly = computeHeadlineLayout(headlineLayer, rfArgs);
        if (layoutOnly) headlinePrep = layoutOnly;
      } else {
        throw err;
      }
    }
  }

  const headlineLineCount = headlinePrep?.linesJustified.length ?? 0;

  return headlinePrep
    ? { headline: headlinePrep, headlineLineCount }
    : { headlineLineCount };
}
