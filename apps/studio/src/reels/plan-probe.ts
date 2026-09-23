// (474 §٣) فحصُ التصادمِ والتلاصقِ خارجَ شاشةِ العرض — للإضافةِ الآمنة.
//
// **لماذا ctx آخر وليس قماشةَ المعاينة؟** ctx الخطةِ للقياسِ وحدَه
// («ctx للقياس فقط — لا يُرسم عليه»، plan.ts) — فأيُّ ctx بعدَ جهوزيّةِ
// الخطِّ نفسِهِ يقيسُ الشروحَ نفسَها: العائلةُ محقونةٌ من TimelinePreview
// (ADR-006: لا قياسَ قبلَ جهوزيّةِ الخطِّ)، وdocument.fonts حالةٌ عامّة.
// قماشةٌ خارجُ الشاشةِ لا يُرسمُ عليها ⇒ لا تُخدِشُ إطارَ المعاينة.
//
// **brand/template/size = مرآةُ TimelinePreview حرفيّاً** (DEFAULT_BRAND
// بعدَ applyLocale 'ar' · REEL · 1080×1920) — لا ثانيةً مهما اختلفت.
// وassets لا تُمرَّر: التأهبُ النصّيُّ (prep.bounds) لا يقرأُها، والفحصُ
// نصّيٌّ وحدَه.
//
// (474b) الفحصُ يُرجعُ التصادماتِ **والصناديق** — التلاصقُ يقاسُ على
// الصناديقِ لا على تصادماتِ المحرّكِ وحدها.

import type { Timeline, TrackItem } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { REEL } from '@pf-mediakit/templates';
import {
  applyLocaleToBrand,
  buildTimelinePlan,
  resolveBrand,
} from '@pf-mediakit/engine';

import type {
  CollisionProbe,
  ProbeFrame,
  ProbeTextItem,
} from './timeline-add-place';

const SIZE = { w: 1080, h: 1920 } as const;

let probeCtx: CanvasRenderingContext2D | null = null;

const measureCtx = (): CanvasRenderingContext2D | null => {
  if (probeCtx) return probeCtx;
  const c = document.createElement('canvas');
  probeCtx = c.getContext('2d');
  return probeCtx;
};

/** صناديقُ النصوص من الخطّة — bounds + offset، مع النافذةِ الزمنيّةِ
 *  والسطور (مرآةُ collectTextBoxes في TimelinePreview، بلا خروجٍ عن
 *  الكادر: فُرجةُ السلامةِ تُقاسُ على الهندسةِ الخام). */
const collectProbeTexts = (
  timeline: Timeline,
  textPreps: ReturnType<typeof buildTimelinePlan>['textPreps'],
): readonly ProbeTextItem[] => {
  const out: ProbeTextItem[] = [];
  for (const entry of Array.from(textPreps.values())) {
    const bounds = entry.prep.bounds;
    const item: TrackItem | undefined = timeline.tracks
      .find((tr) => tr.id === entry.trackId)
      ?.items.find((i) => i.id === entry.itemId);
    if (!bounds || !item) continue;
    out.push({
      itemId: entry.itemId,
      start: item.start,
      end: item.end,
      top: bounds.top + (item.offset?.y ?? 0),
      bottom: bounds.bottom + (item.offset?.y ?? 0),
      lines: entry.prep.linesJustified.length,
    });
  }
  return out;
};

/** تصادماتُ خطّةٍ كاملةٍ وصناديقُها كما يحسبُها المحرّكُ — نفسُ
 *  ctx/brand/template التي يرسمُ بها العرض. بلا ctx ⇒ إطارٌ فارغٌ (لا
 *  تخمينَ: لا موضعَ يُقبَلُ على عمى، فالمرشَّحاتُ تنفدُ ويُثبَّتُ
 *  center والإنذارُ يقول). */
export const probeCollisions: CollisionProbe = (
  timeline: Timeline,
): ProbeFrame => {
  const ctx = measureCtx();
  if (!ctx) return { collisions: [], texts: [] };
  const brand = resolveBrand(applyLocaleToBrand(DEFAULT_BRAND, 'ar'));
  const plan = buildTimelinePlan({
    ctx: ctx as Parameters<typeof buildTimelinePlan>[0]['ctx'],
    size: SIZE,
    timeline,
    brand,
    template: REEL,
  });
  return {
    collisions: plan.collisions,
    texts: collectProbeTexts(timeline, plan.textPreps),
  };
};
