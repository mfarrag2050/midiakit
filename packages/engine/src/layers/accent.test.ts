import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import { drawAccentBar, drawAccentSpan } from './accent.js';

const size = { w: 1080, h: 1080 };

describe('drawAccentBar — قضيب متمركز', () => {
  it('يرسم مستطيلاً بعرض w حول cx بارتفاع من brand', () => {
    const ctx = createMockCtx();
    drawAccentBar(ctx, size, DEFAULT_BRAND, { cx: 540, y: 800, w: 300 });

    const rect = ctx.fillRectCalls[0]!;
    // cx - w/2 = 540 - 150 = 390
    expect(rect.x).toBe(390);
    expect(rect.y).toBe(800);
    expect(rect.w).toBe(300);
    expect(rect.h).toBe(DEFAULT_BRAND.typography.accentBar.height);
  });

  it('يستعمل brand.colors.accent', () => {
    const ctx = createMockCtx();
    drawAccentBar(ctx, size, DEFAULT_BRAND, { cx: 540, y: 800, w: 300 });
    expect(ctx.fillRectCalls[0]!.fillStyle).toBe(DEFAULT_BRAND.colors.accent);
  });

  it('تبديل brand.colors.accent يغيّر لون الرسم', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      colors: { ...DEFAULT_BRAND.colors, accent: '#DEADBE' },
    };
    const ctx = createMockCtx();
    drawAccentBar(ctx, size, custom, { cx: 540, y: 800, w: 300 });
    expect(ctx.fillRectCalls[0]!.fillStyle).toBe('#DEADBE');
  });

  it('تبديل brand.typography.accentBar.height يغيّر الارتفاع', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      typography: {
        ...DEFAULT_BRAND.typography,
        accentBar: { ...DEFAULT_BRAND.typography.accentBar, height: 24 },
      },
    };
    const ctx = createMockCtx();
    drawAccentBar(ctx, size, custom, { cx: 540, y: 800, w: 300 });
    expect(ctx.fillRectCalls[0]!.h).toBe(24);
  });
});

describe('drawAccentSpan — قضيب ممتد بين x0 و x1', () => {
  it('يرسم من x0 بعرض (x1 - x0)', () => {
    const ctx = createMockCtx();
    drawAccentSpan(ctx, size, DEFAULT_BRAND, { x0: 100, x1: 400, y: 500 });

    const rect = ctx.fillRectCalls[0]!;
    expect(rect.x).toBe(100);
    expect(rect.w).toBe(300);
    expect(rect.y).toBe(500);
  });

  it('يستعمل نفس اللون والارتفاع كـ drawAccentBar', () => {
    const ctx = createMockCtx();
    drawAccentSpan(ctx, size, DEFAULT_BRAND, { x0: 100, x1: 400, y: 500 });
    const rect = ctx.fillRectCalls[0]!;
    expect(rect.fillStyle).toBe(DEFAULT_BRAND.colors.accent);
    expect(rect.h).toBe(DEFAULT_BRAND.typography.accentBar.height);
  });
});
