/**
 * emails/messages — نصوصُ رسائل البريد الصادرة من الخادم (subject/body).
 *
 * **لماذا هنا لا في `packages/i18n` مباشرةً:**
 * `@pf-mediakit/i18n` مصمَّمٌ للواجهة (React Context · `useLocale`).
 * الخادم بلا سياق مستخدمٍ حيّ لكلّ إرسال (بعض الرسائل تُرسَل قبل
 * تسجيل الدخول — مثل استعادة كلمة المرور)، فيقرأ الملفّات مباشرةً
 * ويقدّم interpolation بسيطاً بلا Provider.
 *
 * **مصدر النصوص:** `packages/i18n/src/{ar,en}.json` — نفس القاموس
 * الذي تستهلكه الواجهة، فلا تباعد بين ما يُعرض على الشاشة وما يُرسَل
 * في البريد. حارس `check:locale-parity` يضمن تكامل المفاتيح.
 *
 * **اختيار اللغة اليوم:** default = `ar` (العميل الأوّل عربيّ).
 * التخصيص لكلّ مستخدم عبر `users.locale` بند لاحق — عمود موجود، لكنّ
 * `requestPasswordReset` يتعمّد ألّا يقرأه الآن (لا كشف وجود الحساب
 * · لا استعلام مستأجرٍ إضافيّ). عند فتح هذا البند يُمرَّر `locale`
 * صراحةً إلى `formatEmail`.
 */
import arMessages from '../../../../packages/i18n/src/ar.json' with { type: 'json' };
import enMessages from '../../../../packages/i18n/src/en.json' with { type: 'json' };

export type EmailLocale = 'ar' | 'en';

const DICTIONARIES: Record<EmailLocale, typeof arMessages> = {
  ar: arMessages,
  en: enMessages as typeof arMessages,
};

/** يبدّل `{{key}}` بالقيمة من `vars`. غياب المفتاح ⇒ يبقى كما هو للتشخيص. */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    return key in vars ? String(vars[key]) : `{{${key}}}`;
  });
}

/** رسالة بريد جاهزة (subject + body) بعد interpolation. */
export interface EmailMessage {
  subject: string;
  body: string;
}

/**
 * صياغة بريد استعادة كلمة المرور.
 *
 * @param locale — لغة العميل المُستهدَف. الافتراض `ar`.
 * @param vars   — `token` (الرمز الخام) · `expiresInHours` (سقف الصلاحيّة).
 */
export function formatForgotPasswordEmail(
  vars: { token: string; expiresInHours: number },
  locale: EmailLocale = 'ar',
): EmailMessage {
  const dict = DICTIONARIES[locale].emails.forgotPassword;
  return {
    subject: dict.subject,
    body: interpolate(dict.body, vars),
  };
}
