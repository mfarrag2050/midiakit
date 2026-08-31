// queues — أربعة طوابير BullMQ للمهام (docs/08 §3).
//
// **العزل عن Redis المشترك (2026-08-31):** الميني يشترك Redis مع مشاريع
// أخرى (منهاج/PrimeMind). نستعمل:
//   • REDIS_URL بقاعدة مفصولة (افتراضاً /3)
//   • BULLMQ_PREFIX = 'pf-mediakit' يسبق كل مفاتيح Redis
// كلاهما من متغيرات البيئة مع افتراضات في .env.example.
//
// **الحصّة العادلة عبر الأولوية (docs/08 §4):** قبل add، نحسب priority
// من عدد المهام المنتظرة لنفس tenantId — الأولوية = count × 10 + 1.
// BullMQ يسحب الأدنى رقماً أولاً، فمهام tenant بلا مهام تسبق tenant له
// طابور طويل. توزيع بالتناوب عملياً بلا حاجة لمخطّط مخصص.

import { Queue, QueueEvents, type ConnectionOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

import { validateRenderJob, type RenderJobInput } from './validate.js';

// ── إعدادات الاتصال ───────────────────────────────────

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3';
export const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX ?? 'pf-mediakit';

/**
 * اتصال Redis مُعاد استعماله. `maxRetriesPerRequest: null` مطلوب لـBullMQ.
 * ننشئه lazy — أول استدعاء لـconnection() يفتحه.
 */
let sharedConnection: Redis | null = null;

export function getConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return sharedConnection;
}

export function bullmqConnection(): ConnectionOptions {
  // نمرّر URL مباشرةً — BullMQ ينشئ اتصاله بالإعدادات الصحيحة
  return {
    connection: getConnection(),
  } as unknown as ConnectionOptions;
}

// ── أسماء الطوابير ────────────────────────────────────

export const QUEUE_NAMES = ['urgent', 'normal', 'edit', 'batch'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const QUEUE_BULLMQ_NAMES: Readonly<Record<QueueName, string>> = {
  urgent: 'render-urgent',
  normal: 'render-normal',
  edit: 'render-edit',
  batch: 'render-batch',
};

// ── الطوابير الأربعة ──────────────────────────────────

/**
 * كل طابور Queue مُنشأ lazy عند أول طلب. تحرير الاتصال يتم من
 * `closeQueues()` (تُستدعى في الاختبارات وعند إيقاف العامل).
 */
const queues: Partial<Record<QueueName, Queue>> = {};

export function getQueue(name: QueueName): Queue {
  if (!queues[name]) {
    queues[name] = new Queue(QUEUE_BULLMQ_NAMES[name], {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
      defaultJobOptions: {
        removeOnComplete: { count: 100, age: 3600 }, // 100 مكتملة أو ساعة
        removeOnFail: { count: 500, age: 24 * 3600 }, // 500 فاشلة أو يوم
      },
    });
  }
  return queues[name]!;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(Object.values(queues).map((q) => q?.close()));
  Object.keys(queues).forEach((k) => delete queues[k as QueueName]);
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

// ── الحصّة العادلة عبر الأولوية ───────────────────────

/**
 * يحسب أولوية المهمة الجديدة لتنفيذ round-robin بين المستأجرين.
 * BullMQ priority: 0 = الأعلى، أرقام أكبر = أدنى.
 * الصيغة: `1 + (عدد المهام المنتظرة لهذا tenantId × 10)`. مستأجر بلا
 * طابور ⇒ 1، مستأجر بمهمة واحدة منتظرة ⇒ 11، بمهمتين ⇒ 21…
 *
 * الأثر: عند إضافة مهمة جديدة، تصطف في الأولوية خلف مهام tenants
 * الأخرى الأقل ازدحاماً — round-robin طبيعي.
 *
 * **لا يفحص المهام النشطة** (فقط المنتظرة). النشطة يحدّها cap الـworker.
 */
async function computeFairSharePriority(
  queue: Queue,
  tenantId: string
): Promise<number> {
  const waiting = await queue.getWaiting(0, 500);
  const tenantWaiting = waiting.filter(
    (j) => (j.data as { tenantId?: string }).tenantId === tenantId
  ).length;
  return 1 + tenantWaiting * 10;
}

// ── الواجهة العامة: enqueue ───────────────────────────

export interface EnqueueOptions {
  /** أولوية إدارية صريحة — يتخطى الحساب التلقائي (0 = الأعلى). */
  readonly forcePriority?: number;
  /** مؤقتاً: تأخير أوّلي قبل معالجة المهمة (بالميلي ثانية). */
  readonly delayMs?: number;
}

/**
 * يُدخل مهمة رندر في طابور محدد **بعد** التحقق من صحة المدخل.
 * الأخطاء:
 *   • `RenderJobValidationError` قبل أيّ تفاعل مع Redis
 *   • خطأ Redis إن سقط الاتصال (يبلَّغ للمستدعي)
 *
 * @returns معرّف المهمة في BullMQ (يمكن الاستعلام عن حالتها لاحقاً)
 */
export async function enqueueRenderJob(
  queueName: QueueName,
  input: unknown,
  opts: EnqueueOptions = {}
): Promise<string> {
  // (١) تحقق **قبل** أيّ لمس لـRedis (docs/08 §5: عزل الفشل)
  const job = validateRenderJob(input);

  // (٢) الأولوية: حصة عادلة، ما لم يكن هناك تخطٍّ إداري
  const queue = getQueue(queueName);
  const priority =
    opts.forcePriority ?? (await computeFairSharePriority(queue, job.tenantId));

  // (٣) إضافة
  const added = await queue.add(queueName, job, {
    priority,
    ...(opts.delayMs !== undefined && { delay: opts.delayMs }),
  });

  if (!added.id) {
    throw new Error('[enqueueRenderJob] فشل الحصول على معرّف المهمة');
  }
  return added.id;
}

// ── ملخّص للاستعلام / التشخيص ─────────────────────────

export interface QueueSnapshot {
  readonly name: QueueName;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly completed: number;
  readonly failed: number;
}

export async function queueSnapshot(name: QueueName): Promise<QueueSnapshot> {
  const q = getQueue(name);
  const counts = await q.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'completed',
    'failed'
  );
  return {
    name,
    waiting: counts['waiting'] ?? 0,
    active: counts['active'] ?? 0,
    delayed: counts['delayed'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
  };
}

export async function allQueuesSnapshot(): Promise<readonly QueueSnapshot[]> {
  return Promise.all(QUEUE_NAMES.map((n) => queueSnapshot(n)));
}

/**
 * ينشئ مستمع أحداث لطابور — يستعمله المستدعي لتتبّع active/completed/failed
 * بلا فتح اتصال Redis منفصل.
 */
export function createQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(QUEUE_BULLMQ_NAMES[name], {
    connection: getConnection(),
    prefix: BULLMQ_PREFIX,
  });
}

export type { RenderJobInput };
