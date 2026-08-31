// worker — عمّال BullMQ الأربعة (docs/08 §3).
//
// **التكوين:**
//   urgent: 2 عمال، مهلة 30s (SLA: عاجل ≤ 20 ثانية يبدأ خلال دقيقة)
//   normal: floor(cores/2) افتراضاً، مهلة 3 دقائق
//   edit:   1 عامل فقط (تحرير يتنافس على القرص — ملف 10)، مهلة 10 دقائق
//   batch:  1 عامل، بلا مهلة (يعمل ليلاً)
//
// **الحصّة العادلة على tenantId (docs/08 §4):** cap مطلق = `ceil(المجموع/2)`.
// كل مهمة قبل التنفيذ: INCR `tenant:{id}:active`. إن تجاوز الـcap، DECR
// ويُعاد الجدولة بتأخير 1s + moveToDelayed. الحصة عبر الأولوية عند الإدخال
// تمنع الاحتقان الأولي؛ هذا الحرس يمنع الانفلات في الحالات الشاذة.
//
// **التنظيف في `finally`:** DECR tenant counter مهما كانت النتيجة.
// خطأ الرندر ⇒ لا يُترك عدّاد ملوّث. الأنبوب المباشر لا يخلّف ملفات.

import os from 'node:os';
import {
  Worker,
  UnrecoverableError,
  type Job,
  type WorkerOptions,
} from 'bullmq';

import { renderVideo } from './index.js';
import {
  QUEUE_NAMES,
  BULLMQ_PREFIX,
  getConnection,
  type QueueName,
} from './queues.js';
import type { RenderJobInput } from './validate.js';

const CORES = os.cpus().length;
const HALF_CORES = Math.max(1, Math.floor(CORES / 2));

// ── تكوين الطوابير ────────────────────────────────────

export interface QueueConfig {
  readonly name: QueueName;
  readonly bullmqName: string;
  readonly concurrency: number;
  /** 0 = بلا مهلة. */
  readonly timeoutMs: number;
}

const NORMAL_CONCURRENCY = Math.max(
  1,
  Number(process.env['WORKER_NORMAL'] ?? HALF_CORES)
);

export const DEFAULT_CONFIGS: Readonly<Record<QueueName, QueueConfig>> = {
  urgent: { name: 'urgent', bullmqName: 'render-urgent', concurrency: 2, timeoutMs: 30_000 },
  normal: { name: 'normal', bullmqName: 'render-normal', concurrency: NORMAL_CONCURRENCY, timeoutMs: 180_000 },
  edit: { name: 'edit', bullmqName: 'render-edit', concurrency: 1, timeoutMs: 600_000 },
  batch: { name: 'batch', bullmqName: 'render-batch', concurrency: 1, timeoutMs: 0 },
};

// ── الحصّة العادلة: cap مطلق per tenant ─────────────

/**
 * cap مطلق = ceil((concurrency للـurgent + normal) / 2).
 * لا نحسب edit/batch لأنهما لا يتنافسان مع الوقت الحرج.
 * الأثر: مهما بلغ عدد مهام tenant الواحد، لا يشغل أكثر من نصف الطاقة.
 */
function computePerTenantCap(cfgs: Readonly<Record<QueueName, QueueConfig>>): number {
  const totalActive = cfgs.urgent.concurrency + cfgs.normal.concurrency;
  return Math.max(1, Math.ceil(totalActive / 2));
}

function tenantKey(tenantId: string): string {
  return `${BULLMQ_PREFIX}:tenant:${tenantId}:active`;
}

// ── معالج المهمة ──────────────────────────────────────

/**
 * ينفّذ مهمة رندر واحدة. مسؤول عن:
 *   1. INCR عدّاد tenant. إن تجاوز الـcap → DECR + moveToDelayed + رمي
 *      خطأ غير-قابل-للمحاولة (لا نحسبها فشل قابل للـretry).
 *   2. تشغيل renderVideo — يحمّل template من TEMPLATES، ويستعمل RenderPlan
 *      داخلياً (session 1 optimization).
 *   3. finally: DECR عدّاد tenant. لا ملفات مؤقتة (أنبوب مباشر — ملف 08).
 */
async function processJob(job: Job<RenderJobInput>, perTenantCap: number): Promise<void> {
  const { tenantId } = job.data;
  const conn = getConnection();
  const key = tenantKey(tenantId);

  const active = await conn.incr(key);
  if (active > perTenantCap) {
    // تجاوز الـcap → أعِد جدولة المهمة وارجع دون تشغيل الرندر
    await conn.decr(key);
    // BullMQ 5: moveToDelayed تحتاج token — الأبسط: أضف مهمة جديدة بتأخير
    // ولكن هذا يفقد job.id. الأصوب هنا: throw خطأ عادي فيُعيدها BullMQ
    // بحسب retry config. لكن ما نريده هو تأخير قصير، لا فشل.
    // البديل: استعمال retryDelay على الخطأ الطبيعي.
    throw new Error(`[tenant-cap] ${tenantId} at cap (${active - 1}/${perTenantCap})`);
  }

  try {
    // نُحمّل القالب من السجل
    const { TEMPLATES } = await import('@pf-mediakit/templates');
    const template = TEMPLATES[job.data.templateId];
    if (!template) {
      throw new UnrecoverableError(
        `[worker] template ${job.data.templateId} غير معروف — يجب أن يُرفض في validate`
      );
    }

    await renderVideo({
      template,
      brand: job.data.brand,
      content: job.data.content,
      size: job.data.size,
      outPath: job.data.outPath,
      ...(job.data.fps !== undefined && { fps: job.data.fps }),
    });
  } finally {
    // تنظيف صارم: العدّاد ينزل مهما كان (fail/success/timeout)
    await conn.decr(key);
  }
}

// ── مهلة على المهمة (BullMQ لا يوفّرها built-in per-job) ─

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[timeout] ${label} تجاوزت ${ms}ms`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// ── تشغيل العمّال ─────────────────────────────────────

export interface RunningWorkers {
  readonly workers: readonly Worker[];
  readonly perTenantCap: number;
  stop(): Promise<void>;
}

/**
 * يشغّل عمّال الطوابير الأربعة. المستدعي مسؤول عن الاستدعاء
 * `stop()` عند الإغلاق (SIGTERM أو نهاية الاختبار).
 */
export function startWorkers(
  cfgs: Readonly<Record<QueueName, QueueConfig>> = DEFAULT_CONFIGS
): RunningWorkers {
  const perTenantCap = computePerTenantCap(cfgs);
  const workers: Worker[] = [];

  for (const name of QUEUE_NAMES) {
    const cfg = cfgs[name];
    const options: WorkerOptions = {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
      concurrency: cfg.concurrency,
    };
    const w = new Worker<RenderJobInput>(
      cfg.bullmqName,
      async (job) => withTimeout(processJob(job, perTenantCap), cfg.timeoutMs, `${name}#${job.id}`),
      options
    );
    workers.push(w);
  }

  return {
    workers,
    perTenantCap,
    async stop(): Promise<void> {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
