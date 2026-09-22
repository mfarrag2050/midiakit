// mk/465 · حراسة NaN في مؤثّرات draw-timeline-at.
//
// **العلّة (§٠):** `applyKenBurns` كان يحسب `from + (to - from) * p`،
// فإن غاب أحدُهما (نوع الـeffect مغطًّى بـ`as` عند dispatch:438) فالنتيجة
// `NaN`. ثمّ `NaN === 1` كاذبة، فيصلُ `ctx.scale(NaN, NaN)` إلى القماش،
// فتُسمَّم مصفوفةُ التحويل وتُمحى بقيّةُ الإطار — **بلا خطأ**.
//
// هذا الاختبار يُثبت السلوكَ المُرجوّ بعد §١: `applyKenBurns` **يرمي
// خطأً يسمّي المؤثّر والعنصر** حين تكون `from` أو `to` غيرَ رقمٍ منتهٍ،
// و**لا يصلُ NaN إلى `ctx.scale` أبداً**.
//
// القياسُ القبل/بعد في التقرير: بلا هذا الاختبار كان الإطارُ يخرج فارغاً
// بلا throw (تحقّقتُ عبر أثر `ops` من createMockCtx: ظهر `{type:'scale',
// sx:NaN, sy:NaN}` — الإطارُ ملطَّخ).

import { describe, expect, it } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';

import { drawTimelineAt } from './draw-timeline-at.js';
import { createMockCtx } from '../text/mock-ctx.js';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '../brand/resolve.js';

// ── حزمة الحدّ الأدنى ──────────────────────────────

const brand = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1350 } as const;

/** قالب لا يستعمله المؤثّر — المُلاحَظ خرج `ctx.scale` وحده. */
const emptyTemplate: Template = { name: 't', layers: [] } as unknown as Template;

/** خطّ زمنيّ بمسار وحيدٍ وعنصرٍ وحيدٍ يحمل `kenBurns` بلا `from`/`to`. */
function timelineWithMalformedKenBurns(): Timeline {
  return {
    duration: 2,
    fps: 30,
    size: 'reel',
    tracks: [
      {
        id: 'trk',
        type: 'media',
        index: 0,
        items: [
          {
            id: 'itm',
            start: 0,
            end: 2,
            // النوعُ في draw-timeline-at.ts:144 يوجب `from: number` و
            // `to: number`. الـ`as` في dispatch:438 يُسكت TypeScript،
            // فنُمرِّرُه هنا مقصوداً لإثبات الحارس.
            effects: [{ ref: 'kb', type: 'kenBurns' } as never],
          },
        ],
      },
    ],
  };
}

describe('mk/465 · applyKenBurns · حارس NaN', () => {
  it('kenBurns بلا `from`/`to` ⇒ يرمي خطأً يسمّي المؤثّر · لا يصل NaN إلى ctx.scale', () => {
    const ctx = createMockCtx();
    const timeline = timelineWithMalformedKenBurns();

    // (١) الرمي — الشرطُ الأساسيّ للحارس.
    expect(() =>
      drawTimelineAt({
        ctx,
        size: SIZE,
        timeline,
        brand,
        template: emptyTemplate,
        content: {},
        t: 1,
      })
    ).toThrow(/kenBurns/i);

    // (٢) بالخصوص: لا `scale(NaN, NaN)` سُجِّل — الحارسُ رمى قبل الوصول.
    const scaleOps = ctx.ops.filter((o) => o.type === 'scale');
    for (const op of scaleOps) {
      const s = op as { type: 'scale'; sx: number; sy: number };
      expect(Number.isFinite(s.sx)).toBe(true);
      expect(Number.isFinite(s.sy)).toBe(true);
    }
  });

  it('kenBurns بـ`from`/`to` صحيحَين ⇒ يعمل بلا خطأ · ctx.scale بمنتهٍ', () => {
    const ctx = createMockCtx();
    const timeline: Timeline = {
      duration: 2,
      fps: 30,
      size: 'reel',
      tracks: [
        {
          id: 'trk',
          type: 'media',
          index: 0,
          items: [
            {
              id: 'itm',
              start: 0,
              end: 2,
              effects: [{ ref: 'kb', type: 'kenBurns', from: 1, to: 1.2 } as never],
            },
          ],
        },
      ],
    };

    expect(() =>
      drawTimelineAt({
        ctx,
        size: SIZE,
        timeline,
        brand,
        template: emptyTemplate,
        content: {},
        t: 1,
      })
    ).not.toThrow();

    const scaleOps = ctx.ops.filter((o) => o.type === 'scale');
    expect(scaleOps.length).toBeGreaterThan(0);
    for (const op of scaleOps) {
      const s = op as { type: 'scale'; sx: number; sy: number };
      expect(Number.isFinite(s.sx)).toBe(true);
      expect(Number.isFinite(s.sy)).toBe(true);
    }
  });
});
