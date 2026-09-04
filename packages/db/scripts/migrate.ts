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
