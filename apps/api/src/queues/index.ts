/**
 * queues — طوابير BullMQ للرندر (docs/08 §3، توأمة apps/renderer/src/queues.ts).
 *
 * مك-API ينشئ jobs، والعامل في apps/renderer يستهلكها. نستعمل نفس
 * أسماء الطوابير والبادئة لضمان أن العامل يرى ما نضعه.
 *
 * **الحصة العادلة (docs/08 §4):** priority = countWaitingSameTenant × 10 + 1.
 * BullMQ يسحب الأدنى أولاً. مستأجر بلا مهام تسبق مستأجر له طابور طويل.
 */
import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { config } from '../config.js';

// ── اتصال Redis ─────────────────────────────────────
let sharedConn: Redis | null = null;

export function getRedis(): Redis {
  if (!sharedConn) {
    sharedConn = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return sharedConn;
}

function bullmqOptions(): { connection: ConnectionOptions; prefix: string } {
  return {
    connection: getRedis() as unknown as ConnectionOptions,
    prefix: config.BULLMQ_PREFIX,
  };
}

// ── أسماء الطوابير (توأمة renderer) ─────────────────
export const QUEUE_NAMES = ['urgent', 'normal', 'edit', 'batch'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const QUEUE_BULLMQ_NAMES: Readonly<Record<QueueName, string>> = {
  urgent: 'render-urgent',
  normal: 'render-normal',
  edit: 'render-edit',
  batch: 'render-batch',
};

const queues: Partial<Record<QueueName, Queue>> = {};

export function getQueue(name: QueueName): Queue {
  if (!queues[name]) {
    queues[name] = new Queue(QUEUE_BULLMQ_NAMES[name], {
      ...bullmqOptions(),
      defaultJobOptions: {
        removeOnComplete: { count: 100, age: 3600 },
        removeOnFail: { count: 500, age: 24 * 3600 },
      },
    });
  }
  return queues[name]!;
}

// ── شكل المهمة (توأمة renderer/validate.ts) ─────────
export interface RenderJobPayload {
  renderId: string;                      // UUID من renders.id
  tenantId: string;
  projectId: string;
  size: string;                          // 'x'|'instagram'|'feed'|'reel'
  format: 'png' | 'mp4';
  brandSnapshot: Record<string, unknown>; // frozen at POST
  templateSnapshot: Record<string, unknown>;
  content: Record<string, unknown>;
}

// ── الحصة العادلة ───────────────────────────────────
async function computePriority(queueName: QueueName, tenantId: string): Promise<number> {
  const q = getQueue(queueName);
  const waiting = await q.getJobs(['waiting', 'delayed'], 0, -1);
  const sameTenant = waiting.filter((j) => (j.data as RenderJobPayload).tenantId === tenantId).length;
  return sameTenant * 10 + 1;
}

/**
 * enqueue — يُدخل job في الطابور المناسب مع priority عادل.
 * priority: 'urgent' → queue 'urgent'، غيرها → 'normal'.
 */
export async function enqueueRender(
  payload: RenderJobPayload,
  priority: 'urgent' | 'normal',
): Promise<{ jobId: string; queueName: QueueName; priority: number }> {
  const queueName: QueueName = priority === 'urgent' ? 'urgent' : 'normal';
  const jobPriority = await computePriority(queueName, payload.tenantId);
  const q = getQueue(queueName);
  const job = await q.add(`render-${payload.renderId}`, payload, {
    jobId: payload.renderId,
    priority: jobPriority,
  });
  return { jobId: job.id!, queueName, priority: jobPriority };
}

/** إزالة job (للـcancel — إن كان queued أو delayed). */
export async function removeRenderJob(renderId: string): Promise<boolean> {
  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const job = await q.getJob(renderId);
    if (job) {
      await job.remove();
      return true;
    }
  }
  return false;
}

/** إغلاق الاتصالات (للاختبارات + shutdown). */
export async function closeQueues(): Promise<void> {
  for (const name of QUEUE_NAMES) {
    const q = queues[name];
    if (q) await q.close();
  }
  if (sharedConn) {
    await sharedConn.quit();
    sharedConn = null;
  }
}
