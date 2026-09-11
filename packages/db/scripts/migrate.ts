/**
 * مغلَّف node-pg-migrate البرمجي.
 * يقرأ .env (dev و test)، ويختار الوجهة بحسب --test.
 *
 * الاستعمال:
 *   pnpm migrate:up            → migrations up على dev
 *   pnpm migrate:up:test       → migrations up على test
 *   pnpm migrate:down          → إلغاء آخر migration على dev
 *   pnpm migrate:create <name> → ملف migration جديد بطابع زمني
 *
 * ملاحظة: كل الأوامر تستعمل DATABASE_URL (migration_user)، لا
 * DATABASE_URL_APP (app_user). القاعدة: migrations تُملَك، تطبيق mk-api لا.
 */
import 'dotenv/config';
import runner from 'node-pg-migrate';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');

const args = process.argv.slice(2);
const useTest = args.includes('--test');
const positional = args.filter((a) => !a.startsWith('--'));
const command = positional[0] ?? 'up';

if (command === 'create') {
  const name = positional[1];
  if (!name) {
    console.error('✗ Usage: migrate create <name>');
    process.exit(1);
  }
  // create يستعمل الـCLI مباشرة (تنسيق اسم الملف + طابع زمني ثابت)
  execSync(
    `node ./node_modules/node-pg-migrate/bin/node-pg-migrate.js create ${name} --migration-file-language ts --migrations-dir migrations`,
    { stdio: 'inherit', cwd: packageRoot },
  );
  process.exit(0);
}

if (command !== 'up' && command !== 'down') {
  console.error(`✗ Unknown command: ${command} (expected: up | down | create)`);
  process.exit(1);
}

const dbUrl = useTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
const label = useTest ? 'test' : 'dev';

if (!dbUrl) {
  console.error(
    `✗ Missing ${useTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL'} in ${packageRoot}/.env`,
  );
  console.error(`  Copy .env.example → .env and adjust.`);
  process.exit(1);
}

console.log(`▶ node-pg-migrate ${command} → ${label} (${dbUrl.replace(/:[^:@]+@/, ':***@')})`);

// Preflight (100-DB-BOOTSTRAP): يفشل بصوت إن غابت التهيئة.
// نمط الهجرة 20260907120000_control-plane-a27 يفعل RAISE داخلها، لكنّ ذلك
// يوقف الهجرة في منتصف السلسلة برسالة غامضة. هنا نفشل مبكّراً بمخرج واضح:
// - الأدوار الأربعة (migration_user يفحص نفسه ضمنياً بالاتّصال)
// - الامتدادات المطلوبة (citext لـusers.email)
if (command === 'up') {
  const { Client } = pg;
  const preflight = new Client({ connectionString: dbUrl });
  try {
    await preflight.connect();
  } catch (err) {
    // إن فشل الاتّصال بـmigration_user، فالمرشّح الأوّل: الدور غير موجود
    console.error(`\n✗ الاتّصال بـmigration_user فشل: ${(err as Error).message}`);
    console.error(`  الأرجح: التهيئة لم تجرِ. العلاج:`);
    console.error(`    pnpm db:bootstrap${useTest ? ':test' : ''}`);
    console.error(`  ثمّ أعد ${useTest ? 'pnpm db:migrate:test' : 'pnpm db:migrate'}.`);
    process.exit(4);
  }
  try {
    const roles = await preflight.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles
       WHERE rolname IN ('app_user', 'auth_lookup', 'control_plane_user')`,
    );
    const found = new Set(roles.rows.map((r) => r.rolname));
    const missing = ['app_user', 'auth_lookup', 'control_plane_user'].filter((r) => !found.has(r));
    if (missing.length > 0) {
      console.error(`\n✗ التهيئة ناقصة: أدوار غائبة: ${missing.join(', ')}`);
      console.error(`  الأدوار تُنشأ في infra/postgres/init/01-roles.sql — تُشغَّل مرّة عند`);
      console.error(`  bootstrap. أيّ بيئة نظيفة (CI · إنتاج · قاعدة جديدة) تحتاج تهيئة قبل migrate.`);
      console.error(`  العلاج:`);
      console.error(`    pnpm db:bootstrap${useTest ? ':test' : ''}`);
      console.error(`  ثمّ أعد ${useTest ? 'pnpm db:migrate:test' : 'pnpm db:migrate'}.`);
      process.exit(5);
    }
    const ext = await preflight.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'citext'`,
    );
    if (ext.rowCount === 0) {
      console.error(`\n✗ التهيئة ناقصة: امتداد citext غائب (users.email يعتمد عليه)`);
      console.error(`  الامتدادات تُنشأ في infra/postgres/init/02-extensions.sql عند bootstrap.`);
      console.error(`  العلاج:`);
      console.error(`    pnpm db:bootstrap${useTest ? ':test' : ''}`);
      console.error(`  ثمّ أعد ${useTest ? 'pnpm db:migrate:test' : 'pnpm db:migrate'}.`);
      process.exit(6);
    }
  } finally {
    await preflight.end();
  }
}

await runner({
  databaseUrl: dbUrl,
  dir: join(packageRoot, 'migrations'),
  direction: command,
  migrationsTable: 'pgmigrations',
  singleTransaction: true,
  verbose: true,
  schema: 'public',
  migrationsSchema: 'public',
  count: command === 'down' ? 1 : Infinity,
});

console.log(`✓ done (${command} on ${label})`);
