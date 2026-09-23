// mk/467 · اختبار حارس `TrackItem.fsScale` — الدرجاتُ الثلاث فقط.
//
// **العقد (467 §١):** `fsScale` اختياريّ · القيم المسموحة: `0.8`، `1.0`،
// `1.2` · غياب ⇒ `1` (صفر تغيّر). أيّ قيمةٍ أخرى (بما فيها NaN وسالبٌ
// وقيمٌ بين الدرجات) ⇒ رمي يسمّي القطعةَ والقيمة (قاعدة 466: معلَمةٌ
// واجبةٌ مشوَّهةٌ = رمي).

import { describe, expect, it } from 'vitest';
import type { Timeline, TrackItem, BrandKit } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

import { buildTimelinePlan } from './plan.js';
import { resolveBrand } from '../brand/resolve.js';
import { createMockCtx } from '../text/mock-ctx.js';

const brand: BrandKit = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1350 } as const;
const template = { name: 'breaking', layers: [] } as unknown as Template;

function tlWithItem(over: Partial<TrackItem>): Timeline {
  return {
    duration: 2,
    fps: 30,
    size: 'reel',
    tracks: [
      {
        id: 'trk',
        type: 'text',
        index: 0,
        items: [
          {
            id: 'itm',
            start: 0,
            end: 2,
            value: 'قمة عربية طارئة',
            ...over,
          },
        ],
      },
    ],
  };
}

describe('mk/467 · TrackItem.fsScale — الدرجاتُ الثلاثُ المسموحة', () => {
  const cases: readonly [number | undefined, string][] = [
    [undefined, 'غائبٌ (الافتراضي)'],
    [0.8, '0.8'],
    [1.0, '1.0'],
    [1.2, '1.2'],
  ];
  for (const [scale, label] of cases) {
    it(`fsScale=${label} ⇒ لا يرمي`, () => {
      const timeline = tlWithItem(scale === undefined ? {} : { fsScale: scale });
      const ctx = createMockCtx();
      expect(() =>
        buildTimelinePlan({ ctx, size: SIZE, template, brand, timeline })
      ).not.toThrow();
    });
  }
});

describe('mk/467 · TrackItem.fsScale — القيمُ خارج المجموعة تُرمى', () => {
  const bad: readonly [unknown, string][] = [
    [0.5, '0.5'],
    [1.1, '1.1'],
    [1.5, '1.5'],
    [2, '2'],
    [-0.8, 'سالب'],
    [NaN, 'NaN'],
  ];
  for (const [scale, label] of bad) {
    it(`fsScale=${label} ⇒ يرمي يسمّي القطعةَ والقيمة`, () => {
      const timeline = tlWithItem({ fsScale: scale as number });
      const ctx = createMockCtx();
      expect(() =>
        buildTimelinePlan({ ctx, size: SIZE, template, brand, timeline })
      ).toThrow(/prepareTextItem.*fsScale=.*trk:itm/);
    });
  }
});
