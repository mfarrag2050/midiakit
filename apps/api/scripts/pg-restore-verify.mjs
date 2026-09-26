#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import {
  backupDirectory, BackupError, compare, fileHash, fingerprint,
  adminSql, adminTool, compose, reportFailure, signalController, validateManifest,
} from './pg-backup.mjs';

async function injectCorruption(database) {
  const affected = await adminSql(database, `BEGIN; SET LOCAL row_security = on;
    WITH changed AS (
      UPDATE public.tenants SET name = name || 'x'
      WHERE id = (SELECT id FROM public.tenants ORDER BY id LIMIT 1) RETURNING 1
    ) SELECT COUNT(*) FROM changed;
    COMMIT;`);
  if (affected !== '1') throw new BackupError('CORRUPTION_TEST_REQUIRES_ONE_TENANT');
  console.log('CORRUPTED public.tenants rows=1 selection=ORDER_BY_id');
}

async function cleanupDatabase(database) {
  try {
    await adminSql('mediakit', `DROP DATABASE IF EXISTS "${database}";`);
    console.log(`DROPPED ${database}`);
  } catch (error) {
    reportFailure('DATABASE_CLEANUP', error);
    console.error(`CLEANUP_REQUIRED ${database}`);
  }
}

async function cleanupContainerFile(path) {
  try {
    await compose(['exec', '-T', 'postgres-dev', 'rm', '-f', path]);
    console.log(`REMOVED_CONTAINER_FILE ${path}`);
  } catch (error) {
    reportFailure('FILE_CLEANUP', error);
    console.error(`CLEANUP_REQUIRED ${path}`);
  }
}

const controller = signalController();
let created = false;
let copyAttempted = false;
const database = `mediakit_restore_test_${Date.now()}_${process.pid}`;
const containerPath = `/tmp/${database}.dump`;
try {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) {
    if (!['--inject-corruption', '--pause-before-cleanup'].includes(flag)) throw new BackupError('UNKNOWN_ARGUMENT');
  }
  if (flags.has('--pause-before-cleanup') && !flags.has('--inject-corruption')) {
    throw new BackupError('PAUSE_REQUIRES_CORRUPTION_TEST');
  }
  const dumps = (await readdir(backupDirectory)).filter((name) =>
    /^mediakit-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.dump$/.test(name)).sort();
  if (!dumps.length) throw new BackupError('NO_COMPLETED_DUMP');
  const path = join(backupDirectory, dumps.at(-1));
  const manifest = JSON.parse(await readFile(`${path}.json`, 'utf8'));
  validateManifest(manifest);
  if (manifest.sha256 !== await fileHash(path)) throw new BackupError('DUMP_CHECKSUM_MISMATCH');
  console.log(`BACKUP ${dumps.at(-1)} sha256=verified`);
  controller.signal.throwIfAborted();
  // Finish CREATE before observing SIGINT, so finally knows whether it owns a DB.
  await adminSql('mediakit', `CREATE DATABASE "${database}" TEMPLATE template0;`);
  created = true;
  console.log(`CREATED ${database} service=postgres-dev socket=unix`);
  controller.signal.throwIfAborted();
  copyAttempted = true;
  await compose(['cp', path, `postgres-dev:${containerPath}`]);
  console.log(`COPIED_CONTAINER_FILE ${containerPath}`);
  await adminTool('pg_restore', ['-w', '-h', '/var/run/postgresql', '-U', 'postgres',
    '--exit-on-error', '--single-transaction', '-d', database, containerPath], { signal: controller.signal });
  compare(manifest.tables, await fingerprint(database, { signal: controller.signal }));
  if (flags.has('--inject-corruption')) {
    controller.signal.throwIfAborted();
    await injectCorruption(database);
    try {
      compare(manifest.tables, await fingerprint(database, { signal: controller.signal }));
      throw new BackupError('CORRUPTION_NOT_DETECTED');
    } catch (error) {
      if (flags.has('--pause-before-cleanup') && error instanceof BackupError
          && error.message.startsWith('VERIFY_FAILED')) {
        console.error(error.message);
        console.log(`WAITING_BEFORE_FINALLY ${database} pid=${process.pid}`);
        // A pending Promise alone cannot keep Node alive at this test checkpoint.
        const waiting = setInterval(() => {}, 1000);
        try {
          if (!controller.signal.aborted) await once(controller.signal, 'abort');
        } finally { clearInterval(waiting); }
      }
      throw error;
    }
  }
} catch (error) {
  reportFailure('RESTORE', error, controller.signal);
} finally {
  if (created) await cleanupDatabase(database);
  if (copyAttempted) await cleanupContainerFile(containerPath);
}
