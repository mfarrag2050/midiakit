// mk/468 · اختبار كشفِ التصادم — ثنائيُّ البُعد (زمنيّ + رأسيّ + أفقيّ).
//
// **العلّة:** `detectCollisions` كانت تقارنُ الرأسيَّ وحدَه، فتُبلِّغ
// عن نصّين أزاحهما المستخدمُ أفقيّاً بـ`offset.x` تصادماً كاذباً — جرسٌ
// يرنُّ بلا سبب. الحلّ: تقاطعٌ في الأبعاد الثلاثة — أيٌّ منها ينتفي ⟵
// لا تحذير.

import { describe, expect, it } from 'vitest';
import type { Timeline, TrackItem } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';

import { buildTimelinePlan } from './plan.js';
import { resolveBrand } from '../brand/resolve.js';

const brand = resolveBrand(DEFAULT_BRAND);

// ctx اصطناعيّ يكفي prepareHeadline — نسخة من timeline.test.ts.
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
  clip: () => {}, rect: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  globalAlpha: 1, fillStyle: '', strokeStyle: '',
  textAlign: 'right' as CanvasTextAlign,
  textBaseline: 'alphabetic' as CanvasTextBaseline,
  direction: 'rtl' as CanvasDirection,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'high' as ImageSmoothingQuality,
};

const SIZE = { w: 1080, h: 1350 } as const;

function twoItemTimeline(
  aOver: Partial<TrackItem>,
  bOver: Partial<TrackItem>
): Timeline {
  return {
    duration: 4,
    fps: 30,
    size: 'reel',
    tracks: [
      {
        id: 'trkA',
        type: 'text',
        index: 0,
        items: [
          {
            id: 'a',
            start: 0,
            end: 2,
            value: 'قمة عربية طارئة',
            ...aOver,
          },
        ],
      },
      {
        id: 'trkB',
        type: 'text',
        index: 1,
        items: [
          {
            id: 'b',
            start: 0,
            end: 2,
            value: 'قمة عربية طارئة',
            ...bOver,
          },
        ],
      },
    ],
  };
}

function planFor(timeline: Timeline) {
  return buildTimelinePlan({
    timeline,
    brand,
    template: BREAKING,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: mockCtx as any,
    size: SIZE,
  });
}

describe('mk/468 · كشفُ التصادم ثنائيُّ البُعد', () => {
  it('متراكبان حقّاً (نفسُ الزمنِ والأنكورِ بلا إزاحة) ⇒ تحذيرٌ واحد', () => {
    const timeline = twoItemTimeline({}, {});
    const plan = planFor(timeline);
    expect(plan.collisions.length).toBe(1);
    expect(plan.collisions[0]!.overlapSeconds).toBeGreaterThan(0);
    expect(plan.collisions[0]!.yGapPixels).toBeLessThanOrEqual(0);
    expect(plan.collisions[0]!.xGapPixels).toBeLessThanOrEqual(0);
  });

  it('منفصلان أفقيّاً عبر offset.x الكبير ⇒ لا تحذير', () => {
    const timeline = twoItemTimeline(
      { offset: { x: -5000 } },
      { offset: { x: 5000 } },
    );
    const plan = planFor(timeline);
    expect(plan.collisions.length).toBe(0);
  });

  it('منفصلان زمنيّاً ⇒ لا تحذير (حارسُ انحدار)', () => {
    const timeline = twoItemTimeline(
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    );
    const plan = planFor(timeline);
    expect(plan.collisions.length).toBe(0);
  });
});
