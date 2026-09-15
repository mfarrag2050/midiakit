// 340 · التسمية الموحّدة للأدوار السبعة.
//
// **المبدأ:** القيمة التقنيّة (`writer` · `editor` · …) تبقى كما هي في
// العقد وقواعد البيانات وrequiredRole — لا نغيّرها. **الاسم المعروض
// للمحرِّر** يمرّ عبر هذا الملف · نقطة الترجمة الوحيدة.
//
// الأسماء والجُمل الشارحة مُقرَّة في `_AMEND-340b-THE-SEVEN-NAMES.md`
// وموجودة في `packages/i18n/src/{ar,mixed,en}.json` تحت `roles.*`.
//
// **قاعدة السقوط الآمن:** إن ورد دورٌ لا نعرفه (من preset مخصَّص أو
// خادم أضاف قيمة قبل تحديث الترجمة)، نُعيد القيمة التقنيّة كما هي — كي
// لا يرى المحرّر «roles.unknown.name» في الشاشة.

type TranslateFn = (key: string, params?: Record<string, string>) => string;

const KNOWN_ROLES: ReadonlySet<string> = new Set([
  'owner',
  'admin',
  'writer',
  'editor',
  'reviewer',
  'approver',
  'viewer',
]);

export function roleName(t: TranslateFn, role: string): string {
  if (!KNOWN_ROLES.has(role)) return role;
  return t(`roles.${role}.name`);
}

export function roleHint(t: TranslateFn, role: string): string {
  if (!KNOWN_ROLES.has(role)) return '';
  return t(`roles.${role}.hint`);
}

/** يُصدَّر للاختبار — يتحقّق أنّ كل دور في القاموس. */
export const ROLE_KEYS = Array.from(KNOWN_ROLES) as readonly string[];
