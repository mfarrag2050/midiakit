// timeline-v2/plan — buildTimelinePlan (docs/10 عقد المحرك + L-07).
//
// **العلّة (L-07):** حساب wrap/justify للنصوص داخل حلقة إطارات يقتل
// الأداء. كل نصّ في مسار text يجب أن يُلفّ ويُبرَّر مرة قبل الحلقة،
// ويُخزَّن كـPreparedHeadline في الخطة.
//
// **الموضع لكل عنصر (L-16 · 2026-09-02):** كل عنصر نص يحمل `anchor`
// و`offset` خاصَّين. buildTimelinePlan **يبني نسخة معدَّلة من طبقة
// headline** بـ anchor مأخوذ من العنصر (لا من القالب)، ثم يمرّرها إلى
// prepareHeadline. تجاهل item.anchor كان سبب تصادم نصَّين في نفس
// الموضع — راجع docs/LESSONS.md#L-16.
//
// **فحص التصادم:** بعد بناء كل preps، نطابق كل زوج عناصر متداخل زمنياً
// ونفحص تقاطع صناديقهما الرأسية. تحذير في `console.warn` — لا استثناء
// (قد يكون التصادم مقصوداً كتراكب طبقات في حالات خاصّة).
//
// **النقاء محفوظ:** الخطة قيمة مُشتقّة من نفس المدخلات، تُمرَّر إلى
// drawTimelineAt كوسيط. لا حالة، لا آثار جانبية عدا التحذير.

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

/** تحذير تصادم — يُملأ إن اكتُشف نصّان يتقاطعان مكانياً وزمانياً. */
export interface CollisionWarning {
  readonly a: { readonly trackId: string; readonly itemId: string };
  readonly b: { readonly trackId: string; readonly itemId: string };
  readonly overlapSeconds: number;
  readonly yGapPixels: number;
}

export interface TimelinePlan {
  readonly timeline: Timeline;
  /** مفتاح: `${trackId}:${itemId}`. */
  readonly textPreps: ReadonlyMap<string, PreparedTextItem>;
  /** تحذيرات تصادم مكاني بين عناصر متداخلة زمنياً. */
  readonly collisions: readonly CollisionWarning[];
}

// ── مدخلات البناء ─────────────────────────────────────

export interface BuildTimelinePlanArgs {
  readonly timeline: Timeline;
  readonly brand: BrandKit;
  /**
   * القالب المرجعي — يوفّر طبقة `headline` كنقطة انطلاق للتحضير.
   * anchor/verticalAnchor من طبقة القالب يُتجاوَزان بـ `item.anchor`.
   */
  readonly template: Template;
  /** ctx للقياس فقط — لا يُرسم عليه. */
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  /** حجم القماش. */
  readonly size: { readonly w: number; readonly h: number };
  readonly assets?: RenderAssets;
}

// ── تعيين anchor العنصر إلى anchor + verticalAnchor للطبقة ─

interface AnchorMapping {
  readonly anchor: 'top' | 'middle' | 'bottom' | 'centerLower';
  readonly verticalAnchor?: number;
}

/**
 * يحوّل item.anchor إلى (layer.anchor, layer.verticalAnchor):
 *   • 'top'    → anchor='top' (15% من الارتفاع في render.ts)
 *   • 'center' → anchor='middle' (50%)
 *   • 'bottom' → anchor='bottom' (85%)
 *   • ratio    → anchor='centerLower' + verticalAnchor=ratio
 * الافتراضي (undefined) → 'center' (0.5) — يُصاحبه تحذير تصادم لاحق
 * إن تعارض مع عنصر آخر.
 */
function mapItemAnchor(itemAnchor: TrackItem['anchor']): AnchorMapping {
  if (itemAnchor === undefined) return { anchor: 'middle' };
  if (itemAnchor === 'top') return { anchor: 'top' };
  if (itemAnchor === 'center') return { anchor: 'middle' };
  if (itemAnchor === 'bottom') return { anchor: 'bottom' };
  // نسبة رقمية
  return { anchor: 'centerLower', verticalAnchor: itemAnchor };
}

