/**
 * db:bootstrap — يشغّل infra/postgres/init/*.sql على قاعدة فارغة.
 *
 * **العلّة (100-DB-BOOTSTRAP):** الأدوار والامتدادات كانت تُنشأ كأثر جانبيّ
 * لخطّاف docker-compose على الميني. أيّ بيئة نظيفة (CI · إنتاج · قاعدة مستأجر
 * جديدة) تبدأ بلا تلك الذاكرة، فتنكسر الهجرات صامتاً.
 *
 * **المبدأ:** خطوة مُعلَنة تُشغَّل قبل migrate. مصدر SQL واحد
 * (infra/postgres/init/*.sql) — لا نسخ إلى مكان ثانٍ.
 *
 * **قابل لإعادة التشغيل:** كل CREATE ROLE مغلَّف بـDO block يفحص pg_roles
 * أوّلاً. كل CREATE EXTENSION يحمل IF NOT EXISTS. تشغيل bootstrap مرّتَين
 * على نفس القاعدة لا يكسر شيئاً.
 *
 * **الاتّصال:** يستعمل DATABASE_URL_ADMIN (أو DATABASE_URL كتراجع) —
 * SUPERUSER لأنّ CREATE ROLE + CREATE EXTENSION يحتاجانه. لا يُشغَّل كـ
 * migration_user (ليس SUPERUSER).
 *
 * **الترتيب المُعلَن:** bootstrap → migrate → seed.
 *
 * **استعمال:**
 *   pnpm db:bootstrap          → على dev
 *   pnpm db:bootstrap:test     → على test
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const initDir = join(repoRoot, 'infra', 'postgres', 'init');

const args = process.argv.slice(2);
const useTest = args.includes('--test');

// admin URL: SUPERUSER — يحتاجه CREATE ROLE + CREATE EXTENSION.
// نستعمل DATABASE_URL_ADMIN إن مُقدَّم، وإلّا نبني URL من قاعدة dev/test
// بمستخدم `postgres` (bootstrap الافتراضيّ في docker-compose).
function buildAdminUrl(): string {
  const explicit = process.env['DATABASE_URL_ADMIN'];
  if (explicit) return explicit;
  // نستنبط من DATABASE_URL (migration_user) — نبدّل المستخدم إلى postgres
  const base = useTest ? process.env['DATABASE_URL_TEST'] : process.env['DATABASE_URL'];
  if (!base) {
    console.error(
      `✗ Missing DATABASE_URL_ADMIN (or ${useTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL'} to derive from).`,
    );
    console.error(`  Bootstrap يحتاج SUPERUSER للتهيئة (CREATE ROLE + CREATE EXTENSION).`);
    process.exit(1);
  }
  // postgres://migration_user:pwd@host:port/db → postgres://postgres:postgres@host:port/db
  return base.replace(
    /^postgres(ql)?:\/\/[^:]+:[^@]+@/,
    'postgres://postgres:postgres@',
  );
}

const adminUrl = buildAdminUrl();
const label = useTest ? 'test' : 'dev';
const redacted = adminUrl.replace(/:[^:@]+@/, ':***@');

console.log(`▶ db:bootstrap → ${label} (${redacted})`);
console.log(`  المصدر: ${initDir.replace(repoRoot + '/', '')}`);

const client = new Client({ connectionString: adminUrl });
try {
  await client.connect();
} catch (err) {
  console.error(`✗ فشل الاتّصال كـSUPERUSER: ${(err as Error).message}`);
  console.error(`  تحقّق أنّ Postgres شغّال وأنّ DATABASE_URL_ADMIN صحيح.`);
  process.exit(2);
}

try {
  const files = readdirSync(initDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error(`✗ لا ملفّات SQL في ${initDir}`);
    process.exit(3);
  }
  for (const f of files) {
    const full = join(initDir, f);
    const sql = readFileSync(full, 'utf8');
    console.log(`  ▶ ${f} (${(sql.length / 1024).toFixed(1)} KB)`);
    try {
      await client.query(sql);
    } catch (err) {
      console.error(`✗ فشل تنفيذ ${f}: ${(err as Error).message}`);
      console.error(`  إن كانت الرسالة «already exists» فالملفّ ليس idempotent — بلّغ.`);
      throw err;
    }
  }
  console.log(`✓ bootstrap تمّ على ${label} — ${files.length} ملفّ`);
} finally {
  await client.end();
}
