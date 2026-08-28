import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import type { BrandKit } from '@pf-mediakit/shared';
import {
  resolve,
  resolveBrand,
  isBrandReference,
  BrandRefError,
} from './resolve.js';

// نُنشئ نسخة اختبار بحيث تحتوي مراجع حرفية للاختبار — نعبث بحقول
// موثّقة على أنها مراجع في المواصفة (badges.urgent.fill,
// logo.watermark.tint).
const brandWithRefs = (): BrandKit => ({
  ...DEFAULT_BRAND,
  colors: { ...DEFAULT_BRAND.colors, urgentBadge: '#C1012F' },
  badges: {
    ...DEFAULT_BRAND.badges,
    urgent: {
      ...DEFAULT_BRAND.badges.urgent,
      fill: 'colors.urgentBadge',
      textColor: 'colors.text',
    },
  },
});

describe('isBrandReference', () => {
  it.each([
    ['colors.urgentBadge', true],
    ['logo.watermark.tint', true],
    ['badges.urgent.fill', true],
    ['#C1012F', false],
    ['rgba(0,0,0,0.5)', false],
    ['IBM Plex Sans Arabic', false],
    ['sans-serif', false],
    ['عاجل', false],
    ['https://example.com/logo.png', false],
    ['nopath', false],
    ['', false],
  ])('«%s» → %s', (input, expected) => {
    expect(isBrandReference(input)).toBe(expected);
  });

  it('لا يعامل غير النصوص كمراجع', () => {
    expect(isBrandReference(42)).toBe(false);
    expect(isBrandReference(true)).toBe(false);
    expect(isBrandReference(null)).toBe(false);
    expect(isBrandReference(undefined)).toBe(false);
    expect(isBrandReference({})).toBe(false);
  });
});

describe('resolve — مرجع بسيط', () => {
  it('يحلّ badges.urgent.fill إلى قيمة colors.urgentBadge', () => {
    const brand = brandWithRefs();
    expect(resolve(brand, 'badges.urgent.fill')).toBe('#C1012F');
    expect(resolve(brand, 'badges.urgent.textColor')).toBe(
      DEFAULT_BRAND.colors.text
    );
  });

  it('يحلّ مراجع 3 مستويات', () => {
    const brand = brandWithRefs();
    // logo.watermark.tint في DEFAULT_BRAND = 'colors.urgentBgTint'
    expect(resolve(brand, 'logo.watermark.tint')).toBe(
      DEFAULT_BRAND.colors.urgentBgTint
    );
  });
});

describe('resolve — قيم حرفية تمرّ كما هي', () => {
  it('لون hex', () => {
    expect(resolve(DEFAULT_BRAND, 'colors.text')).toBe(
      DEFAULT_BRAND.colors.text
    );
  });

  it('عدد', () => {
    expect(resolve(DEFAULT_BRAND, 'badges.urgent.fontSize')).toBe(48);
  });

  it('boolean', () => {
    expect(resolve(DEFAULT_BRAND, 'typography.bidi.enabled')).toBe(true);
  });

  it('سلسلة بلا نمط مرجع (اسم أسرة)', () => {
    expect(resolve(DEFAULT_BRAND, 'fonts.primary.family')).toBe(
      'IBM Plex Sans Arabic'
    );
  });

  it('سلسلة rgba (ليست مرجعاً)', () => {
    expect(resolve(DEFAULT_BRAND, 'shadows.reelTitle.color')).toBe(
      'rgba(20,30,68,0.62)'
    );
  });
});

describe('resolve — مرجع متعدٍ', () => {
  it('يحلّ سلسلة مراجع (a → b → قيمة حرفية)', () => {
    // نبني هوية بها: badges.urgent.fill → 'colors.urgentBadge'
    //                colors.urgentBadge = 'colors.text'      (مرجع)
    //                colors.text        = '#FFFFFF'         (حرفي)
    const brand: BrandKit = {
      ...DEFAULT_BRAND,
      colors: {
        ...DEFAULT_BRAND.colors,
        text: '#FFFFFF',
        urgentBadge: 'colors.text',
      },
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: { ...DEFAULT_BRAND.badges.urgent, fill: 'colors.urgentBadge' },
      },
    };
    expect(resolve(brand, 'badges.urgent.fill')).toBe('#FFFFFF');
  });
});

