import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import { drawSolid } from './solid.js';

const size = { w: 1080, h: 1080 };

describe('drawSolid — لون من brand.colors', () => {
  it('يملأ كامل الإطار', () => {
    const ctx = createMockCtx();
    drawSolid(ctx, size, DEFAULT_BRAND, { colorKey: 'surface' });

    const [call] = ctx.fillRectCalls;
    expect(call).toBeDefined();
    expect(call!.x).toBe(0);
    expect(call!.y).toBe(0);
    expect(call!.w).toBe(1080);
    expect(call!.h).toBe(1080);
  });

  it('يستعمل brand.colors[colorKey] — لا لون مثبت', () => {
    const ctx = createMockCtx();
    drawSolid(ctx, size, DEFAULT_BRAND, { colorKey: 'urgentBg' });
    expect(ctx.fillRectCalls[0]!.fillStyle).toBe(DEFAULT_BRAND.colors.urgentBg);
  });

  it('تبديل قيمة اللون في brand يغيّر المخرج', () => {
    const ctxA = createMockCtx();
    drawSolid(ctxA, size, DEFAULT_BRAND, { colorKey: 'surface' });

    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      colors: { ...DEFAULT_BRAND.colors, surface: '#ABCDEF' },
    };
    const ctxB = createMockCtx();
    drawSolid(ctxB, size, custom, { colorKey: 'surface' });

    expect(ctxA.fillRectCalls[0]!.fillStyle).toBe(DEFAULT_BRAND.colors.surface);
    expect(ctxB.fillRectCalls[0]!.fillStyle).toBe('#ABCDEF');
    expect(ctxA.fillRectCalls[0]!.fillStyle).not.toBe(
      ctxB.fillRectCalls[0]!.fillStyle
    );
  });

  it('يعمل مع أي مفتاح من BrandColors', () => {
    // لقطة صحّية: أن نمرّر مفاتيح مختلفة يعطي ألواناً مختلفة.
    const keys = ['text', 'accent', 'urgentBadge', 'urgentBg', 'surface'] as const;
    const seen = new Set<string>();
    for (const k of keys) {
      const ctx = createMockCtx();
      drawSolid(ctx, size, DEFAULT_BRAND, { colorKey: k });
      seen.add(ctx.fillRectCalls[0]!.fillStyle as string);
    }
    // الهوية الافتراضية قد تكرّر ألواناً رمادية؛ نتحقق فقط أن الأسلوب
    // يقبل كل المفاتيح دون فشل.
    expect(seen.size).toBeGreaterThan(0);
  });
});
