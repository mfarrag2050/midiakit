// 360b (بعد الموعد) · قائمة الخطوط المدمَجة — مصدر واحد للحقيقة.
// ٤٣٠ §١ — أُثريَت البنية بـ`nameAr` (اسم عربيّ للعرض) و`license` (SPDX
// id) وحقلِ `weights` الذي صار كلٌّ منها كائناً يحمل الملفَّ والقيمةَ
// العدديّةَ ومتريكاتِ رأس الخطّ. المعرِضُ في محرّر الهويّة يقرأ من
// هذه القائمة كمصدرٍ وحيد.
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

export interface FontMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly unitsPerEm: number;
}

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