// ── الواجهة العامة ────────────────────────────────────

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

  const collisions = detectCollisions(args.timeline, preps);
  for (const c of collisions) {
    // eslint-disable-next-line no-console
    console.warn(
      `[buildTimelinePlan] تصادم مكاني/زماني: ${c.a.trackId}:${c.a.itemId} × ${c.b.trackId}:${c.b.itemId} — ` +
      `تداخل زمني ${c.overlapSeconds.toFixed(2)}s، فارق رأسي ${c.yGapPixels.toFixed(0)}px (سالب = تقاطع). ` +
      `عيّن item.anchor لكل عنصر (top/center/bottom أو نسبة).`
    );
  }

  return { timeline: args.timeline, textPreps: preps, collisions };
}

// ── التحضير المفرد لعنصر text ─────────────────────

function prepareTextItem(
  item: TrackItem,
  args: BuildTimelinePlanArgs
): PreparedHeadline | null {
  const baseLayer = args.template.layers.find((l) => l.type === 'headline');
  if (!baseLayer || baseLayer.type !== 'headline') return null;

  // clone الطبقة مع override لـ anchor/verticalAnchor من item.
  const mapping = mapItemAnchor(item.anchor);
  const overriddenLayer = {
    ...baseLayer,
    anchor: mapping.anchor,
    ...(mapping.verticalAnchor !== undefined && {
      verticalAnchor: mapping.verticalAnchor,
    }),
  };

  const contentKey = baseLayer.field;
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
  return prepareHeadline(overriddenLayer, rfArgs, state);
}

// ── فحص التصادم ──────────────────────────────────────

/**
 * لكل زوج عناصر text في مسارات مختلفة (أو نفس المسار):
 *   1. هل يتداخلان زمنياً؟ [a.start, a.end] ∩ [b.start, b.end] > 0
 *   2. هل صناديقهما الرأسية تتقاطع؟
 *      box.top = prep.bounds.top، box.bottom = prep.bounds.bottom
 * إن تحقّق الاثنان ⇒ تحذير.
 *
 * **ليست خطأ صعباً:** بعض التصاميم تتراكب عمداً (ظلّ نص، تراكب مقصود).
 * التحذير يُلزم المصمّم بالتحقّق عن قصد أو خطأ.
 */
function detectCollisions(
  timeline: Timeline,
  preps: ReadonlyMap<string, PreparedTextItem>
): readonly CollisionWarning[] {
  const items: Array<{
    trackId: string;
    item: TrackItem;
    prep: PreparedHeadline;
  }> = [];
  for (const track of timeline.tracks) {
    if (track.type !== 'text') continue;
    for (const item of track.items) {
      const p = preps.get(`${track.id}:${item.id}`);
      if (p) items.push({ trackId: track.id, item, prep: p.prep });
    }
  }

  const warnings: CollisionWarning[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      // تداخل زمني
      const tOverlap = Math.min(a.item.end, b.item.end) - Math.max(a.item.start, b.item.start);
      if (tOverlap <= 0) continue;
      // تقاطع رأسي (يشمل offset.y إن وُجد)
      const aTop = a.prep.bounds.top + (a.item.offset?.y ?? 0);
      const aBot = a.prep.bounds.bottom + (a.item.offset?.y ?? 0);
      const bTop = b.prep.bounds.top + (b.item.offset?.y ?? 0);
      const bBot = b.prep.bounds.bottom + (b.item.offset?.y ?? 0);
      const yOverlap = Math.min(aBot, bBot) - Math.max(aTop, bTop);
      if (yOverlap <= 0) continue; // لا تقاطع — سالم
      warnings.push({
        a: { trackId: a.trackId, itemId: a.item.id },
        b: { trackId: b.trackId, itemId: b.item.id },
        overlapSeconds: tOverlap,
        yGapPixels: -yOverlap, // سالب = تقاطع
      });
    }
  }
  return warnings;
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
