import { config } from '../config.js';
import { getQueue } from './index.js';

export const BACKUP_JOB_NAME = 'backup:pg-dump:daily';
export const BACKUP_JOB_ID = 'backup-daily';

export function isDevBackupTarget(): boolean {
  const database = new URL(config.DATABASE_URL_APP);
  const redis = new URL(config.REDIS_URL);
  return config.NODE_ENV === 'development' && database.hostname === '127.0.0.1'
    && database.port === '19041' && database.pathname === '/mediakit'
    && redis.hostname === '127.0.0.1' && redis.port === '19045' && redis.pathname === '/0'
    && config.BULLMQ_PREFIX === 'pf-mediakit';
}

export async function registerDailyBackup(): Promise<void> {
  if (!isDevBackupTarget()) throw new Error('BACKUP_DEV_TARGET_REQUIRED');
  const queue = getQueue('backup');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      queue.add(BACKUP_JOB_NAME, {}, { jobId: BACKUP_JOB_ID, repeat: { pattern: '0 3 * * *', tz } }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('BACKUP_REGISTRATION_TIMEOUT')), 10_000);
      }),
    ]);
  } catch {
    // Connection errors can contain credentials; report only a fixed code and fail startup.
    throw new Error('BACKUP_REGISTRATION_FAILED');
  } finally { clearTimeout(timeout); }
}
