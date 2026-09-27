import Redis from 'ioredis';
import { isMainThread } from 'node:worker_threads';
import { assertDevEnvironment, DevLaunchError, launchCertificate, reportLaunchFailure } from './dev-environment.mjs';

async function assertDevRedis() {
  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true, connectTimeout: 3000, commandTimeout: 3000,
    retryStrategy: () => null, maxRetriesPerRequest: 0, enableOfflineQueue: false,
  });
  // ioredis also emits connection failures; the awaited operation reports a safe error below.
  redis.on('error', () => {});
  try {
    await redis.connect();
    if (await redis.ping() !== 'PONG') throw new DevLaunchError('DEV_REDIS_UNAVAILABLE: REDIS_URL; no fallback');
  } catch {
    throw new DevLaunchError('DEV_REDIS_UNAVAILABLE: REDIS_URL; no fallback');
  } finally {
    redis.disconnect();
  }
}

// Node replays preloads in the logger's worker thread; its parent already passed the guard.
if (isMainThread) {
  try {
    assertDevEnvironment(process.env);
    console.log(`env_at_launch = ${JSON.stringify(launchCertificate(process.env))}`);
    await assertDevRedis();
  } catch (error) {
    reportLaunchFailure(error);
    process.exit(1);
  }
}
