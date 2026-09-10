/**
 * config — تحقّق مدخلات البيئة عند الإقلاع، فيرمي مبكّراً (L-04).
 *
 * كل قيمة تُقرأ من env مرّة واحدة هنا، تصير مُتاحة عبر `config`.
 * أيّ تنكر لاحق يستدعي reload — تسهيلاً للاختبار.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(19040),

    DATABASE_URL_APP: z
      .string()
      .url()
      .refine((u) => u.startsWith('postgres://') || u.startsWith('postgresql://'), {
        message: 'DATABASE_URL_APP must be a postgres:// URI',
      }),

    // A27 — control_plane_user connection (منفصل، صلاحياته محدَّدة بسياسات)
    DATABASE_URL_PLATFORM: z
      .string()
      .url()
      .default('postgres://control_plane_user:dev_control_plane_pass@127.0.0.1:19041/mediakit'),

    // A27 — سرّ منفصل لجلسات المنصّة (لا يشترك مع SESSION_JWT_SECRET)
    PLATFORM_JWT_SECRET: z
      .string()
      .min(32, 'PLATFORM_JWT_SECRET must be at least 32 characters')
      .default('dev_platform_secret_change_in_production_min_32_bytes_placeholder'),

    // sr JWT — ≥32 بايت (SECRETS مقروءة كنصّ base64/utf-8، نتحقّق بالطول الخام).
    SESSION_JWT_SECRET: z
      .string()
      .min(32, 'SESSION_JWT_SECRET must be at least 32 characters (recommended: 32 bytes base64)'),

    CORS_ORIGIN: z.string().url().default('http://127.0.0.1:19050'),

    // SMTP — اختياري في dev/test، **إلزامي في production**.
    // الحماية: تشغيل production بلا SMTP يعني رموز استعادة تُطبع بالسجل
    // بدل إرسالها، ودعوات مستخدمين لا تصل. superRefine أدناه يفشل مبكّراً.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),

    // Storage — S3-compatible (S3, R2, MinIO...) أو memory driver في dev/test.
    // القرار #2 في A11: SDK رسمي — لا fetch على رابط، لا استثناء في
    // check-no-brand-url-fetch. S3 SDK يقبل bucket/key، لا URL حرّاً.
    STORAGE_DRIVER: z.enum(['s3', 'memory']).default('memory'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('mk-assets-dev'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // TTL للرابط الموقَّت (upload PUT + download GET)
    S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    // TTL خاص لـoutput (§8.4 يقول ساعة)
    S3_OUTPUT_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    // سقف حجم الرفع (§9.1 SIZE_TOO_LARGE + §9.1 uploadUrl.maxSizeBytes)
    STORAGE_MAX_SIZE_BYTES: z.coerce.number().int().positive().default(500 * 1024 * 1024), // 500 MB

    // Redis + BullMQ (A19 — قناة الطوابير)
    REDIS_URL: z.string().default('redis://127.0.0.1:6379/3'),
    BULLMQ_PREFIX: z.string().default('pf-mediakit'),

    // حصة الرندر المتزامن (§8 QUOTA_EXCEEDED_RENDERS).
    // A18 يحمل حدّاً ثابتاً — خرائط plan → limits تُعرَّف في A21 (docs/17).
    // الرقم 3 اختير كافتراضي «مساحة معقولة قبل A21» — small-team baseline
    // من docs/17 §17 (1/3/8/15 حسب الباقة). أَعلَن كقيمة مؤقّتة.
    RENDER_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(3),

    // A24 — مفتاح تشفير مفاتيح مزوّدي AI (AES-256-GCM).
    // **بلا default** حتى في dev — قرار المالك 2026-09-08: ضياع المفتاح
    // يجعل كل مفاتيح العملاء غير قابلة للفكّ للأبد. صيغة صارمة:
    //   • 64 حرفاً hex بالضبط (32 بايت خام)
    //   • مطلوب في كل بيئة (superRefine أدناه يشدّده أكثر في production)
    // لا rotation في هذه المرحلة — تذكرة أمن منفصلة بعد A28.
    // انظر PHASES-api.md §A24 لبند التشغيل: أين يُخزَّن · من يملكه ·
    // ماذا إن ضاع.
    AI_KEY_ENCRYPTION_KEY: z
      .string({ required_error: 'AI_KEY_ENCRYPTION_KEY is required (32 bytes = 64 hex chars). لا default حتى في dev — ضياع المفتاح يجعل مفاتيح العملاء غير قابلة للفكّ للأبد.' })
      .regex(/^[0-9a-fA-F]{64}$/, 'AI_KEY_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
      for (const key of required) {
        if (!data[key]) {
          ctx.addIssue({
            path: [key],
            code: 'custom',
            message: `${key} is required when NODE_ENV=production (رموز استعادة/دعوات لن تُرسَل بدونها)`,
          });
        }
      }
      // storage driver — memory غير مقبول في production
      if (data.STORAGE_DRIVER === 'memory') {
        ctx.addIssue({
          path: ['STORAGE_DRIVER'],
          code: 'custom',
          message: 'STORAGE_DRIVER=memory is not allowed in production (لا يوجد ثبات)',
        });
      }
      if (data.STORAGE_DRIVER === 's3') {
        for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
          if (!data[key]) {
            ctx.addIssue({
              path: [key],
              code: 'custom',
              message: `${key} is required when STORAGE_DRIVER=s3 in production`,
            });
          }
        }
      }
      // A24 — AI_KEY_ENCRYPTION_KEY: التحقّق الأساسي جرى في regex أعلاه.
      // لا تحقّق إضافي في production (regex يفشل بلا مفتاح، فلا نصل هنا).
      // نمنع فقط قيمة معروفة كـplaceholder في production.
      const KNOWN_PLACEHOLDERS = new Set([
        '0000000000000000000000000000000000000000000000000000000000000000',
        '1111111111111111111111111111111111111111111111111111111111111111',
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ]);
      if (KNOWN_PLACEHOLDERS.has(data.AI_KEY_ENCRYPTION_KEY.toLowerCase())) {
        ctx.addIssue({
          path: ['AI_KEY_ENCRYPTION_KEY'],
          code: 'custom',
          message: 'AI_KEY_ENCRYPTION_KEY هو قيمة معروفة كplaceholder — ولّد قيمة عشوائية (openssl rand -hex 32)',
        });
      }
    }
  });

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`✗ Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = loadConfig();
