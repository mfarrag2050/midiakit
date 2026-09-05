// @pf-mediakit/ui — نظام تصميم مشترك (استُخرج من apps/studio/src/ui
// في S2-X، 2026-09-05).
//
// **مبادئ:**
// - **RTL-first**: لا `text-left/right` ولا `ml/mr/pl/pr` — فقط الخصائص
//   المنطقية (`ms-*`, `pe-*`, `text-start/end`). يفرضه check-logical-props.
// - **مفاتيح i18n لا نصوص**: كل مكوّن يستقبل `*Key` ويترجم عبر
//   `useLocale().t()` (L-22). يفرضه check-ui-keys.
// - **صفر اعتماد على Next**: هذه الحزمة تعيش في أيّ تطبيق React.
//   القشور الحاملة للتنقّل (AppShell, AuthShell, AuthCard) تبقى داخل
//   التطبيق المستهلك.
//
// **الأنماط:**
// - المستهلك يستورد `@pf-mediakit/ui/tailwind-preset` في `tailwind.config`.
// - المستهلك يستورد `@pf-mediakit/ui/styles/tokens.css` من globals.css.

export { Alert } from './Alert';
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
