// 610a (2026-10-07) · إعادة تصدير فقط — القائمة الآن في
// `packages/shared/src/builtin-fonts.ts` ليستوردها `apps/renderer`
// أيضاً. مصدر الحقيقة الوحيد.
//
// **لِمَ لم أترك البيانات هنا وأُنشِئ ثانيةً مكرّرة في shared؟** لأنّ
// المصدرَين يتباعدان بالضرورة بمرور الوقت. مصدرٌ واحدٌ · لا تطابقَ آليّ
// نحتاج حراسته.

export {
  BUILTIN_FONTS,
  BUILTIN_FONT_FILES,
  BUILTIN_FONT_FAMILIES,
  findBuiltinFont,
  type BuiltinFont,
  type BuiltinFontWeight,
} from '@pf-mediakit/shared';
export type { FontMetrics } from '@pf-mediakit/shared';
