// 360b (بعد الموعد) · قائمة الخطوط المدمَجة — مصدر واحد للحقيقة.
//
// **من أين جاءت هذه القائمة:**
// - ملفّات TTF فعليّة على القرص: `assets/fonts/*.ttf` (٧ ملفّات · بعضها
//   فائضٌ عن هذه الخريطة كـAlmarai ExtraBold — يبقى على القرص، ولا يظهر
//   في المُنتقي بعد).
// - قائمة السماح الّتي يخدمها `/api/fonts/[name]`
//   (`apps/studio/app/api/fonts/[name]/route.ts:13-19`).
// - الخريطة المستهلَكة سابقاً في `apps/studio/src/preview/live.ts`
//   (BUILTIN_FONT_FILES) — الآن مشتقّةٌ من هذه القائمة.
//
// **قاعدة:** إن أُضيف خطّ مدمَج جديد، تُضاف كلّ الأوزان الثلاثة (light ·
// regular · bold) لأنّ المنتج يستعمل الثلاثة (الوزنُ الأساس regular ·
// urgent-badge bold · التسميات الفرعيّة light). أَضِف الملفّ إلى
// `assets/fonts/`، إلى قائمة السماح في route.ts، ثمّ إلى هذه القائمة —
// يكشف الاختبار (`builtin-fonts.test.ts`) أيّ فجوة.

export interface BuiltinFont {
  readonly family: string;
  readonly weights: {
    readonly light: string;
    readonly regular: string;
    readonly bold: string;
  };
}

export const BUILTIN_FONTS: readonly BuiltinFont[] = [
  {
    family: 'IBM Plex Sans Arabic',
    weights: {
      light: 'IBMPlexSansArabic-Light.ttf',
      regular: 'IBMPlexSansArabic-Regular.ttf',
      bold: 'IBMPlexSansArabic-Bold.ttf',
    },
  },
  {
    family: 'Almarai',
    weights: {
      light: 'Almarai-Light.ttf',
      regular: 'Almarai-Regular.ttf',
      bold: 'Almarai-Bold.ttf',
    },
  },
];

/** خريطة العائلة → ملفّات الأوزان · للاستهلاك في `preview/live.ts`. */
export const BUILTIN_FONT_FILES: Record<string, BuiltinFont['weights']> =
  Object.fromEntries(BUILTIN_FONTS.map((f) => [f.family, f.weights]));

/** الأسماء وحدها · للاستهلاك في مُنتقي الخطّ في محرّر الهويّة. */
export const BUILTIN_FONT_FAMILIES: readonly string[] =
  BUILTIN_FONTS.map((f) => f.family);
