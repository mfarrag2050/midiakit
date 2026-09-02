// timeline-v2/plan — buildTimelinePlan (docs/10 عقد المحرك + L-07).
//
// **العلّة (L-07):** حساب wrap/justify للنصوص داخل حلقة إطارات يقتل
// الأداء (177s→2.2s سابقاً). كل نصّ في مسار text يجب أن يُلفّ ويُبرَّر
// **مرة واحدة** قبل الحلقة، ويُخزَّن كـPreparedHeadline في الخطة.
//
// **النقاء محفوظ:** الخطة قيمة مُشتقّة من نفس المدخلات (timeline + brand
// + template + ctx للقياس)، تُمرَّر إلى drawTimelineAt كوسيط. لا وحدة
// حالة، لا آثار جانبية.
//
// **مبدأ الاستدعاء:** نستدعي `prepareHeadline` الموجودة (render.ts)
// لكل عنصر text — لا نعيد بناءها. الطبقة المرجعية داخل template تُحدَّد
// بواسطة `item.template` (اسم القالب) أو نستعمل القالب المُمرَّر إن كان
// العنصر بلا template صريح (المسار المألوف: قالب واحد يحكم كل شيء).
//
// **جلسة 2:** buildTimelinePlan يمتلئ. نصوص text تُحضَّر مسبقاً. مسارات
// media لا تحتاج تحضيراً (drawTimelineAt يحمّل الصور من assets مباشرة).

import type { BrandKit, Timeline, TrackItem } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';

import {
  prepareHeadline,
  type PreparedHeadline,
  type RenderFrameArgs,
  type RenderState,
  type RenderAssets,
} from '../render.js';
import type {
  CanvasDrawContext,
  CanvasFontContext,
} from '../text/index.js';

// ── نتيجة الخطة ──────────────────────────────────────

/** حزمة تحضير نصّ واحد داخل عنصر مسار — تُحسب مرة قبل الحلقة. */
export interface PreparedTextItem {
  readonly itemId: string;
  readonly trackId: string;
  readonly prep: PreparedHeadline;
}

export interface TimelinePlan {
  readonly timeline: Timeline;
  /** مفتاح: `${trackId}:${itemId}`. */
  readonly textPreps: ReadonlyMap<string, PreparedTextItem>;
}

// ── مدخلات البناء ─────────────────────────────────────

export interface BuildTimelinePlanArgs {
  readonly timeline: Timeline;
  readonly brand: BrandKit;
  /**
   * القالب المرجعي — يُستشار للطبقة `headline` عند تحضير عناصر text.
   * للجلسة 2 القالب واحد لكل الخط الزمني (نموذج breaking).
   */
  readonly template: Template;
  /** ctx للقياس فقط — لا يُرسم عليه. */
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  /** حجم القماش. */
  readonly size: { readonly w: number; readonly h: number };
  /** أصول (يحتاجها prepareHeadline للطبقة headline إن كانت تعتمد onlyIf). */
  readonly assets?: RenderAssets;
}

// ── الواجهة العامة ────────────────────────────────────

/**
 * يبني الخطة. لكل عنصر في مسار text: يستدعي `prepareHeadline` مرة
 * ويخزّن النتيجة. drawTimelineAt session-3 سيستهلك الخطة بدلاً من
 * تمرير `headlinePrep` منفصلاً.
 *
 * **جلسة 2:** إذا لم يجد العنصر `template` صريح أو `value`، لا يُحضَّر
 * (item بلا نصّ لا headline له). حالات text المُركّبة (item.template
 * يشير إلى قالب مختلف عن الرئيسي) مؤجَّلة — يحتاج تسجيل قوالب.
 */
export function buildTimelinePlan(args: BuildTimelinePlanArgs): TimelinePlan {
  const preps = new Map<string, PreparedTextItem>();

  for (const track of args.timeline.tracks) {
    if (track.type !== 'text') continue;
    for (const item of track.items) {
      if (item.value === undefined || item.value === '') continue;
      const prep = prepareTextItem(item, args);
      if (prep) {
        preps.set(`${track.id}:${item.id}`, {
          itemId: item.id,
          trackId: track.id,
          prep,
        });
      }
    }
  }

  return { timeline: args.timeline, textPreps: preps };
}

// ── التحضير المفرد لعنصر text ─────────────────────

function prepareTextItem(
  item: TrackItem,
  args: BuildTimelinePlanArgs
): PreparedHeadline | null {
  // نحدّد الطبقة headline من القالب — أول طبقة type='headline'.
  const layer = args.template.layers.find((l) => l.type === 'headline');
  if (!layer || layer.type !== 'headline') return null;

  // نبني content مؤقت — العنصر يحمل النص في `value`، نضعه تحت
  // field الطبقة (عادةً 'headline').
  const contentKey = layer.field;
  const content: Record<string, unknown> = { [contentKey]: item.value };

  const rfArgs: RenderFrameArgs = {
    ctx: args.ctx,
    size: args.size,
    template: args.template,
    brand: args.brand,
    content,
    ...(args.assets && { assets: args.assets }),
  };
  const state: RenderState = {};
  return prepareHeadline(layer, rfArgs, state);
}

// ── مساعد للمستدعي ────────────────────────────────

/** يستخرج كل عناصر text عبر كل المسارات — لتشخيص/فحص خطة. */
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

