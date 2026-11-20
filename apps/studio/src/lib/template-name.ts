// 549 · اسم عرض القالب حسب locale.
//
// `name` قيمة مخزَّنة (عربيّة للقوالب العامّة) ⇒ كانت تظهر عربيّةً في
// الواجهة الإنجليزيّة. القوالب العامّة تحمل `key` ثابتاً من الخادم
// (`definition.id`)، فنترجم به. قوالب المستأجر (`key=null`) اسمها
// محتوى المستخدم ⇒ يُعرَض كما هو. مفتاحٌ بلا ترجمة ⇒ نرجع إلى `name`
// بدل عرض مسار المفتاح.

export interface NamedTemplate {
  readonly name: string;
  readonly key?: string | null;
}

export interface Translator {
  t(key: string): string;
  has(key: string): boolean;
}

export function templateDisplayName(tpl: NamedTemplate, i18n: Translator): string {
  if (!tpl.key) return tpl.name;
  const k = `pages.templates.names.${tpl.key}`;
  return i18n.has(k) ? i18n.t(k) : tpl.name;
}
