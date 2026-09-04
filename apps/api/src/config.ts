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
