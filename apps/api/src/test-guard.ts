// 518 — حارسٌ يمنع الاختبارات وسكربتات verify من الاتّصال ببيئة العرض.
//
// **العلّة (514i · 514j):** تسرّبَ `.env.show` إلى نافذة تشغيل، فكتبت الاختبارات
// وسكربتات `verify-*.mjs` 53 مستأجراً في DB العرض و146 كائناً في MinIO العرض
// قبل أن يُلاحَظ. النسخة الاحتياطية والتنظيف موثَّقان في التذكرتين.
//
// **العقد:** يُستدعى `assertNotShowroomEnv()` في:
//   - `vitest.setup.ts` (يشمل كل ملفّ اختبار عبر vitest).
//   - أوّلُ سطرٍ تنفيذيّ في كلّ سكربت `verify-*.mjs` يُنشئ مستأجرين.
//   - عاملُ الرندر ليس هنا — بيئتُه إنتاجٌ فعليّ.
//
// **إن اكتشف الحارس بيئةً حيّة**، يرمي `Error` بالإنجليزيّة + العربيّة
// ويُدرج **اسمَ المتغيّر الملوَّث فقط · لا قيمتَه** (DOCTRINE §١ الأسرار).

/**
 * أنماط المضيف/المنفذ/الاسم المحظورة على مسار الاختبار.
 * تُقاس على قيَم المتغيّرات — لا تُطبع القيمة، فقط اسمُ المتغيّر عند الاكتشاف.
 */
const FORBIDDEN_HOST_PATTERNS: RegExp[] = [
  /:19062(?:\/|$|[^0-9])/,  // Postgres العرض
  /:19063(?:\/|$|[^0-9])/,  // Redis العرض
  /:19064(?:\/|$|[^0-9])/,  // MinIO العرض
  /:1908\d(?:\/|$|[^0-9])/, // shownext (19080-19089)
  /mkdemo\.primeflow\.co/,
];

const FORBIDDEN_DB_NAMES: RegExp[] = [
  /\/mediakit_show(?:\?|$)/, // مسار DB في connection string
];

const FORBIDDEN_FLAGS: readonly string[] = [
  'SHOWROOM_MODE',
  'ENV_SHOW_VERSION',
];

const SCANNED_URL_VARS: readonly string[] = [
  'DATABASE_URL',
  'DATABASE_URL_APP',
  'DATABASE_URL_PLATFORM',
  'DATABASE_URL_MIGRATION',
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_PUBLIC_ENDPOINT',
  'NEXT_PUBLIC_API_URL',
  'CORS_ORIGIN',
];

/**
 * يرمي إن رأى بيئةَ العرض. آمنٌ للاستدعاء المتكرّر.
 * @param env — للاختبار فقط; في التشغيل الحقيقيّ اترك الافتراضيّ.
 */
export function assertNotShowroomEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const flag of FORBIDDEN_FLAGS) {
    if (env[flag] != null && env[flag] !== '') {
      throw new Error(
        `[test-guard] رفض تشغيل اختبار/verify على بيئة العرض — ` +
        `المتغيّر ${flag} معرَّف (SHOWROOM detected · refusing to run).`
      );
    }
  }
  for (const name of SCANNED_URL_VARS) {
    const value = env[name];
    if (!value) continue;
    for (const pattern of FORBIDDEN_HOST_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(
          `[test-guard] رفض تشغيل اختبار/verify على بيئة العرض — ` +
          `${name} يشير إلى مضيف/منفذٍ محظور (host pattern matched · value NOT printed).`
        );
      }
    }
    for (const pattern of FORBIDDEN_DB_NAMES) {
      if (pattern.test(value)) {
        throw new Error(
          `[test-guard] رفض تشغيل اختبار/verify على بيئة العرض — ` +
          `${name} يشير إلى قاعدة mediakit_show (DB name matched · value NOT printed).`
        );
      }
    }
  }
}
