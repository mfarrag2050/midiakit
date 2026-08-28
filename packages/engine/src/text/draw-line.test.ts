import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { preprocessBidi } from './bidi.js';
import { createSyntheticMeasurer } from './measurer.js';
import { drawLineRTL, drawLineCentered } from './draw-line.js';
import { createMockCtx } from './mock-ctx.js';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';

const measure = createSyntheticMeasurer();

describe('drawLineRTL', () => {
  it('يضبط الاتجاه والمحاذاة والقاعدة إلى RTL/right/alphabetic', () => {
    const ctx = createMockCtx();
    const toks = parseTokens('مرحباً');
    drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    const call = ctx.fillTextCalls[0]!;
    expect(call.textAlign).toBe('right');
    expect(call.direction).toBe('rtl');
    expect(call.textBaseline).toBe('alphabetic');
  });

  it('يستعمل brand.colors.text — لا لون مثبت', () => {
    const toks = parseTokens('مرحباً');

    const ctxA = createMockCtx();
    drawLineRTL(ctxA, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    const custom: BrandKit = {
      ...DEFAULT_BRAND,
      colors: { ...DEFAULT_BRAND.colors, text: '#123456' },
    };
    const ctxB = createMockCtx();
    drawLineRTL(ctxB, measure, toks, 1000, 200, 80, false, custom);

    // القيمة الأولى تخرج من DEFAULT_BRAND.colors.text — لا تُثبَّت في الاختبار
    // كي يبقى الاختبار توثيقاً للفصل، لا لقيمة محايدة معيّنة.
    expect(ctxA.fillTextCalls[0]!.fillStyle).toBe(DEFAULT_BRAND.colors.text);
    expect(ctxB.fillTextCalls[0]!.fillStyle).toBe('#123456');
    // تأكيد الفصل: القيمتان مختلفتان.
    expect(ctxA.fillTextCalls[0]!.fillStyle).not.toBe(
      ctxB.fillTextCalls[0]!.fillStyle
    );
  });

  it('يرسم الكلمات من اليمين إلى اليسار (x تنازلي)', () => {
    const ctx = createMockCtx();
    // مرّر التوكنز جاهزة — parseTokens يعطي الترتيب الرسمي RTL.
    const toks = parseTokens('واحد اثنان ثلاثة');
    drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    const xs = ctx.fillTextCalls.map((c) => c.x);
    // يجب أن يبدأ من rightX تماماً، ثم ينزل يساراً.
    expect(xs[0]).toBe(1000);
    expect(xs[1]).toBeLessThan(xs[0]!);
    expect(xs[2]).toBeLessThan(xs[1]!);
  });

  it('«مؤتمر Brussels للسلام»: ترتيب الرسم صحيح (Brussels بين الكلمتين العربيتين)', () => {
    const ctx = createMockCtx();
    const processed = preprocessBidi('مؤتمر Brussels للسلام');
    const toks = parseTokens(processed);
    drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    const texts = ctx.fillTextCalls.map((c) => c.text);
    expect(texts).toEqual(['مؤتمر', 'Brussels', 'للسلام']);

    const xs = ctx.fillTextCalls.map((c) => c.x);
    // «مؤتمر» في أقصى اليمين، «للسلام» في أقصى اليسار،
    // «Brussels» بينهما بصرياً.
    expect(xs[0]!).toBeGreaterThan(xs[1]!);
    expect(xs[1]!).toBeGreaterThan(xs[2]!);
  });

  it('«التقرير 2026 خطير»: الرقم لا ينقلب في نداء fillText', () => {
    const ctx = createMockCtx();
    const processed = preprocessBidi('التقرير 2026 خطير');
    const toks = parseTokens(processed);
    drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    const texts = ctx.fillTextCalls.map((c) => c.text);
    expect(texts).toContain('2026');
    expect(texts).not.toContain('6202');
  });

  it('يعيد accentFrom/accentTo محيطاً بالكلمة المميّزة', () => {
    const ctx = createMockCtx();
    // «_ب_» فقط مميّزة. مع القياس الصناعي:
    //   fs=80, charWidth=0.5, spaceRatio=0.25.
    //   عرض «أ» = 1×0.5×80 = 40، «ب» = 40، «ج» = 40. مسافة = 20.
    //   rightX=1000. الكلمة الأولى «أ» عند x=1000 (تشغل [960, 1000]).
    //   x -= 40 + 20 = 60 → x=940 لـ«ب» (تشغل [900, 940]).
    //   x -= 60 → x=880 لـ«ج».
    const toks = parseTokens('أ _ب_ ج');
    const r = drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    expect(r.accentFrom).toBe(900);
    expect(r.accentTo).toBe(940);
  });

  it('توكنات متعددة مميّزة تتّسع حدود التمييز', () => {
    const ctx = createMockCtx();
    // «_أ_ _ب_» — كلتاهما مميّزتان.
    const toks = parseTokens('_أ_ _ب_');
    const r = drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);

    // «أ» يشغل [960,1000]، «ب» يشغل [900,940]. التمييز الكلي: [900,1000].
    expect(r.accentFrom).toBe(900);
    expect(r.accentTo).toBe(1000);
  });

  it('لا كلمة مميّزة ⇒ accentFrom/accentTo = null', () => {
    const ctx = createMockCtx();
    const toks = parseTokens('أ ب ج');
    const r = drawLineRTL(ctx, measure, toks, 1000, 200, 80, false, DEFAULT_BRAND);
    expect(r.accentFrom).toBeNull();
    expect(r.accentTo).toBeNull();
  });

  it('توكنز فارغة ⇒ عرض صفر وحدود null', () => {
    const ctx = createMockCtx();
    const r = drawLineRTL(ctx, measure, [], 1000, 200, 80, false, DEFAULT_BRAND);
    expect(r.width).toBe(0);
    expect(r.accentFrom).toBeNull();
    expect(r.accentTo).toBeNull();
    expect(ctx.fillTextCalls).toHaveLength(0);
  });
});

