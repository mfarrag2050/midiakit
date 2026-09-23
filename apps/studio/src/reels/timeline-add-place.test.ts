// (474 §٤ · 474b) بوّابةُ «موضعٌ لا يتصادم ولا يتلاصق».
//
// **الخضراء (١):** قطعتا نصٍّ في مسارَين متداخلتان زمنيّاً [0,4] و[2,6]
// عبرَ مسارِ الواجهةِ (`addTextItemPlaced`) ← `collisions.length === 0`
// والanchor صريحانِ مختلفان.
//
// **الحمراءُ الشاهدة (٢):** القطعتان نفساهما عبرَ `addItem` الخام بلا
// موضع ← `collisions.length >= 1` (كلاهما يهبطُ المنتصفَ — mapItemAnchor
// في plan.ts).
//
// **الحالةُ التي أرسبتْنا (٣ — 474b):** ثلاثةُ نصوصٍ في الإطارِ واحد،
// اثنانِ منها متلاصقان: المحرّكُ يرى فُرجةً موجبةً فلا يُنذر (yOverlap
// > 0 فحسب)، والعينُ تقرأُ كتلةً واحدة. قِست: فُرجةُ 36px بجوارِ صندوقٍ
// ارتفاعُ سطرِهِ 76px على قماشةِ 1920. البوّابةُ الجديدةُ تشترطُ فُرجةً
// ≥ نصفِ سطرٍ (MIN_TEXT_GAP_LINE_RATIO) — والشاهدُ (٤) يثبتُ أنّ
// تعريفَ المحرّكِ وحدهُ كان سيمرِّرُ التلاصقَ صامتاً.

import { describe, expect, it } from 'vitest';
import type { Timeline, Track, TrackItem } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { REEL } from '@pf-mediakit/templates';
import {
  applyLocaleToBrand,
  buildTimelinePlan,
  resolveBrand,
} from '@pf-mediakit/engine';

import { addItem } from './timeline-add';
import {
  addTextItemPlaced,
  gapThresholdFor,
  type CollisionProbe,
  type ProbeFrame,
  type ProbeTextItem,
} from './timeline-add-place';

// ── مرآةُ المعاينة: brand وtemplate وsize كما في plan-probe ──

const SIZE = { w: 1080, h: 1920 } as const;

const brand = resolveBrand(applyLocaleToBrand(DEFAULT_BRAND, 'ar'));

// ctx وهمي — عُرف اختبارات المحرّك (width = len×10، ascent 30، descent 10).
const mockCtx = {
  font: '',
  measureText: (s: string) => ({
    width: s.length * 10,
    actualBoundingBoxAscent: 30,
    actualBoundingBoxDescent: 10,
  }),
  save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
  fillRect: () => {}, fillText: () => {}, drawImage: () => {},
  beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
  fill: () => {}, stroke: () => {}, arc: () => {}, arcTo: () => {},
  clip: () => {}, rect: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
  globalAlpha: 1, fillStyle: '', strokeStyle: '',
  textAlign: 'right' as CanvasTextAlign,
  textBaseline: 'alphabetic' as CanvasTextBaseline,
  direction: 'rtl' as CanvasDirection,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'high' as ImageSmoothingQuality,
};

/** خطّةٌ كاملةٌ عبرَ المحرّك — نفسُ ما يستدعيه العرض. */
const planOf = (timeline: Timeline) =>
  buildTimelinePlan({
    ctx: mockCtx as Parameters<typeof buildTimelinePlan>[0]['ctx'],
    timeline,
    brand,
    template: REEL,
    size: SIZE,
  });

/** صناديقُ النصوص من الخطّة — مرآةُ collectProbeTexts في plan-probe. */
const textsOf = (timeline: Timeline): readonly ProbeTextItem[] => {
  const out: ProbeTextItem[] = [];
  for (const entry of Array.from(planOf(timeline).textPreps.values())) {
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

/** فحصُ التصادمِ كما يستدعيه العرضُ (plan-probe) — بخطّةٍ كاملة. */
const probe: CollisionProbe = (timeline: Timeline): ProbeFrame => ({
  collisions: planOf(timeline).collisions,
  texts: textsOf(timeline),
});

/** أقلُّ فُرجةٍ بينَ كلِّ زوجَين متداخلَين زمنيّاً — سالبٌ إن تقاطعا. */
const minGap = (texts: readonly ProbeTextItem[]): number => {
  let best = Infinity;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (Math.min(a.end, b.end) - Math.max(a.start, b.start) <= 0) continue;
      const gap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
      if (gap < best) best = gap;
    }
  }
  return best;
};

/** أصغرُ عتبةِ فُرجةٍ بينَ كلِّ زوجَين متداخلَين زمنيّاً. */
const minThreshold = (texts: readonly ProbeTextItem[]): number => {
  let best = Infinity;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (Math.min(a.end, b.end) - Math.max(a.start, b.start) <= 0) continue;
      const th = gapThresholdFor(a, b);
      if (th < best) best = th;
    }
  }
  return best;
};

// ── بنّاءة ───────────────────────────────────────────

const textTrack = (id: string, index: number): Track => ({
  id,
  type: 'text',
  index,
  items: [],
});

