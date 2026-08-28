import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import { drawImage } from './image.js';
import type { ImageLike } from '../text/draw-line.js';

const size = { w: 1080, h: 1080 };

const img = (width: number, height: number): ImageLike => ({ width, height });

describe('drawImage — cover تلقائي', () => {
  it('صورة عريضة (ir > tr) ⇒ يقتطع أفقياً، يبقي كامل الارتفاع', () => {
    const ctx = createMockCtx();
    // ir = 2000/1000 = 2، tr = 1080/1080 = 1 ⇒ ir > tr.
    drawImage(ctx, size, DEFAULT_BRAND, { image: img(2000, 1000) });

    const call = ctx.drawImageCalls[0]!;
    // 9 وسائط: sx, sy, sw, sh, dx, dy, dw, dh
    expect(call.args).toEqual([500, 0, 1000, 1000, 0, 0, 1080, 1080]);
  });

  it('صورة طويلة (ir < tr) ⇒ يقتطع رأسياً، يبقي كامل العرض', () => {
    const ctx = createMockCtx();
    // ir = 1000/2000 = 0.5، tr = 1 ⇒ ir < tr.
    drawImage(ctx, size, DEFAULT_BRAND, { image: img(1000, 2000) });

    const call = ctx.drawImageCalls[0]!;
    expect(call.args).toEqual([0, 500, 1000, 1000, 0, 0, 1080, 1080]);
  });

  it('crop صريح يُستعمل مباشرة بلا حساب', () => {
    const ctx = createMockCtx();
    drawImage(ctx, size, DEFAULT_BRAND, {
      image: img(3000, 3000),
      crop: { sx: 100, sy: 200, sw: 800, sh: 900 },
    });

    const call = ctx.drawImageCalls[0]!;
    expect(call.args).toEqual([100, 200, 800, 900, 0, 0, 1080, 1080]);
  });

  it('يُفعِّل imageSmoothing بجودة عالية قبل الرسم', () => {
    const ctx = createMockCtx();
    drawImage(ctx, size, DEFAULT_BRAND, { image: img(1080, 1080) });

    const call = ctx.drawImageCalls[0]!;
    expect(call.imageSmoothingEnabled).toBe(true);
    expect(call.imageSmoothingQuality).toBe('high');
  });

  it('حجم الإطار المختلف يغيّر إحداثيات الوجهة', () => {
    const ctx = createMockCtx();
    // إطار عمودي 1080×1920.
    drawImage(
      ctx,
      { w: 1080, h: 1920 },
      DEFAULT_BRAND,
      { image: img(1080, 1080) }
    );

    const call = ctx.drawImageCalls[0]!;
    // dw, dh (الأربعة الأخيرة): 0,0,1080,1920.
    expect(call.args.slice(-4)).toEqual([0, 0, 1080, 1920]);
  });
});
