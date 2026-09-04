// نظام تصميم mk-studio — نقطة استيراد موحّدة.
//
// **مبادئ:**
// - **RTL-first**: لا `text-left/right` — نستعمل `text-start/end`
//   والخصائص المنطقية (`ms-*`, `pe-*`) كي يعمل المكوّن في الاتجاهين
//   بلا فروع.
// - **مفاتيح i18n لا نصوص**: كل مكوّن يستقبل `*Key` ويترجم عبر
//   `useLocale().t()` (L-22).
// - **بلا نصوص افتراضية**: الاستدعاء يمرّر مفتاحاً صراحةً، لا نخبّئ
//   نصّاً في المكوّن.
// - **حالات صريحة**: `loading`, `invalid`, `disabled` — بلا اجتهاد
//   لتقدير الحالة من props أخرى.

export { Alert } from './Alert';
export { AppShell } from './AppShell';
export { AuthCard, type AuthField } from './AuthCard';
export { AuthShell } from './AuthShell';
export { Badge } from './Badge';
export { Button } from './Button';
export { Card } from './Card';
export { Dialog } from './Dialog';
export { EmptyState } from './EmptyState';
export { Field } from './Field';
export { Input } from './Input';
export { PageHeader } from './PageHeader';
export { Table, type Column, type CellAlign } from './Table';
export { Textarea } from './Textarea';
