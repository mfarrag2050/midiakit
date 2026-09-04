/**
 * config — تحقّق مدخلات البيئة عند الإقلاع، فيرمي مبكّراً (L-04).
 *
 * كل قيمة تُقرأ من env مرّة واحدة هنا، تصير مُتاحة عبر `config`.
 * أيّ تنكر لاحق يستدعي reload — تسهيلاً للاختبار.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
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