describe('drawLineCentered', () => {
  it('يمركّز حول centerX ويرسم كلمة كلمة يميناً ← يساراً', () => {
    const ctx = createMockCtx();
    // «أ ب ج» بـ fs=80، القياس الصناعي:
    //   عرض كل كلمة = 40، مسافة = 20، إجمالي = 40+20+40+20+40 = 160.
    //   x0 = centerX + 80 = 580.
    const toks = parseTokens('أ ب ج');
    const r = drawLineCentered(
      ctx,
      measure,
      toks,
      500,
      200,
      80,
      false,
      DEFAULT_BRAND
    );

    expect(r.width).toBe(160);
    expect(ctx.fillTextCalls.map((c) => c.x)).toEqual([580, 520, 460]);
    // «ب» عند x=520 — الحافة اليمنى للكلمة المتمركزة عند x=520، عرض 40
    // ⇒ الكلمة تشغل [480, 520]، ومركزها 500 = centerX. ✓
  });

  it('يستعمل brand.colors.text', () => {
    const ctx = createMockCtx();
    const toks = parseTokens('عنوان');
    drawLineCentered(ctx, measure, toks, 500, 200, 80, false, DEFAULT_BRAND);
    expect(ctx.fillTextCalls[0]!.fillStyle).toBe(DEFAULT_BRAND.colors.text);
  });

  it('حدود التمييز محسوبة حول centerX', () => {
    const ctx = createMockCtx();
    // «أ _ب_ ج» — «ب» متمركزة عند centerX=500، عرض 40 ⇒ [480, 520].
    const toks = parseTokens('أ _ب_ ج');
    const r = drawLineCentered(
      ctx,
      measure,
      toks,
      500,
      200,
      80,
      false,
      DEFAULT_BRAND
    );
    expect(r.accentFrom).toBe(480);
    expect(r.accentTo).toBe(520);
  });
});
