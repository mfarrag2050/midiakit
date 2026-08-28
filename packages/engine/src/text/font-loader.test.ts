import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { FontFaceSetLike } from './font-loader.js';
import {
  createBrowserFontLoader,
  createManualFontLoader,
  createGatedMeasurer,
  fontStringsForBrand,
} from './font-loader.js';
import { createSyntheticMeasurer } from './measurer.js';
import { parseTokens } from './parse-tokens.js';

describe('fontStringsForBrand', () => {
  it('يبني سلسلة لكل وزن معلَن بحجم قياسي 80px', () => {
    const fonts = fontStringsForBrand(DEFAULT_BRAND);
    expect(fonts).toHaveLength(3);
    expect(fonts[0]).toBe('300 80px "IBM Plex Sans Arabic"');
    expect(fonts[1]).toBe('400 80px "IBM Plex Sans Arabic"');
    expect(fonts[2]).toBe('700 80px "IBM Plex Sans Arabic"');
  });
});

describe('createBrowserFontLoader', () => {
  it('يستدعي fontFaceSet.load لكل وزن ثم يصبح ready', async () => {
    const calls: string[] = [];
    const fake: FontFaceSetLike = {
      load: (font: string) => {
        calls.push(font);
        return Promise.resolve([]);
      },
    };
    const loader = createBrowserFontLoader(fake);
    expect(loader.isReady()).toBe(false);

    const result = await loader.load(DEFAULT_BRAND);
    expect(calls).toHaveLength(3);
    expect(result.loaded).toHaveLength(3);
    expect(result.failed).toEqual([]);
    expect(loader.isReady()).toBe(true);
  });

  it('فشل تحميل وزن واحد يُسجَّل ولا يوقف الجاهزية (fallback مقبول)', async () => {
    const fake: FontFaceSetLike = {
      load: (font: string) =>
        font.startsWith('700')
          ? Promise.reject(new Error('bold missing'))
          : Promise.resolve([]),
    };
    const loader = createBrowserFontLoader(fake);
    const result = await loader.load(DEFAULT_BRAND);
    expect(result.loaded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toContain('700');
    expect(loader.isReady()).toBe(true);
  });
});

describe('createManualFontLoader', () => {
  it('load يبقى معلَّقاً حتى resolve()', async () => {
    const loader = createManualFontLoader();
    const p = loader.load(DEFAULT_BRAND);

    // سباق مع Promise.resolve() — لو load حَلّ فوراً لفاز عليه.
    const winner = await Promise.race([
      p.then(() => 'load'),
      Promise.resolve('control'),
    ]);
    expect(winner).toBe('control');
    expect(loader.isReady()).toBe(false);

    loader.resolve();
    const result = await p;
    expect(result.loaded).toHaveLength(3);
    expect(loader.isReady()).toBe(true);
  });

  it('reject() يرمي في المستقبل', async () => {
    const loader = createManualFontLoader();
    const p = loader.load(DEFAULT_BRAND);
    loader.reject(new Error('boom'));
    await expect(p).rejects.toThrow('boom');
    expect(loader.isReady()).toBe(false);
  });
});

describe('createGatedMeasurer — القياس لا يبدأ قبل اكتمال التحميل', () => {
  it('يرمي قبل load، ثم يعمل بعد resolve', async () => {
    const loader = createManualFontLoader();
    const inner = createSyntheticMeasurer();
    const gated = createGatedMeasurer(loader, inner);
    const [tok] = parseTokens('مرحباً');

    // قبل load — الرمي المتوقع.
    expect(() => gated.word(tok!, 80, false)).toThrow(/ADR-006/);
    expect(() => gated.space(80)).toThrow(/ADR-006/);
    expect(() => gated.line([tok!], 80, false)).toThrow(/ADR-006/);

    const p = loader.load(DEFAULT_BRAND);
    // أثناء الانتظار — لا تزال ready=false، القياس ممنوع.
    expect(() => gated.word(tok!, 80, false)).toThrow(/ADR-006/);

    loader.resolve();
    await p;

    // بعد اكتمال التحميل — النداءات تُمرَّر للـinner بلا رمي.
    expect(loader.isReady()).toBe(true);
    expect(() => gated.word(tok!, 80, false)).not.toThrow();
    expect(gated.word(tok!, 80, false)).toBe(inner.word(tok!, 80, false));
    expect(gated.space(80)).toBe(inner.space(80));
  });
});
