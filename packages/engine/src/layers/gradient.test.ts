import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import type { RecordedGradient } from '../text/mock-ctx.js';
import { drawGradient } from './gradient.js';

const size = { w: 1080, h: 1080 };

const gradientOf = (ctx: ReturnType<typeof createMockCtx>): RecordedGradient => {
  const call = ctx.fillRectCalls[0]!;
  return call.fillStyle as RecordedGradient;
};

describe('drawGradient — direction=bottom', () => {
  it('يبني تدرّجاً رأسياً من H إلى 0 (من الأسفل للأعلى)', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, { direction: 'bottom' });

    const g = gradientOf(ctx);
    expect(g.x0).toBe(0);
    expect(g.y0).toBe(1080);
    expect(g.x1).toBe(0);
    expect(g.y1).toBe(0);
  });

  it('يستعمل brand.gradient.shape (لا CV_GRAD_SHAPE مثبت)', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, {
      direction: 'top',
      opacity: 1,
      reach: 1,
    });

    // عدد نقاط التوقّف = عدد نقاط shape (+1 نهائية عند reach<0.999 — هنا reach=1).
    const g = gradientOf(ctx);
    expect(g.stops).toHaveLength(DEFAULT_BRAND.gradient.shape.length);
  });

  it('تبديل shape في brand يبدّل نقاط التوقّف', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      gradient: {
        ...DEFAULT_BRAND.gradient,
        shape: [
          [0, 1],
          [0.92, 0],
        ],
      },
    };
    const ctx = createMockCtx();
    drawGradient(ctx, size, custom, {
      direction: 'top',
      opacity: 1,
      reach: 1,
    });

    const g = gradientOf(ctx);
    expect(g.stops).toHaveLength(2);
  });

  it('opacity يضرب في alpha لكل نقطة', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, {
      direction: 'top',
      opacity: 0.5,
      reach: 1,
    });

    const g = gradientOf(ctx);
    // أول نقطة في shape: [0, 1] ⇒ alpha = 1 * 0.5 = 0.500
    expect(g.stops[0]!.color).toBe('rgba(0,0,0,0.500)');
  });

  it('reach < 0.999 يضيف نقطة نهائية شفافة عند 1', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, {
      direction: 'bottom',
      opacity: 1,
      reach: 0.5,
    });

    const g = gradientOf(ctx);
    const last = g.stops[g.stops.length - 1]!;
    expect(last.offset).toBe(1);
    expect(last.color).toBe('rgba(0,0,0,0)');
  });

  it('opacity/reach يسقطان إلى قيم brand الافتراضية عند غيابهما', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, { direction: 'top' });

    const g = gradientOf(ctx);
    // defaultOpacity = 0.72، defaultReach = 0.9 ⇒ reach<0.999 ⇒ نقطة إضافية.
    expect(g.stops).toHaveLength(DEFAULT_BRAND.gradient.shape.length + 1);
    // أول نقطة: alpha = 1 * 0.72 = 0.720
    expect(g.stops[0]!.color).toBe('rgba(0,0,0,0.720)');
  });
});

describe('drawGradient — direction=center', () => {
  it('يستعمل brand.gradient.band لا shape', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, size, DEFAULT_BRAND, {
      direction: 'center',
      opacity: 1,
    });

    const g = gradientOf(ctx);
    // band في DEFAULT_BRAND فيه 7 نقاط ⇒ 7 نقاط توقّف (لا نقطة نهائية إضافية).
    expect(g.stops).toHaveLength(DEFAULT_BRAND.gradient.band.length);
  });

  it('تبديل band في brand يبدّل التدرّج', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      gradient: {
        ...DEFAULT_BRAND.gradient,
        band: [
          [0, 0.1],
          [0.5, 0.9],
          [1, 0.1],
        ],
      },
    };
    const ctx = createMockCtx();
    drawGradient(ctx, size, custom, { direction: 'center', opacity: 1 });

    const g = gradientOf(ctx);
    expect(g.stops).toHaveLength(3);
    // النقطة الوسطى: alpha = 0.9 * 1 = 0.900
    expect(g.stops[1]!.color).toBe('rgba(0,0,0,0.900)');
  });

  it('التدرّج المركزي محور رأسي (x0=x1=0, y0=0, y1=H)', () => {
    const ctx = createMockCtx();
    drawGradient(ctx, { w: 1080, h: 1920 }, DEFAULT_BRAND, {
      direction: 'center',
    });

    const g = gradientOf(ctx);
    expect(g.x0).toBe(0);
    expect(g.y0).toBe(0);
    expect(g.x1).toBe(0);
    expect(g.y1).toBe(1920);
  });
});