const textItem = (id: string, start: number, end: number): TrackItem => ({
  id,
  start,
  end,
  value: `نصُّ الاختبارِ للقطعةِ ${id}`,
});

const baseTimeline = (): Timeline => ({
  duration: 10,
  fps: 30,
  size: 'reel',
  tracks: [textTrack('t1', 0), textTrack('t2', 1)],
});

// ── البوّابة ─────────────────────────────────────────

describe('474 §٤ — موضعٌ لا يتصادم', () => {
  it('١. الخضراء: قطعتان متداخلتان زمنيّاً عبر مسار الواجهة ⇒ صفر تصادم وفُرجة سالمة', () => {
    const a = textItem('a', 0, 4);
    const b = textItem('b', 2, 6); // تداخلٌ زمنيٌّ [2,4]
    let tl = baseTimeline();
    tl = addTextItemPlaced(tl, 't1', a, probe, 'insert');
    tl = addTextItemPlaced(tl, 't2', b, probe, 'insert');

    expect(planOf(tl).collisions.length).toBe(0);
    // والفُرجةُ بينَ الصندوقَين ≥ العتبة — لا تلاصقَ بعدَ اليوم.
    const texts = textsOf(tl);
    expect(minGap(texts)).toBeGreaterThanOrEqual(minThreshold(texts));
    // والanchor صريحانِ مختلفان — الموضعُ اختيرَ لا افترضَ.
    const anchors = tl.tracks
      .flatMap((tr) => tr.items.map((it) => it.anchor))
      .filter((x) => x !== undefined);
    expect(anchors.length).toBe(2);
    expect(anchors[0]).not.toEqual(anchors[1]);
  });

  it('٢. الحمراء الشاهدة: القطعتان نفساهما عبر addItem الخام ⇒ تصادم واحدٌ على الأقل', () => {
    const a = textItem('a', 0, 4);
    const b = textItem('b', 2, 6);
    let tl = baseTimeline();
    tl = addItem(tl, 't1', a, 'insert'); // خام — بلا anchor
    tl = addItem(tl, 't2', b, 'insert'); // خام — بلا anchor

    expect(planOf(tl).collisions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('474b — التلاصقُ ليس سلامة', () => {
  /** المشهدُ الذي أرسبَنا (474b §ما رأيتُه): بذرةٌ من بياناتٍ قائمةٍ
   *  (anchor 0.2 — كما title-01 في العيّنة) + قطعتانِ متداخلتانِ معها
   *  زمنيّاً تُضافانِ في اللحظةِ نفسِها. البذرةُ لا تمرُّ على البحثِ
   *  قطّ — هي بياناتٌ لا إضافة. */
  const scene = (): { seed: Timeline; a: TrackItem; b: TrackItem } => ({
    seed: {
      duration: 10,
      fps: 30,
      size: 'reel',
      tracks: [
        { ...textTrack('t1', 0), items: [{ ...textItem('seed', 0.5, 7), anchor: 0.2 }] },
        textTrack('t2', 1),
        textTrack('t3', 2),
      ],
    },
    a: textItem('a', 0, 4),
    b: textItem('b', 2, 6),
  });

  it('٣. الحالةُ التي أرسبتْنا: ثلاثةٌ في الإطار، لا تلاصقَ ولا تصادم', () => {
    const { seed, a, b } = scene();
    let tl = seed;
    tl = addTextItemPlaced(tl, 't2', a, probe, 'insert');
    tl = addTextItemPlaced(tl, 't3', b, probe, 'insert');

    const plan = planOf(tl);
    const texts = textsOf(tl);
    expect(texts.length).toBe(3); // الثلاثةُ حيّةٌ في الإطار.

    // البوّابة: صفرُ تصادمات **وفُرجةٌ ≥ العتبة بينَ كلِّ زوجَين** —
    // إن ظلّت تعطي ما كانت تعطيه (فُرجةً صغيرةً صامتة) فما أُصلِحَ شيء.
    expect(plan.collisions.length).toBe(0);
    expect(minGap(texts)).toBeGreaterThanOrEqual(minThreshold(texts));
  });

  it('٤. الشاهدُ على عمى التعريف القديم: فُرجةٌ موجبةٌ صغيرة ⇒ المحرّك صامتٌ والبوّابة ترسب', () => {
    // المشهدُ نفسُه لكنّ القطعةَ الأولى تُثبَّتُ يدويّاً حيثُ وضعتها
    // 474 الأولى ('top') — الموضعُ الذي قرأهُ المالكُ كتلةً واحدة.
    const { seed, b } = scene();
    let tl = seed;
    tl = addItem(tl, 't2', { ...textItem('a', 0, 4), anchor: 'top' }, 'insert');
    tl = addItem(tl, 't3', b, 'insert');

    const texts = textsOf(tl);
    // تعريفُ المحرّكِ لا يرى التلاصق: yGap موجبةٌ ⇒ صفرُ تحذيرات.
    expect(planOf(tl).collisions.length).toBe(0);
    // وبوّابةُ الفُرجةِ تمسكُه: الفُرجةُ أقلُّ من عتبةِ السطرِ الأكبر.
    expect(minGap(texts)).toBeLessThan(minThreshold(texts));
  });
});
