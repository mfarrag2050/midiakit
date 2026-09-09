// render-plan — يحضّر تخطيط العنوان (بلا موضع) مرة قبل حلقة الإطار.
//
// **العلّة (L-07):** wrapOptimal + justifyLine يعطيان نفس النتيجة لكل
// إطار (العنوان لا يتغيّر عبر الزمن). حسابها 730ms/إطار في السابق =
// 99.5% من زمن الرندر. الخطة تنقلها خارج الحلقة، الأثر ~99% تخفيض.
//
// **العقد بعد KICKER-2 (2026-09-09):** الخطة تحمل **تخطيطاً بلا سياق
// طبقات** — تعرف تخطيط النصّ (wrap · justify · lineHeight · fontSize)
// لا موضعه (baselines · bounds). الموضع مشتقّ من الأنكور الذي قد يحتاج
// state طبقات أخرى (kicker لـ`below-kicker`)، فيبقى داخل renderFrame
// الذي يملك ترتيب الطبقات.
//
// **العطب التاريخي المُصلَح (KICKER-1 تشخيصاً · KICKER-2 حلاًّ):**
// النسخة السابقة استدعت `prepareHeadline` بـscratchState فارغة، فكان
// `computeHeadlineAnchorY` يرمي على أيّ قالب فيه `anchor=below-kicker`
// (card_kicker) — عطلٌ ينفجر في مسار MP4 الإنتاجي (apps/renderer).
// الحلّ: `computeHeadlineLayout` من render.ts بدلاً من `prepareHeadline`
// — يفعل خطوات 1-8 (المستقلّة عن state) ويُرجع `PreparedHeadlineLayout`.
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
  computeHeadlineLayout,
  type PreparedHeadlineLayout,
  type RenderFrameArgs,
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
   * تخطيط العنوان إن كان في القالب — بلا موضع. الحقول المشتقّة من
   * الأنكور (`firstBaseline` · `lastBaseline` · `bounds`) **غير موجودة
   * هنا بنيوياً** — تُحسب في renderFrame بعد رسم الطبقات التي يعتمد
   * عليها الأنكور (مثلاً kicker لـ`below-kicker`).
   */
  readonly headline?: PreparedHeadlineLayout;
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

/**
 * يبني RenderPlan من مدخلات القالب/الهوية/المحتوى. يستدعي
 * `computeHeadlineLayout` (مرة واحدة) — يعطي wrap + justify + fontSize +
 * lineHeight بلا انتظار state طبقات (KICKER-2).
 *
 * يُنَفَّذ **مرة واحدة قبل حلقة الإطار** — كل هذه القيم لا تعتمد على `t`
 * ولا على ترتيب الطبقات.
 */
export function buildRenderPlan(args: BuildRenderPlanArgs): RenderPlan {
  const { ctx, size, template, brand, content, assets, lexicon } = args;

  const headlineLayer = template.layers.find(
    (l): l is Extract<Layer, { type: 'headline' }> => l.type === 'headline'
  );

  let headlineLayout: PreparedHeadlineLayout | undefined;
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
    const raw = computeHeadlineLayout(headlineLayer, rfArgs);
    if (raw) headlineLayout = raw;
  }

  const headlineLineCount = headlineLayout?.linesJustified.length ?? 0;

  return headlineLayout
    ? { headline: headlineLayout, headlineLineCount }
    : { headlineLineCount };
}
