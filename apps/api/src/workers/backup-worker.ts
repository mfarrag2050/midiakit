import { Worker, type ConnectionOptions } from 'bullmq';
import { config } from '../config.js';
import { closeQueues, getQueue, getRedis } from '../queues/index.js';
import { isDevBackupTarget } from '../queues/backup.js';
import { processBackup } from './backup-processor.js';

async function main(): Promise<void> {
  if (!isDevBackupTarget()) throw new Error('BACKUP_DEV_TARGET_REQUIRED');
  const queue = getQueue('backup');
  await queue.setGlobalConcurrency(1);
  const worker = new Worker(queue.name, processBackup, {
    connection: getRedis() as unknown as ConnectionOptions,
    prefix: config.BULLMQ_PREFIX, concurrency: 1,
  });
  worker.on('error', () => console.error('BACKUP_WORKER_CONNECTION_ERROR'));
  worker.on('failed', () => console.error('BACKUP_JOB_FAILED: see apps/api/logs/backup.log'));
  const shutdown = async () => {
    await worker.close();
    await closeQueues();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  await worker.waitUntilReady();
  console.log('BACKUP_WORKER_READY queue=backup-daily concurrency=1');
}

main().catch(() => { console.error('BACKUP_WORKER_START_FAILED'); process.exit(1); });
