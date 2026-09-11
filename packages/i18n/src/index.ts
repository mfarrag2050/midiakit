// @pf-mediakit/i18n — نظام لغات مشترك لتطبيقات Media Kit.
//
// **مصدر الحقيقة:** كان `apps/studio/src/i18n/` قبل استخراج S2-X
// (2026-09-05). دشبورد `apps/dashboard` **لم يُهاجَر** — يحمل نسخة
// موازية بمفتاح `pfmk.dashboard.locale`. تذكرة الهجرة مستقلة بعد S7.
//
// **قواعد استعمال:**
// - `<LocaleProvider>` يُلفّ التطبيق كاملاً في `app/layout.tsx`.
// - `useLocale().t('key')` لكل نصّ يظهر للمستخدم (L-22).
// - المفاتيح `_*` توثيق داخلي — لا تُترجم.

export { LocaleProvider, useLocale, type Locale } from './LocaleProvider';
export { LocaleSwitcher } from './LocaleSwitcher';
export { Ltr } from './Ltr';
