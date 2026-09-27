// ٥٦٥ · اتّجاه الخطّ الزمنيّ من اللغة الفعّالة — دالّتان خالصتان
//
// **القاعدة:** الاتّجاه ليس ثابتاً على `rtl`. اللغة `en` تُقدّم الزمن
// يميناً (LTR: الصفر يساراً · المسطرة 0→N)، بينما `ar` و`mixed` يُبقيان
// السلوك العربيّ (RTL: الصفر يميناً · المسطرة N←0). المصدرُ الوحيد
// للاتّجاه هنا هو نفسُ locale الذي يضبطُ `document.documentElement.dir`
// (packages/i18n/src/LocaleProvider.tsx · DIRECTION).
//
// **الأسهم:** في LTR السهمُ يمضي حيث يشير (→ تقدّماً · ← عَكساً)، وفي
// RTL معكوس (← تقدّماً · → عَكساً). القاعدةُ نفسُها في كلا الاتّجاهين:
// «السهمُ يدٌ تدفعُ جسماً حيث تشير» — والزمنُ يسيرُ بحسب الاتّجاه
// الفيزيائيّ للشريط.

export type UiLocale = 'ar' | 'mixed' | 'en';
export type Dir = 'ltr' | 'rtl';

/** يعيد اتّجاه الخطّ الزمنيّ الذي يجبُ أن يُطابق `document.dir`. */
export function timelineDirFor(locale: UiLocale): Dir {
  return locale === 'en' ? 'ltr' : 'rtl';
}

/**
 * يعيد إشارةَ خطوةِ التحريك من سهمٍ معطى في اتّجاهٍ معطى.
 *   `+1` = تقدّمٌ في الزمن (start يزيد)
 *   `-1` = تراجعٌ في الزمن
 * سهمٌ آخرُ يعيد `0` (لا تحريك).
 */
export function arrowKeyStep(key: string, dir: Dir): -1 | 0 | 1 {
  if (dir === 'ltr') {
    if (key === 'ArrowRight') return 1;
    if (key === 'ArrowLeft') return -1;
  } else {
    if (key === 'ArrowLeft') return 1;
    if (key === 'ArrowRight') return -1;
  }
  return 0;
}
