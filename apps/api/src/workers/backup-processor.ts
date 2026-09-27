import { execFile, spawn } from 'node:child_process';
import { appendFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const backupDirectory = fileURLToPath(new URL('../../backups/', import.meta.url));
const logDirectory = fileURLToPath(new URL('../../logs/', import.meta.url));
const dumpScript = fileURLToPath(new URL('../../scripts/pg-dump.mjs', import.meta.url));
const dumpNamePattern = /^mediakit-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.dump$/;

async function logBackup(message: string): Promise<void> {
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  await appendFile(join(logDirectory, 'backup.log'), `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
}

async function assertDockerContext(): Promise<void> {
  const { stdout } = await promisify(execFile)('docker', ['context', 'show'], {
    env: { HOME: process.env.HOME, PATH: process.env.PATH }, timeout: 10_000,
  });
  if (stdout.trim() !== 'colima-mediakit') throw new Error('BACKUP_DOCKER_CONTEXT_MISMATCH');
}

export async function listDumps(directory = backupDirectory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && dumpNamePattern.test(entry.name))
    .map((entry) => entry.name).sort();
}

export async function retainLatestDumps(directory = backupDirectory): Promise<string[]> {
  // Zero through seven: retain all. Eight or more: newest seven include today's dump.
  const dumps = await listDumps(directory);
  const expired = dumps.slice(0, Math.max(0, dumps.length - 7));
  for (const name of expired) {
    await rm(join(directory, name));
    await rm(join(directory, `${name}.json`), { force: true });
  }
  return expired;
}

async function runDump(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // The existing script reads local credentials itself; no inherited DB/Docker override.
    const child = spawn(process.execPath, [dumpScript], {
      env: { HOME: process.env.HOME, PATH: process.env.PATH }, stdio: 'ignore',
    });
    child.once('error', () => reject(new Error('BACKUP_DUMP_SPAWN_FAILED')));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('BACKUP_DUMP_FAILED')));
  });
}

export async function processBackup(): Promise<void> {
  await logBackup('start');
  let stage = 'context';
  try {
    await assertDockerContext();
    stage = 'dump';
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const before = new Set(await listDumps());
    await runDump();
    const created = (await listDumps()).filter((name) => !before.has(name));
    if (created.length !== 1 || (await stat(join(backupDirectory, created[0]!))).size === 0) {
      throw new Error('BACKUP_DUMP_NOT_PUBLISHED');
    }
    stage = 'retention';
    const removed = await retainLatestDumps();
    await logBackup(`end exit=0 created=${created[0]} removed=${JSON.stringify(removed)}`);
  } catch {
    await logBackup(`end exit=1 stage=${stage}`);
    throw new Error(`BACKUP_FAILED_${stage.toUpperCase()}`);
  }
}
