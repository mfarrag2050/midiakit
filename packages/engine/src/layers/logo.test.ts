import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import { drawLogo } from './logo.js';
import type { ImageLike } from '../text/draw-line.js';

const size = { w: 1080, h: 1080 };
const image: ImageLike = { width: 200, height: 200 };

describe('drawLogo — الحجم والهامش والموضع من brand.logo', () => {
  it('غياب image ⇒ لا يُرسم شيئاً (حراسة صامتة)', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, DEFAULT_BRAND, {});
    expect(ctx.drawImageCalls).toHaveLength(0);
  });

  // الاختبارات تفحص الفولباك القديم (`brand.logo.position/margin`)
  // — نُلغي `placement.logo` كي يفعل الفولباك (docs/03 §placement).
  const legacyBrand = (
    overrides: Partial<BrandKit['logo']> = {}
  ): BrandKit => ({
    ...DEFAULT_BRAND,
    placement: { ...DEFAULT_BRAND.placement, logo: undefined as unknown as never },
    logo: { ...DEFAULT_BRAND.logo, ...overrides },
  });

  it('bottom-left: (margin, H - margin - size, size, size)', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, legacyBrand(), { image });
    const call = ctx.drawImageCalls[0]!;
    const { size: s, margin: m } = DEFAULT_BRAND.logo;
    // moon params: (image, dx, dy, dw, dh)
    expect(call.args).toEqual([m, 1080 - m - s, s, s]);
  });

  it('bottom-right', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, legacyBrand({ position: 'bottom-right' }), { image });
    const { size: s, margin: m } = DEFAULT_BRAND.logo;
    expect(ctx.drawImageCalls[0]!.args).toEqual([
      1080 - m - s,
      1080 - m - s,
      s,
      s,
    ]);
  });

  it('top-right', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, legacyBrand({ position: 'top-right' }), { image });
    const { size: s, margin: m } = DEFAULT_BRAND.logo;
    expect(ctx.drawImageCalls[0]!.args).toEqual([1080 - m - s, m, s, s]);
  });

  it('top-left', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, legacyBrand({ position: 'top-left' }), { image });
    const { size: s, margin: m } = DEFAULT_BRAND.logo;
    expect(ctx.drawImageCalls[0]!.args).toEqual([m, m, s, s]);
  });

  it('تبديل size و margin يغيّر الإحداثيات مباشرة', () => {
    const ctx = createMockCtx();
    drawLogo(ctx, size, legacyBrand({ size: 100, margin: 30 }), { image });
    // bottom-left: (30, 1080 - 30 - 100, 100, 100) = (30, 950, 100, 100)
    expect(ctx.drawImageCalls[0]!.args).toEqual([30, 950, 100, 100]);
  });

  it('حجم الإطار المختلف يبقي الشعار مثبتاً بالنسبة للحواف', () => {
    const ctx = createMockCtx();
    // إطار عمودي 1080×1920، الافتراضي bottom-left.
    drawLogo(ctx, { w: 1080, h: 1920 }, legacyBrand(), { image });
    const { size: s, margin: m } = DEFAULT_BRAND.logo;
    expect(ctx.drawImageCalls[0]!.args).toEqual([m, 1920 - m - s, s, s]);
  });
});
