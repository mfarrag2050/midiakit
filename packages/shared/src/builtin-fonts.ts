// BUILTIN_FONTS — مصدر الحقيقة الوحيد لقائمة الخطوط المدمَجة.
//
// **610a (2026-10-07):** انتقلت القائمة من `apps/studio/src/lib/builtin-fonts.ts`
// إلى هنا لأنّ `apps/renderer/src/api-worker.ts` كان يحتاج استيراد نفس
// البيانات لتسجيل الخطوط في `FontLibrary` عند الإقلاع، والعاملُ لا
// يستورد من الاستوديو. الآن الاثنان يستوردان من `@pf-mediakit/shared`.
//
// **قاعدة ٣٩٤ (لا تُخالَف):** كلُّ خطٍّ يدخل هذه القائمة يحمل `license`
// من {`OFL-1.1`, `Apache-2.0`} وله ملفُّ رخصةٍ في `assets/fonts/`.
// حارسُ `check:builtin-fonts-license` يفشل البناءَ إن غاب أحدهما.
//
// **الأوزان الثلاثة (light · regular · bold):** المنتج يستعمل الثلاثة
// (الأساس regular · urgent-badge bold · التسميات الفرعيّة light).
// `assets/fonts/Almarai-ExtraBold.ttf` موجودٌ على القرص بمتريكاتٍ صحيحة،
// لكنّه خارج المعرِض في هذه المرحلة لأنّ عقدَ `BrandKit.fonts.primary.weights`
// في `packages/shared` يحصر الأوزان في {light,regular,bold}. توسيعُ العقد
// يتبعها بندٌ منفصل. **`assets/fonts/` أصلٌ باقٍ · لا حذفَ لمِلفٍّ.**

import type { FontMetrics } from './brand-kit.js';

export interface BuiltinFontWeight {
  readonly file: string; // اسم الملفّ تحت assets/fonts/
  readonly value: number; // 100–900 (CSS weight)
  readonly labelKey: string; // مفتاح i18n للتسمية العربيّة (خفيف · عادي · غامق)
  readonly metrics: FontMetrics;
}

export interface BuiltinFont {
  readonly family: string; // الاسم بحسب name table في TTF — يُمرَّر لـCanvas
  readonly nameAr: string; // للعرض في المعرِض
  readonly license: 'OFL-1.1' | 'Apache-2.0';
  readonly licenseFile: string; // اسم ملفّ الرخصة تحت assets/fonts/
  readonly weights: {
    readonly light: BuiltinFontWeight;
    readonly regular: BuiltinFontWeight;
    readonly bold: BuiltinFontWeight;
  };
  /** ما يُظهَر في بطاقة المعرِض — نصٌّ عربيٌّ حقيقيٌّ لا «Aa». */
  readonly sampleAr: string;
}

