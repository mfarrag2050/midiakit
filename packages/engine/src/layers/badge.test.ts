import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import { createMockCtx } from '../text/mock-ctx.js';
import { drawBadge } from './badge.js';

const size = { w: 1080, h: 1080 };

describe('drawBadge — قياسات وألوان من brand.badges.urgent', () => {
  it('يرسم مسار مستدير ثم نصاً في الوسط', () => {
    const ctx = createMockCtx();
    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });

    expect(ctx.fillPathCalls).toHaveLength(1);
    expect(ctx.fillTextCalls).toHaveLength(1);
  });

  it('لون الخلفية = brand.badges.urgent.fill', () => {
    const ctx = createMockCtx();
    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillPathCalls[0]!.fillStyle).toBe(
      DEFAULT_BRAND.badges.urgent.fill
    );
  });

  it('لون النص = brand.badges.urgent.textColor', () => {
    const ctx = createMockCtx();
    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillTextCalls[0]!.fillStyle).toBe(
      DEFAULT_BRAND.badges.urgent.textColor
    );
  });

  it('التسمية = brand.badges.urgent.label', () => {
    const ctx = createMockCtx();
    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillTextCalls[0]!.text).toBe(DEFAULT_BRAND.badges.urgent.label);
  });

  it('تبديل fill في brand يغيّر لون خلفية الشارة', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: { ...DEFAULT_BRAND.badges.urgent, fill: '#00FF00' },
      },
    };
    const ctx = createMockCtx();
    drawBadge(ctx, size, custom, {
      badge: custom.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillPathCalls[0]!.fillStyle).toBe('#00FF00');
  });

  it('تبديل label يغيّر النص', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: { ...DEFAULT_BRAND.badges.urgent, label: 'BREAKING' },
      },
    };
    const ctx = createMockCtx();
    drawBadge(ctx, size, custom, {
      badge: custom.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillTextCalls[0]!.text).toBe('BREAKING');
  });

  it('يستعمل ctx.roundRect إن توفّر (المسار يحمل أمر roundRect)', () => {
    const ctx = createMockCtx();
    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    const path = ctx.fillPathCalls[0]!.path;
    expect(path.some((cmd) => cmd.kind === 'roundRect')).toBe(true);
  });

  it('غياب roundRect ⇒ يبني المسار عبر arcTo (fallback)', () => {
    const ctx = createMockCtx();
    // نُلغي roundRect لمحاكاة بيئة قديمة.
    (ctx as { roundRect?: unknown }).roundRect = undefined;

    drawBadge(ctx, size, DEFAULT_BRAND, {
      badge: DEFAULT_BRAND.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    const path = ctx.fillPathCalls[0]!.path;
    // moveTo + 4×arcTo + close
    expect(path.filter((cmd) => cmd.kind === 'arcTo')).toHaveLength(4);
    expect(path[0]!.kind).toBe('moveTo');
    expect(path[path.length - 1]!.kind).toBe('close');
  });

  it('حجم الخط يأتي من brand.badges.urgent.fontSize', () => {
    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: { ...DEFAULT_BRAND.badges.urgent, fontSize: 72 },
      },
    };
    const ctx = createMockCtx();
    drawBadge(ctx, size, custom, {
      badge: custom.badges.urgent,
      rx: 1000,
      bottomY: 500,
    });
    expect(ctx.fillTextCalls[0]!.font).toContain('72px');
  });
});
