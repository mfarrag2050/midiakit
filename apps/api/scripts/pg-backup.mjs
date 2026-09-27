import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = new URL('../../../', import.meta.url);
export const backupDirectory = fileURLToPath(new URL('../backups/', import.meta.url));
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const literal = (text) => "'" + text.replaceAll("'", "''") + "'";
const pgOptions = '-c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres -c extra_float_digits=3 -c bytea_output=hex -c row_security=off';
export class BackupError extends Error {}
export class DumpPermissionError extends BackupError {}

export function toolEnvironment() {
  // No inherited database credential, service file, Docker endpoint or PGHOST
  // reaches the administrative client. It uses the dev container's Unix socket.
  return { HOME: process.env.HOME, PATH: process.env.PATH, PGOPTIONS: pgOptions };
}

export function migrationEnvironment() {
  const expected = { PGHOST: '127.0.0.1', PGPORT: '19041', PGUSER: 'migration_user', PGDATABASE: 'mediakit' };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (process.env[key] !== undefined && process.env[key] !== expectedValue) throw new BackupError(`TARGET_REJECTED ${key}`);
  }
  const local = dotenv.parse(readFileSync(new URL('packages/db/.env', root)));
  const target = new URL(local.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname)
      || target.port !== '19041' || target.pathname !== '/mediakit' || target.username !== 'migration_user'
      || !target.password || target.search || target.hash) throw new BackupError('MIGRATION_TARGET_REJECTED');
  return { ...toolEnvironment(), ...expected, PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: '10' };
}

export async function connectSource(environment) {
  const client = new pg.Client({ host: environment.PGHOST, port: Number(environment.PGPORT),
    user: environment.PGUSER, password: environment.PGPASSWORD, database: environment.PGDATABASE,
    connectionTimeoutMillis: 10000, options: pgOptions, application_name: 'mediakit-backup' });
  client.on('error', (error) => reportFailure('SOURCE_CONNECTION', error));
  try { await client.connect(); return client; }
  catch (error) { await closeClient(client); throw error; }
}

export function compose(args, options = {}) {
  return command(fileURLToPath(new URL('bin/mk', root)),
    ['--progress', 'quiet', '-f', fileURLToPath(new URL('infra/docker-compose.yml', root)), ...args],
    { ...options, env: toolEnvironment() });
}

export function adminTool(name, args, options = {}) {
  return compose(['exec', '-T', '-e', 'PGOPTIONS', 'postgres-dev', name, ...args], options);
}

export function adminSql(database, sql, signal) {
  if (database !== 'mediakit' && !/^mediakit_restore_test_\d+_\d+$/.test(database)) throw new BackupError('ADMIN_TARGET_REJECTED');
  return adminTool('psql', ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql',
    '-U', 'postgres', '-d', database], { input: sql, signal });
}

export async function command(executable, args, options = {}) {
  const output = options.outputPath ? await open(options.outputPath, 'wx', 0o600) : undefined;
  try { return await collectCommand(executable, args, { ...options, output }); }
  finally { await output?.close(); }
}

function collectCommand(executable, args, { env = toolEnvironment(), input, output, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const child = spawn(executable, args, { env, stdio: ['pipe', output ? output.fd : 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let inputFailed = false;
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => { inputFailed = true; });
    child.stdin.end(input);
    const abort = () => child.kill('SIGINT');
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => reject(new BackupError('COMMAND_SPAWN_FAILED (check PATH)')));
    child.once('close', (code, killedBy) => {
      signal?.removeEventListener('abort', abort);
      if (code === 0 && !stderr && !inputFailed) return resolve(stdout.trim());
      // Never print diagnostic text: SQL errors may include complete row values.
      if (/(permission denied|row-level security|must be owner)/i.test(stderr)) {
        return reject(new DumpPermissionError(`PG_PERMISSION_DENIED exit=${code}`));
      }
      reject(new BackupError(`COMMAND_FAILED exit=${code} signal=${killedBy ?? 'none'} diagnostic_bytes=${Buffer.byteLength(stderr)} stdin_failed=${inputFailed}`));
    });
  });
}

