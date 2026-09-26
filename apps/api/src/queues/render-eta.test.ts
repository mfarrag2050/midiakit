import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { closeQueues, getQueue, getRedis, type RenderQueueName as QueueName } from './index.js';
import { getRenderEta } from './render-eta.js';

const jobs: Job[] = [];
const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

async function add(queueName: QueueName, priority: number, delay = 0) {
  const job = await getQueue(queueName).add('eta-test', {}, {
    jobId: randomUUID(), priority, ...(delay ? { delay } : {}),
  });
  jobs.push(job);
  return job;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const job of jobs.splice(0)) await job.remove();
  vi.mocked(log.warn).mockClear();
});

afterAll(async () => {
  // vitest.setup.ts allocates this prefix; never clean the application prefix.
  if (!config.BULLMQ_PREFIX.startsWith('pf-mediakit-test-')) throw new Error('Expected test prefix');
  const keys = await getRedis().keys(`${config.BULLMQ_PREFIX}:*`);
  if (keys.length) await getRedis().del(...keys);
  await closeQueues();
});

describe('462 render ETA with real Redis', () => {
  it('counts eligible waiting, prioritized and delayed jobs, excluding self, lower priority and other queues', async () => {
    const target = await add('normal', 1);
    expect(await getRenderEta({ queueName: 'normal', priority: 1,
      renderId: target.id!, averageSeconds: 8 }, log)).toEqual({ eta_seconds: 1.5, saturated: false });
    await add('normal', 0);
    await add('normal', 1);
    await add('normal', 1, 60000);
    await add('normal', 2);
    await add('batch', 0);
    expect(await getRenderEta({ queueName: 'normal', priority: 1,
      renderId: target.id!, averageSeconds: 8 }, log)).toEqual({ eta_seconds: 25.5, saturated: false });
  });

  it.each<[QueueName, number]>([['urgent', 30], ['normal', 90], ['edit', 180], ['batch', 300]])(
    '%s display cap is %s; exact equality is not saturation', async (queueName, cap) => {
      await add(queueName, 1);
      const request = { queueName, priority: 1, renderId: randomUUID(), averageSeconds: cap - 1.5 };
      expect(await getRenderEta(request, log)).toEqual({ eta_seconds: cap, saturated: false });
      expect(await getRenderEta({ ...request, averageSeconds: cap }, log))
        .toEqual({ eta_seconds: cap, saturated: true });
    },
  );

  it.each<[QueueName, number]>([['urgent', 45], ['normal', 270], ['edit', 900], ['batch', 1800]])(
    '%s active exclusion and warn threshold %s are independent of display caps', async (queueName, threshold) => {
      const queue = getQueue(queueName);
      const predecessor = await add(queueName, 0);
      const worker = new Worker(queue.name, async () => {}, {
        connection: getRedis() as unknown as ConnectionOptions,
        prefix: config.BULLMQ_PREFIX, autorun: false,
      });
      const lockToken = randomUUID();
      const active = await worker.getNextJob(lockToken, { block: false });
      try {
        expect(active?.id).toBe(predecessor.id);
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const request = { queueName, priority: 1, renderId: randomUUID(), averageSeconds: 45 };
        await getRedis().hset(queue.toKey(predecessor.id!), 'processedOn', now - threshold * 1000);
        expect(await getRenderEta(request, log)).toEqual({ eta_seconds: 1.5, saturated: false });
        expect(log.warn).not.toHaveBeenCalled();
        await getRedis().hset(queue.toKey(predecessor.id!), 'processedOn', now - threshold * 1000 - 1);
        expect(await getRenderEta(request, log)).toEqual({ eta_seconds: 1.5, saturated: false });
        expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({
          code: 'RENDER_ACTIVE_OVERDUE', queue: queueName, jobId: predecessor.id,
          threshold_seconds: threshold, elapsed_seconds: threshold + 0.001,
        }), expect.any(String));
        expect(await active!.getState()).toBe('active');
      } finally {
        vi.restoreAllMocks();
        if (active) await active.moveToFailed(new Error('ETA test finished'), lockToken);
        await worker.close();
      }
    },
  );
});
