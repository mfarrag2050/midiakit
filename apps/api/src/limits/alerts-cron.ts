/**
 * alerts-cron — worker BullMQ مستقلّ عن renders يُشغّل:
 *   • runAlertCycle() كل 5 دقائق (4 عتبات تتغيّر ببطء)
 *   • runOrphanSweep() يومياً 03:00 UTC (LIMITS-1 §2)
 *
 * قرار المالك 2026-09-07: كل دقيقة = 1440 دورة يومياً بلا مقابل.
 * 5 دقائق كافٍ لعتبات القرص/الطابور/العامل المعلّق.
 *
 * ثمن معلَن: التنبيه يعمل داخل العامل — إن سقط العامل، لا ينبّه
 * سقوطه شيء. حلّ جزئي = process supervisor خارجي (systemd/pm2/docker
 * restart) خارج mk-api.
 *
 * temp-space > 25GB (الحالة الخامسة) يُطلَق من داخل api-worker أثناء
 * المهمة (TempSpaceExceededError)، لا من هنا.
 */
import { Queue, Worker, type WorkerOptions } from 'bullmq';
import type { Pool } from 'pg';
import { getConnection, BULLMQ_PREFIX } from '@pf-mediakit/renderer/queues';
import { runAlertCycle } from '@pf-mediakit/renderer/alerts';
import { runOrphanSweep } from './orphan-sweep.js';

export const ALERTS_QUEUE = 'alerts-cron';
export const ALERT_CYCLE_JOB = 'alert-cycle';
export const ORPHAN_SWEEP_JOB = 'orphan-sweep';

/**
 * يُنشئ queue + workers + repeatable jobs. يُستدعى من bootstrap
 * منفصل (لا يعمل ضمن api-worker لأنه لا يتنافس على fair-share).
 */
export async function startAlertsCron(
  migPool: Pool,
): Promise<{ queue: Queue; worker: Worker; stop: () => Promise<void> }> {
  const conn = getConnection();
  const queue = new Queue(ALERTS_QUEUE, { connection: conn, prefix: BULLMQ_PREFIX });

  // إضافة repeatable jobs (idempotent — BullMQ يتجاهل التكرار)
  await queue.add(ALERT_CYCLE_JOB, {}, {
    repeat: { pattern: '*/5 * * * *' }, // كل 5 دقائق
    removeOnComplete: 100, removeOnFail: 100,
  });
  await queue.add(ORPHAN_SWEEP_JOB, {}, {
    repeat: { pattern: '0 3 * * *' }, // يومياً 03:00 UTC
    removeOnComplete: 30, removeOnFail: 30,
  });

  const options: WorkerOptions = {
    connection: conn, prefix: BULLMQ_PREFIX, concurrency: 1,
  };
  const worker = new Worker(ALERTS_QUEUE, async (job) => {
    if (job.name === ALERT_CYCLE_JOB) {
      const summary = await runAlertCycle();
      return { checked: summary.checked, fired: summary.fired, webhookUp: summary.webhookUp };
    }
    if (job.name === ORPHAN_SWEEP_JOB) {
      const r = await runOrphanSweep(migPool);
      return r;
    }
    return { skipped: job.name };
  }, options);

  return {
    queue, worker,
    async stop() {
      await worker.close();
      await queue.close();
    },
  };
}
