#!/usr/bin/env node
import { cleanDevEnvironment, readLocalEnvironment } from './dev-environment.mjs';

Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, getRedis, closeQueues } = await import('../src/queues/index.ts');
const { BACKUP_JOB_NAME, BACKUP_JOB_ID, registerDailyBackup, isDevBackupTarget } = await import('../src/queues/backup.ts');
const { QueueEvents } = await import('bullmq');
const { config } = await import('../src/config.ts');

async function main() {
  if (!isDevBackupTarget()) throw new Error('BACKUP_DEV_TARGET_REQUIRED');
  const queue = getQueue('backup');
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['status', 'register', 'minute', 'cancel', 'manual'].includes(action)) {
    throw new Error('USAGE: node --import tsx apps/api/scripts/backup-control.mjs status|register|minute|cancel|manual');
  }
  console.log(`before=${(await queue.getRepeatableJobs()).length}`);
  if (action === 'register') await registerDailyBackup();
  if (action === 'cancel' || action === 'minute') {
    for (const repeat of await queue.getRepeatableJobs()) {
      if (repeat.name === BACKUP_JOB_NAME) await queue.removeRepeatableByKey(repeat.key);
    }
  }
  if (action === 'minute') {
    await queue.add(BACKUP_JOB_NAME, {}, { jobId: BACKUP_JOB_ID, repeat: { every: 60_000 } });
  }
  if (action === 'manual') {
    const events = new QueueEvents(queue.name, { connection: getRedis(), prefix: config.BULLMQ_PREFIX });
    try {
      await events.waitUntilReady();
      const job = await queue.add('backup:pg-dump:manual', {});
      await job.waitUntilFinished(events, 120_000);
      console.log(`manual=${job.id} completed`);
    } finally { await events.close(); }
  }
  const repeats = await queue.getRepeatableJobs();
  console.log(`after=${repeats.length}`);
  console.log(JSON.stringify(repeats));
  console.log(`workers=${(await queue.getWorkers()).length}`);
}

try { await main(); }
catch { console.error('BACKUP_CONTROL_FAILED: see backup.log and Redis availability'); process.exitCode = 1; }
finally { await closeQueues(); }