describe('resolve — مرجع مفقود يرمي (لا يعيد السلسلة صامتاً)', () => {
  it('مسار قمّي غير موجود', () => {
    expect(() => resolve(DEFAULT_BRAND, 'unknown.path')).toThrow(BrandRefError);
    expect(() => resolve(DEFAULT_BRAND, 'unknown.path')).toThrow(/مرجع مفقود/);
  });

  it('مسار مركّب غير موجود', () => {
    expect(() =>
      resolve(DEFAULT_BRAND, 'colors.doesNotExist')
    ).toThrow(BrandRefError);
  });

  it('مرجع متعدٍ يشير لمسار مفقود يرمي على الحلقة الوسيطة', () => {
    const brand: BrandKit = {
      ...DEFAULT_BRAND,
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: { ...DEFAULT_BRAND.badges.urgent, fill: 'colors.ghost' },
      },
    };
    expect(() => resolve(brand, 'badges.urgent.fill')).toThrow(/colors.ghost/);
  });
});

describe('resolve — كشف الحلقات', () => {
  it('حلقة مباشرة a → a', () => {
    const brand: BrandKit = {
      ...DEFAULT_BRAND,
      colors: { ...DEFAULT_BRAND.colors, urgentBadge: 'colors.urgentBadge' },
    };
    expect(() => resolve(brand, 'colors.urgentBadge')).toThrow(/حلقة/);
  });

  it('حلقة غير مباشرة a → b → a', () => {
    // colors.urgentBadge → colors.text ; colors.text → colors.urgentBadge
    const brand: BrandKit = {
      ...DEFAULT_BRAND,
      colors: {
        ...DEFAULT_BRAND.colors,
        urgentBadge: 'colors.text',
        text: 'colors.urgentBadge',
      },
    };
    expect(() => resolve(brand, 'colors.urgentBadge')).toThrow(/حلقة/);
  });
});

describe('resolveBrand — تسطيح كامل قبل الرندر', () => {
  it('DEFAULT_BRAND يُحلّ بلا خطأ', () => {
    expect(() => resolveBrand(DEFAULT_BRAND)).not.toThrow();
  });

  it('badges.urgent.fill يصير قيمة حرفية بعد resolveBrand', () => {
    const brand = brandWithRefs();
    const flat = resolveBrand(brand);
    expect(flat.badges.urgent.fill).toBe('#C1012F');
    expect(flat.badges.urgent.textColor).toBe(DEFAULT_BRAND.colors.text);
  });

  it('logo.watermark.tint يُحلّ في المخرج', () => {
    const flat = resolveBrand(DEFAULT_BRAND);
    expect(flat.logo.watermark.tint).toBe(DEFAULT_BRAND.colors.urgentBgTint);
    // بعد التسطيح لم يعد الحقل مرجعاً.
    expect(isBrandReference(flat.logo.watermark.tint)).toBe(false);
  });

  it('يحافظ على الحقول غير المرجعية بدقّة (أرقام، booleans، مصفوفات)', () => {
    const flat = resolveBrand(DEFAULT_BRAND);
    expect(flat.badges.urgent.fontSize).toBe(48);
    expect(flat.logo.watermark.enabled).toBe(false);
    expect(flat.gradient.shape).toEqual(DEFAULT_BRAND.gradient.shape);
    expect(flat.outputs.instagram).toEqual({ w: 1080, h: 1440 });
  });

  it('يرمي لو أضفنا مرجعاً مكسوراً في مكان ما', () => {
    const broken: BrandKit = {
      ...DEFAULT_BRAND,
      badges: {
        ...DEFAULT_BRAND.badges,
        urgent: {
          ...DEFAULT_BRAND.badges.urgent,
          fill: 'colors.nonexistent',
        },
      },
    };
    expect(() => resolveBrand(broken)).toThrow(BrandRefError);
  });
});
