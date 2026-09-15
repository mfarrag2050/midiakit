// ٣٩٠ § ٢ · «ماذا أفعل الآن؟»
//
// رسالةُ خطأٍ لا تقولُ للمستخدم خطوتَه التالية نصفُ رسالة. لكلِّ صنفٍ
// من الأخطاء **فعلٌ واحدٌ مقترَح**. الربطُ يعيشُ هنا لا في كلّ شاشة.
//
// **مبدأ:** الأفعالُ فئاتٌ لا رسائلُ إضافيّة. نصُّ كلّ فعلٍ في
// `packages/i18n/src/ar.json` تحت `errors.action.<CLASS>`.
//
// الرمزُ غيرُ المذكور يقع افتراضاً على `CONTACT_SUPPORT`
// (الأمانُ الأقوى — لا نطلبُ من المستخدم تصرّفاً قد يفاقم).

export type ErrorAction =
  | 'RETRY'              // شبكة/مؤقّت/خدمة — أعِد المحاولة
  | 'CHECK_FIELD'        // مدخل غير صالح — راجِع الحقلَ (`error.field`)
  | 'CHECK_BRAND_FONT'   // ملفّ خطّ ناقص/معطوب في الهوية
  | 'CHECK_BRAND_ASSET'  // صورةٌ أو أصلٌ ناقصٌ في الهوية
  | 'CHECK_TEMPLATE'     // القالبُ نفسه معطوب
  | 'QUOTA_UPGRADE'      // بلغت الحصّة — رقّ الباقة
  | 'CONTACT_SUPPORT';   // خطأٌ داخليّ أو غيرُ معروف — مع رمز الحادثة

const CODE_TO_ACTION: Readonly<Record<string, ErrorAction>> = {
  // — RETRY (شبكة/مؤقّت/خدمة)
  NETWORK_ERROR: 'RETRY',
  SERVICE_UNAVAILABLE: 'RETRY',
  SERVER_UNRESPONSIVE: 'RETRY',
  RATE_LIMITED: 'RETRY',
  TOO_MANY_ATTEMPTS: 'RETRY',
  RENDER_QUEUE_STUCK: 'RETRY',
  RENDER_TIMEOUT: 'RETRY',
  UPLOAD_ABORTED: 'RETRY',
  UPLOAD_FAILED: 'RETRY',
  URL_EXPIRED: 'RETRY',

  // — CHECK_FIELD (تحقّق مدخلات — الحقل معروف في error.field)
  INVALID_EMAIL: 'CHECK_FIELD',
  EMAIL_INVALID: 'CHECK_FIELD',
  PASSWORD_TOO_WEAK: 'CHECK_FIELD',
  TENANT_NAME_EMPTY: 'CHECK_FIELD',
  INVALID_TIMESTAMP: 'CHECK_FIELD',
  INVALID_FILTER_FIELD: 'CHECK_FIELD',
  HEADLINE_TOO_LONG: 'CHECK_FIELD',
  REASON_TOO_SHORT: 'CHECK_FIELD',
  VALIDATION_FAILED: 'CHECK_FIELD',

  // — CHECK_BRAND_FONT
  FONT_LOAD_CONFIG_MISSING: 'CHECK_BRAND_FONT',
  FONT_LOAD_NO_SOURCE: 'CHECK_BRAND_FONT',
  FONT_LOAD_FAILED: 'CHECK_BRAND_FONT',
  FONT_NOT_UPLOADED: 'CHECK_BRAND_FONT',
  INVALID_FONT_FILE: 'CHECK_BRAND_FONT',
  INVALID_FONT_METRICS: 'CHECK_BRAND_FONT',

  // — CHECK_BRAND_ASSET
  ASSET_LOAD_FAILED: 'CHECK_BRAND_ASSET',
  ASSET_NO_PUBLIC_URL: 'CHECK_BRAND_ASSET',
  INVALID_LOGO_DIMENSIONS: 'CHECK_BRAND_ASSET',
  UNSUPPORTED_KIND: 'CHECK_BRAND_ASSET',
  UNSUPPORTED_CONTENT_TYPE_FOR_KIND: 'CHECK_BRAND_ASSET',

  // — CHECK_TEMPLATE
  TEMPLATE_SNAPSHOT_INVALID: 'CHECK_TEMPLATE',
  TEMPLATE_SCHEMA_VIOLATION: 'CHECK_TEMPLATE',
  TEMPLATE_SNAPSHOT_NOT_FOUND: 'CHECK_TEMPLATE',
  PNG_UNSUPPORTED_TEMPLATE: 'CHECK_TEMPLATE',
  INVALID_LOTTIE_SCHEMA: 'CHECK_TEMPLATE',

  // — QUOTA_UPGRADE
  QUOTA_EXCEEDED_VIDEOS: 'QUOTA_UPGRADE',
  QUOTA_EXCEEDED_RENDERS: 'QUOTA_UPGRADE',
  STORAGE_QUOTA_EXCEEDED: 'QUOTA_UPGRADE',
  SEATS_EXHAUSTED: 'QUOTA_UPGRADE',
  SIZE_TOO_LARGE: 'QUOTA_UPGRADE',

  // — CONTACT_SUPPORT (داخليّ)
  INTERNAL_ERROR: 'CONTACT_SUPPORT',
  RENDER_FAILED: 'CONTACT_SUPPORT',
  UNKNOWN: 'CONTACT_SUPPORT',
};

export function actionForCode(code: string | undefined): ErrorAction {
  if (!code) return 'CONTACT_SUPPORT';
  return CODE_TO_ACTION[code] ?? 'CONTACT_SUPPORT';
}

/** مفتاحُ الترجمةِ للفعل — يستهلكُه `t(actionKeyFor(code))`. */
export function actionKeyFor(code: string | undefined): string {
  return `errors.action.${actionForCode(code)}`;
}
