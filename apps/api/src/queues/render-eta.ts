import type { FastifyBaseLogger } from 'fastify';
import type { PoolClient } from 'pg';
import type { Job } from 'bullmq';
import { getQueue, QUEUE_NAMES, type QueueName, type RenderJobPayload } from './index.js';

// 462: display caps are independent of worker hard-kill deadlines.
const ETA_CAP_SECONDS: Readonly<Record<QueueName, number>> = { urgent: 30, normal: 90, edit: 180, batch: 300 };
const ACTIVE_WARN_SECONDS: Readonly<Record<QueueName, number>> = { urgent: 45, normal: 270, edit: 900, batch: 1800 };

interface EtaRequest {
  queueName: QueueName;
  priority: number;
  renderId: string;
  averageSeconds: number;
}

export interface RenderEta {
  eta_seconds: number;
  saturated: boolean;
}

export async function averageRenderSeconds(
  db: PoolClient, templateId: string, format: 'png' | 'mp4',
): Promise<number> {
  // The frozen template identity survives subsequent project edits; RLS remains in force.
  const history = await db.query<{ average_seconds: number | null }>(
    `SELECT (avg(duration_ms) / 1000)::double precision AS average_seconds FROM (
       SELECT duration_ms FROM renders
       WHERE status = 'succeeded' AND template_snapshot->>'id' = $1
         AND duration_ms >= 0 AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC LIMIT 20
     ) recent`, [templateId],
  );
  return history.rows[0]!.average_seconds ?? (format === 'png' ? 8 : 45);
}

function warnOverdueActive(queueName: QueueName, active: Job[], log: FastifyBaseLogger): void {
  const now = Date.now();
  const warnSeconds = ACTIVE_WARN_SECONDS[queueName];
  for (const job of active) {
    if (job.processedOn !== undefined && now - job.processedOn > warnSeconds * 1000) {
      log.warn({ code: 'RENDER_ACTIVE_OVERDUE', queue: queueName, jobId: job.id,
        elapsed_seconds: (now - job.processedOn) / 1000, threshold_seconds: warnSeconds },
      'Active render exceeded ETA warning threshold');
    }
  }
}

export async function getRenderEta(request: EtaRequest, log: FastifyBaseLogger): Promise<RenderEta> {
  const queue = getQueue(request.queueName);
  const [waiting, active] = await Promise.all([
    queue.getJobs(['waiting', 'prioritized', 'delayed'], 0, -1),
    queue.getJobs(['active'], 0, -1),
  ]);
  warnOverdueActive(request.queueName, active, log);
  const queuedAhead = waiting.filter((job) =>
    job.id !== request.renderId && job.priority <= request.priority).length;
  const seconds = queuedAhead * request.averageSeconds + 1.5;
  const cap = ETA_CAP_SECONDS[request.queueName];
  return { eta_seconds: Math.min(seconds, cap), saturated: seconds > cap };
}

export async function getQueuedRenderEta(
  renderId: string, db: PoolClient, log: FastifyBaseLogger,
): Promise<RenderEta> {
  for (const queueName of QUEUE_NAMES) {
    const job = await getQueue(queueName).getJob(renderId);
    if (!job) continue;
    const payload = job.data as RenderJobPayload;
    const templateId = payload.templateSnapshot['id'];
    if (typeof templateId !== 'string') throw new Error('Render ETA template identity missing');
    const averageSeconds = await averageRenderSeconds(db, templateId, payload.format);
    return getRenderEta({ queueName, priority: job.priority, renderId, averageSeconds }, log);
  }
  // Missing queue state is not an empty queue, so never invent an ETA here.
  throw new Error('Render ETA queue job missing');
}