const tablesSql = `SELECT COALESCE(json_agg(catalog ORDER BY name), '[]') FROM (
  SELECT c.relname AS name,
    ARRAY(SELECT a.attname::text FROM pg_index i
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, position)
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE i.indrelid = c.oid AND i.indisprimary AND k.position <= i.indnkeyatts
      ORDER BY k.position) AS pk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')) catalog;`;

export async function fingerprint(database, { snapshot, signal } = {}) {
  const begin = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    + (snapshot ? `SET TRANSACTION SNAPSHOT ${literal(snapshot)};\n` : '');
  const tables = JSON.parse(await adminSql(database, begin + tablesSql + '\nCOMMIT;', signal));
  if (!tables.length) throw new BackupError('NO_PUBLIC_TABLES');
  const queries = tables.map((table) => {
    if (!table.pk.length) throw new BackupError(`PRIMARY_KEY_REQUIRED public.${table.name}`);
    const order = table.pk.map((column) => `t.${quote(column)}`).join(', ');
    return `SELECT json_build_object('name', ${literal(table.name)}, 'pk', ${literal(JSON.stringify(table.pk))}::json,
      'rows', COUNT(*)::text, 'md5', md5(COALESCE(string_agg(md5(t.*::text), '' ORDER BY ${order}), '')))
      FROM public.${quote(table.name)} t;`;
  });
  const output = await adminSql(database, begin + queries.join('\n') + '\nCOMMIT;', signal);
  return output.split('\n').map((line) => JSON.parse(line));
}

export function validateManifest(manifest) {
  if (manifest?.version !== 1 || manifest.database !== 'mediakit' || manifest.port !== 19041
      || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Array.isArray(manifest.tables)
      || !manifest.tables.length) throw new BackupError('INVALID_BACKUP_MANIFEST');
  const names = new Set();
  for (const table of manifest.tables) {
    if (!table || typeof table.name !== 'string' || !table.name || names.has(table.name)
        || !Array.isArray(table.pk) || !table.pk.length
        || !table.pk.every((column) => typeof column === 'string' && column.length > 0)
        || new Set(table.pk).size !== table.pk.length || typeof table.rows !== 'string'
        || !/^(0|[1-9][0-9]*)$/.test(table.rows) || typeof table.md5 !== 'string' || !/^[a-f0-9]{32}$/.test(table.md5)) {
      throw new BackupError('INVALID_BACKUP_TABLE');
    }
    names.add(table.name);
  }
}

export async function closeClient(client) {
  if (!client) return;
  try { await client.end(); }
  catch (error) { reportFailure('DISCONNECT', error); }
}

export function compare(expected, actual) {
  const left = new Map(expected.map((table) => [table.name, table]));
  const right = new Map(actual.map((table) => [table.name, table]));
  let differences = 0;
  for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(name);
    const b = right.get(name);
    const equal = a && b && a.rows === b.rows && a.md5 === b.md5 && JSON.stringify(a.pk) === JSON.stringify(b.pk);
    console.log(`${equal ? 'MATCH' : 'DIFF'} public.${name} source_rows=${a?.rows ?? 'missing'} restored_rows=${b?.rows ?? 'missing'} source_md5=${a?.md5 ?? 'missing'} restored_md5=${b?.md5 ?? 'missing'}`);
    if (a && b && JSON.stringify(a.pk) !== JSON.stringify(b.pk)) {
      console.log(`DIFF public.${name} source_pk=${JSON.stringify(a.pk)} restored_pk=${JSON.stringify(b.pk)}`);
    }
    if (!equal) differences++;
  }
  if (differences) throw new BackupError(`VERIFY_FAILED tables=${differences}`);
  console.log(`VERIFY_OK tables=${expected.length}`);
}

export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function signalController() {
  process.umask(0o077);
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (!controller.signal.aborted) {
      console.log(`SIGNAL ${signal}`);
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
      controller.abort(new BackupError(signal));
    }
  });
  return controller;
}

export function reportFailure(stage, error, signal) {
  const detail = error instanceof BackupError ? error.message :
    (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'OPERATION_FAILED');
  console.error(`${stage}_ERROR ${detail}`);
  if (!signal?.aborted) process.exitCode = 1;
}