// المتريكات كلّها OS/2 typo (source='typo' من extractFontMetrics) —
// قيست بـ `node --import tsx scripts/measure-font-metrics.mjs assets/fonts/*.ttf`
// (BASELINE-A · 2026-09-11 · L-73).
export const BUILTIN_FONTS: readonly BuiltinFont[] = [
  {
    family: 'IBM Plex Sans Arabic',
    nameAr: 'IBM بلِكس سانس عربي',
    license: 'OFL-1.1',
    licenseFile: 'OFL.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'IBMPlexSansArabic-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 },
      },
      regular: {
        file: 'IBMPlexSansArabic-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 },
      },
      bold: {
        file: 'IBMPlexSansArabic-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 1085, descent: 415, unitsPerEm: 1000 },
      },
    },
  },
  {
    family: 'Almarai',
    nameAr: 'المرعي',
    license: 'OFL-1.1',
    licenseFile: 'OFL-Almarai.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'Almarai-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 905, descent: 211, unitsPerEm: 1000 },
      },
      regular: {
        file: 'Almarai-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 905, descent: 211, unitsPerEm: 1000 },
      },
      bold: {
        file: 'Almarai-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 905, descent: 211, unitsPerEm: 1000 },
      },
    },
  },
  // 610 §1 — الخمسة الجديدة. المصدر: google/fonts @ 7085eb89.
  // التنصيف للمتغيّرات تمّ بـ`fontTools.varLib.instancer` 4.66.1 (المسار
  // في تقرير 610 — scripts/610-instance-fonts.py).
  {
    family: 'Noto Sans Arabic',
    nameAr: 'نوتو سانس عربي',
    license: 'OFL-1.1',
    licenseFile: 'OFL-NotoSansArabic.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'NotoSansArabic-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 1374, descent: 738, unitsPerEm: 1000 },
      },
      regular: {
        file: 'NotoSansArabic-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 1374, descent: 738, unitsPerEm: 1000 },
      },
      bold: {
        file: 'NotoSansArabic-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 1374, descent: 738, unitsPerEm: 1000 },
      },
    },
  },
  {
    family: 'Cairo',
    nameAr: 'القاهرة',
    license: 'OFL-1.1',
    licenseFile: 'OFL-Cairo.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'Cairo-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 1303, descent: 571, unitsPerEm: 1000 },
      },
      regular: {
        file: 'Cairo-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 1303, descent: 571, unitsPerEm: 1000 },
      },
      bold: {
        file: 'Cairo-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 1303, descent: 571, unitsPerEm: 1000 },
      },
    },
  },
  {
    family: 'Tajawal',
    nameAr: 'تجوال',
    license: 'OFL-1.1',
    licenseFile: 'OFL-Tajawal.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      // Tajawal — ملفّات ثابتة أصلاً (ليست variable). المتريكات تختلف
      // قليلاً بين الـLight وأخويه (BASELINE-A يحمل الحقل على مستوى الوزن).
      light: {
        file: 'Tajawal-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 645, descent: 355, unitsPerEm: 1000 },
      },
      regular: {
        file: 'Tajawal-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 643, descent: 357, unitsPerEm: 1000 },
      },
      bold: {
        file: 'Tajawal-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 643, descent: 357, unitsPerEm: 1000 },
      },
    },
  },
  {
    family: 'Noto Naskh Arabic',
    // ملاحظة صريحة (التذكرة §1): نطاق wght لـNotoNaskhArabic هو 400-700،
    // لا 300. فـ`light` هنا نسخة من `regular` (wght=400) — ليستقرّ العقد
    // على ثلاثة أوزان دائماً. المستخدم الذي يختار «خفيف» سيرى regular.
    nameAr: 'نوتو نسخ عربي (خفيف ≡ عادي؛ نطاق المتغيّر 400–700)',
    license: 'OFL-1.1',
    licenseFile: 'OFL-NotoNaskhArabic.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'NotoNaskhArabic-Light.ttf',
        value: 400, // = Regular; wght 400 أدنى في المتغيّر الأصل
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 1069, descent: 634, unitsPerEm: 1000 },
      },
      regular: {
        file: 'NotoNaskhArabic-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 1069, descent: 634, unitsPerEm: 1000 },
      },
      bold: {
        file: 'NotoNaskhArabic-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 1069, descent: 634, unitsPerEm: 1000 },
      },
    },
  },
  {
    family: 'Noto Kufi Arabic',
    nameAr: 'نوتو كوفي عربي',
    license: 'OFL-1.1',
    licenseFile: 'OFL-NotoKufiArabic.txt',
    sampleAr: 'الوكالة تُعلن — خبرٌ عاجلٌ من ميدان الحدث',
    weights: {
      light: {
        file: 'NotoKufiArabic-Light.ttf',
        value: 300,
        labelKey: 'pages.brandKits.editor.font.weight.light',
        metrics: { ascent: 1282, descent: 615, unitsPerEm: 1000 },
      },
      regular: {
        file: 'NotoKufiArabic-Regular.ttf',
        value: 400,
        labelKey: 'pages.brandKits.editor.font.weight.regular',
        metrics: { ascent: 1282, descent: 615, unitsPerEm: 1000 },
      },
      bold: {
        file: 'NotoKufiArabic-Bold.ttf',
        value: 700,
        labelKey: 'pages.brandKits.editor.font.weight.bold',
        metrics: { ascent: 1282, descent: 615, unitsPerEm: 1000 },
      },
    },
  },
];

/** خريطة العائلة → أسماء ملفّات الأوزان الثلاثة · التوقيع القديم
 *  للاستهلاك في `preview/live.ts` (يقبل أسماءَ ملفّات، لا كائنات وزن). */
export const BUILTIN_FONT_FILES: Record<
  string,
  { light: string; regular: string; bold: string }
> = Object.fromEntries(
  BUILTIN_FONTS.map((f) => [
    f.family,
    {
      light: f.weights.light.file,
      regular: f.weights.regular.file,
      bold: f.weights.bold.file,
    },
  ])
);

/** الأسماء وحدها · للاستهلاك في مُنتقي الخطّ في محرّر الهويّة. */
export const BUILTIN_FONT_FAMILIES: readonly string[] =
  BUILTIN_FONTS.map((f) => f.family);

/** ابحث عن خطٍّ مدمَج بالاسم الرسميّ (family). */
export function findBuiltinFont(family: string): BuiltinFont | undefined {
  return BUILTIN_FONTS.find((f) => f.family === family);
}
