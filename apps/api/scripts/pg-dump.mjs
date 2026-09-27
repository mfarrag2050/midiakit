#!/usr/bin/env node
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  backupDirectory, connectSource, fingerprint, migrationEnvironment, reportFailure,
  adminTool, command, fileHash, signalController, closeClient, BackupError, DumpPermissionError,
} from './pg-backup.mjs';

async function dumpSnapshot({ path, snapshot, serverMajor, environment, signal }) {
  try {
    await command('pg_dump', ['--no-password', '-Fc', '--snapshot', snapshot, '--file', path], { env: environment, signal });
  } catch (error) {
    if (!(error instanceof DumpPermissionError) || signal.aborted) throw error;
    console.log('DUMP migration_user@127.0.0.1:19041 PG_PERMISSION_DENIED; authorized fallback=postgres@container-unix');
    await rm(path, { force: true });
    await adminTool('pg_dump', ['-w', '-Fc', '-h', '/var/run/postgresql', '-U', 'postgres',
      '--snapshot', snapshot, '-d', 'mediakit'], { outputPath: path, signal });
    return;
  }
  // Do not publish a newer archive for the older in-container pg_restore.
  const version = await command('pg_dump', ['--version'], { env: environment, signal });
  const clientMajor = Number(version.match(/PostgreSQL\) (\d+)/)?.[1]);
  if (!clientMajor || clientMajor > serverMajor) throw new BackupError('LOCAL_DUMP_CLIENT_TOO_NEW');
  console.log('DUMP migration_user@127.0.0.1:19041 OK');
}

const controller = signalController();
let source;
let staging;
try {
  if (process.argv.length !== 2) throw new BackupError('UNKNOWN_ARGUMENT');
  const environment = migrationEnvironment();
  source = await connectSource(environment);
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const { rows: [{ snapshot, server_major }] } = await source.query(
    "SELECT pg_export_snapshot() AS snapshot, current_setting('server_version_num')::int / 10000 AS server_major");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  staging = await mkdtemp(join(backupDirectory, '.partial-'));
  const name = `mediakit-${new Date().toISOString()}.dump`;
  const temporaryDump = join(staging, name);
  await dumpSnapshot({ path: temporaryDump, snapshot, serverMajor: server_major, environment, signal: controller.signal });
  const tablesAtBackup = await fingerprint('mediakit', { snapshot, signal: controller.signal });
  await source.query('COMMIT');
  controller.signal.throwIfAborted();
  const manifest = { version: 1, database: 'mediakit', port: 19041,
    sha256: await fileHash(temporaryDump), tables: tablesAtBackup };
  await writeFile(`${temporaryDump}.json`, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await rename(`${temporaryDump}.json`, join(backupDirectory, `${name}.json`));
  await rename(temporaryDump, join(backupDirectory, name));
  console.log(`DUMP ${name} format=custom bytes=${(await stat(join(backupDirectory, name))).size}`);
  console.log(`SOURCE mediakit@127.0.0.1:19041 tables=${tablesAtBackup.length} snapshot=shared`);
} catch (error) {
  reportFailure('DUMP', error, controller.signal);
} finally {
  await closeClient(source);
  try {
    if (staging) await rm(staging, { recursive: true, force: true });
  } catch (error) { reportFailure('STAGING_CLEANUP', error); }
}
