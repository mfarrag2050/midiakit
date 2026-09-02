// timeline-v2/plan — buildTimelinePlan (docs/10 عقد المحرك + L-07).
//
// **العلّة (L-07):** حساب wrap/justify للنصوص داخل حلقة إطارات يقتل
// الأداء (177s→2.2s سابقاً). كل نصّ في مسار text يجب أن يُلفّ ويُبرَّر
// **مرة واحدة** قبل الحلقة، ويُخزَّن كـPreparedHeadline في الخطة.
//
// **النقاء محفوظ:** الخطة قيمة مُشتقّة من نفس المدخلات (timeline + brand
// + assets + template)، تُمرَّر إلى drawTimelineAt كوسيط. لا وحدة حالة.
//
// **حدود هذه الجلسة (session 1):** الخطة تدعم:
//   • حساب مواضع العنصر الأول من كل مسار text — تحضير رأس واحد كافٍ
//     لبوابة التكافؤ (breaking لديه رأس واحد ومصدر واحد).
//   • حساب breakPenalties (semantic breaks) — إن كان مُفعَّلاً في brand.
// **مؤجَّل:** خطة الوسائط (المسار media)، خطة الصوت (buildAudioGraph)،
// دعم عدة عناصر نص لكل مسار.

import type { BrandKit, Timeline, TrackItem } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';

import type { PreparedHeadline } from '../render.js';

// ── نتيجة الخطة ──────────────────────────────────────

/** حزمة تحضير نصّ واحد داخل عنصر مسار — تُحسب مرة قبل الحلقة. */
export interface PreparedTextItem {
  /** معرف العنصر — يطابق TrackItem.id في المصدر. */
  readonly itemId: string;
  /** معرف المسار المضيف. */
  readonly trackId: string;
  /** PreparedHeadline كامل من render.ts (بلا measure — canvas-independent). */
  readonly prep: PreparedHeadline;
}

/**
 * نتيجة `buildTimelinePlan`. تُمرَّر كـplan إلى drawTimelineAt.
 *
 * **الاستخدام:** المستدعي يبنيها مرة قبل حلقة الإطارات، ثم يمرّرها
 * على كل استدعاء drawTimelineAt(t). كل الحسابات المستقلة عن t
 * (wrap, justify, layout) موجودة هنا.
 */
export interface TimelinePlan {
  /** المرجع الأصلي للـtimeline (يُقرأ فقط، لا يُعدَّل). */
  readonly timeline: Timeline;
  /** تحضير نصوص العناصر — مفتاح خارجي: `${trackId}:${itemId}`. */
  readonly textPreps: ReadonlyMap<string, PreparedTextItem>;
}

// ── مدخلات البناء ─────────────────────────────────────

export interface BuildTimelinePlanArgs {
  readonly timeline: Timeline;
  readonly brand: BrandKit;
  /**
   * القالب المرجعي — للنصوص التي تشير إلى `item.template` وقيمها في
   * `item.value`. session 1: قالب واحد كافٍ (breaking).
   */
  readonly template: Template;
  /** ctx للقياس فقط — لا يُرسم عليه. */
  readonly ctx: unknown;
  /** حجم القماش — من `timeline.size` أو مُمرَّر صريحاً. */
  readonly size: { readonly w: number; readonly h: number };
}

/**
 * **جلسة 1 — دالة placeholder:** الخطة تُبنى فارغة. تحضير النصوص
 * سيُضاف في drawTimelineAt session 1.5 عند دمج بوابة التكافؤ.
 *
 * السبب: بوابة التكافؤ لجلسة 1 تستعمل `prepareHeadline` مباشرة عبر
 * المسار القديم كمصدر ثقة. عند اعتماد المسار الجديد كمصدر أوحد،
 * ننقل التحضير هنا.
 */
export function buildTimelinePlan(args: BuildTimelinePlanArgs): TimelinePlan {
  return {
    timeline: args.timeline,
    textPreps: new Map<string, PreparedTextItem>(),
  };
}

// ── حساب مساعد للمستدعي ──────────────────────────────

/** يستخرج كل عناصر نصّية عبر كل المسارات (للتحضير المسبق). */
export function collectTextItems(
  timeline: Timeline
): readonly { readonly trackId: string; readonly item: TrackItem }[] {
  const out: { trackId: string; item: TrackItem }[] = [];
  for (const track of timeline.tracks) {
    if (track.type !== 'text') continue;
    for (const item of track.items) out.push({ trackId: track.id, item });
  }
  return out;
}
