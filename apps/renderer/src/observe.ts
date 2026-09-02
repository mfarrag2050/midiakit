// observe — طبقة قراءة فقط للطوابير والمهام (docs/08 §لوحتان).
//
// **العقد:** لا تعديل على queues.ts أو worker.ts. كل الاستعلامات تمرّ
// عبر BullMQ Queue API + عدّادات Redis التي كتبها worker (tenant:*:active).
// أي تحوّل هنا لا يغيّر سلوك الرندر — الرندر يبقى المصدر الأوحد للحقيقة.
//
// **الأداء:** كل الدوال تصدر رد فعل واحد بلا اشتراك. الاستعلامات المتكررة
// من اللوحة تصل عبر polling — لا اشتراكات BullMQ QueueEvents (تفتح
// اتصال Redis منفصلاً لكل مشترك، مكلف على الميني).

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Queue } from 'bullmq';

import {
  getConnection,
  getQueue,
  QUEUE_NAMES,
  BULLMQ_PREFIX,
  type QueueName,
} from './queues.js';
import { DEFAULT_CONFIGS } from './worker.js';

const execFileAsync = promisify(execFile);

// ── عمق الطوابير ──────────────────────────────────────

export interface QueueDepth {
  readonly name: QueueName;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly completed: number;
  readonly failed: number;
  readonly paused: boolean;
  readonly concurrency: number;
}

export async function queueDepth(): Promise<readonly QueueDepth[]> {
  return Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const q = getQueue(name);
      const [counts, isPaused] = await Promise.all([
        q.getJobCounts(
          'waiting',
          'prioritized',
          'active',
          'delayed',
          'completed',
          'failed'
        ),
        q.isPaused(),
      ]);
      // BullMQ 5: مهام ذات priority تدخل مجموعة "prioritized". من منظور
      // العميل، هي منتظرة كذلك — نجمعهما تحت `waiting`.
      return {
        name,
        waiting: (counts['waiting'] ?? 0) + (counts['prioritized'] ?? 0),
        active: counts['active'] ?? 0,
        delayed: counts['delayed'] ?? 0,
        completed: counts['completed'] ?? 0,
        failed: counts['failed'] ?? 0,
        paused: isPaused,
        concurrency: DEFAULT_CONFIGS[name].concurrency,
      };
    })
  );
}

// ── المهام النشطة وأعمارها ────────────────────────────

export interface ActiveJobInfo {
  readonly jobId: string;
  readonly queue: QueueName;
  readonly tenantId: string;
  readonly templateId: string;
  /** عمر المهمة منذ بدء المعالجة (ms). */
  readonly ageMs: number;
  /** تقدّم المهمة إن أبلغه العامل (0..100)، وإلا null. */
  readonly progress: number | null;
}

export async function activeJobs(): Promise<readonly ActiveJobInfo[]> {
  const now = Date.now();
  const perQueue = await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const q = getQueue(name);
      const jobs = await q.getActive(0, 100);
      return jobs.map((j) => {
        const data = (j.data ?? {}) as {
          tenantId?: string;
          templateId?: string;
        };
        const started = j.processedOn ?? now;
        const rawProgress = j.progress;
        const progress =
          typeof rawProgress === 'number'
            ? Math.max(0, Math.min(100, rawProgress))
            : null;
        return {
          jobId: j.id ?? '?',
          queue: name,
          tenantId: data.tenantId ?? 'unknown',
          templateId: data.templateId ?? 'unknown',
          ageMs: Math.max(0, now - started),
          progress,
        } satisfies ActiveJobInfo;
      });
    })
  );
  return perQueue.flat();
}

// ── متوسط زمن المعالجة (per queue) — للتقدير ───────────

/**
 * متوسط زمن معالجة آخر N مهمة مكتملة. يُستعمل لتقدير زمن البدء.
 * إن لم توجد مهام مكتملة، نستعمل الافتراضي لكل طابور.
 */
const DEFAULT_AVG_MS: Readonly<Record<QueueName, number>> = {
  urgent: 3_000,  // فيديو قصير ≤20s → ~2-3s رندر بعد RenderPlan
  normal: 5_000,  // ريلز أطول
  edit: 60_000,   // تحرير — تقدير محافظ
  batch: 30_000,
};

async function avgProcessingMs(q: Queue, name: QueueName): Promise<number> {
  const completed = await q.getCompleted(0, 20);
  if (completed.length === 0) return DEFAULT_AVG_MS[name];
  let sum = 0;
  let n = 0;
  for (const j of completed) {
    if (j.processedOn && j.finishedOn && j.finishedOn > j.processedOn) {
      sum += j.finishedOn - j.processedOn;
      n++;
    }
  }
  return n > 0 ? sum / n : DEFAULT_AVG_MS[name];
}

// ── موقع مهمة + زمن البدء المتوقع ─────────────────────

export type JobStatus =
  | 'waiting'
  | 'prioritized'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface JobPositionInfo {
  readonly jobId: string;
  readonly queue: QueueName | null;
  readonly status: JobStatus;
  /** 1-indexed. متاح فقط للحالة waiting؛ null غير ذلك. */
  readonly position: number | null;
  /** ثانية متوقعة قبل بدء الرندر. null إن كانت المهمة نشطة/منتهية. */
  readonly expectedStartSec: number | null;
  /** progress للحالة active، وإلا null. */
  readonly progress: number | null;
}

/**
 * يبحث عن مهمة عبر الطوابير الأربعة ويعيد موقعها + تقدير البدء.
 * الحساب: `expectedStartSec = (position - 1) * avgMs / concurrency / 1000`
 * — تقريب معقول ما دام العمّال مستقرين. لا يحسب مهام delayed.
 */
export async function jobPosition(jobId: string): Promise<JobPositionInfo> {
  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const job = await q.getJob(jobId);
    if (!job) continue;
    const state = (await job.getState()) as JobStatus;

    if (state === 'waiting' || state === 'prioritized') {
      // BullMQ 5: مهام ذات priority تدخل مجموعة "prioritized" وتُسحب قبل waiting.
      // نحسب الموقع الفعلي بدمج القائمتين مع مراعاة الأولوية.
      const [prioritized, waiting] = await Promise.all([
        q.getPrioritized(0, 500),
        q.getWaiting(0, 500),
      ]);
      const combined = [...prioritized, ...waiting];
      const idx = combined.findIndex((j) => j.id === jobId);
      const position = idx >= 0 ? idx + 1 : null;
      const avgMs = await avgProcessingMs(q, name);
      const concurrency = DEFAULT_CONFIGS[name].concurrency;
      // مع c عمّال متوازيين، المهمة رقم p تبدأ عند t = floor((p-1)/c) * avgMs.
      // مثلاً c=2, avg=3s: [pos1→0, pos2→0, pos3→3, pos4→3, pos5→6…].
      const expectedStartSec =
        position !== null
          ? Math.max(0, (Math.floor((position - 1) / concurrency) * avgMs) / 1000)
          : null;
      return {
        jobId,
        queue: name,
        status: state,
        position,
        expectedStartSec,
        progress: null,
      };
    }

    if (state === 'active') {
      const rawProgress = job.progress;
      const progress =
        typeof rawProgress === 'number'
          ? Math.max(0, Math.min(100, rawProgress))
          : null;
      return {
        jobId,
        queue: name,
        status: 'active',
        position: 0,
        expectedStartSec: 0,
        progress,
      };
    }

    return {
      jobId,
      queue: name,
      status: state,
      position: null,
      expectedStartSec: null,
      progress: null,
    };
  }
  return {
    jobId,
    queue: null,
    status: 'unknown',
    position: null,
    expectedStartSec: null,
    progress: null,
  };
}

/** يعيد كل مهام مستأجر عبر الطوابير (waiting + prioritized + active + delayed). */
export async function tenantJobs(tenantId: string): Promise<readonly JobPositionInfo[]> {
  const out: JobPositionInfo[] = [];
  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const [prioritized, waiting, active, delayed] = await Promise.all([
      q.getPrioritized(0, 500),
      q.getWaiting(0, 500),
      q.getActive(0, 100),
      q.getDelayed(0, 100),
    ]);
    const combined = [...prioritized, ...waiting];
    const avgMs = await avgProcessingMs(q, name);
    const concurrency = DEFAULT_CONFIGS[name].concurrency;

    const matchTenant = <T extends { data: unknown }>(jobs: readonly T[]): T[] =>
      jobs.filter(
        (j) => (j.data as { tenantId?: string }).tenantId === tenantId
      );

    for (const j of matchTenant(active)) {
      const rawProgress = j.progress;
      const progress =
        typeof rawProgress === 'number'
          ? Math.max(0, Math.min(100, rawProgress))
          : null;
      out.push({
        jobId: j.id ?? '?',
        queue: name,
        status: 'active',
        position: 0,
        expectedStartSec: 0,
        progress,
      });
    }
    for (const j of matchTenant(combined)) {
      const idx = combined.findIndex((w) => w.id === j.id);
      const position = idx + 1;
      const isPrio = idx < prioritized.length;
      out.push({
        jobId: j.id ?? '?',
        queue: name,
        status: isPrio ? 'prioritized' : 'waiting',
        position,
        expectedStartSec: Math.max(0, ((position - 1) * avgMs) / concurrency / 1000),
        progress: null,
      });
    }
    for (const j of matchTenant(delayed)) {
      out.push({
        jobId: j.id ?? '?',
        queue: name,
        status: 'delayed',
        position: null,
        expectedStartSec: null,
        progress: null,
      });
    }
  }
  return out;
}

// ── معدل الفشل + تصنيف الأسباب ────────────────────────

export interface FailureBreakdown {
  readonly windowHours: number;
  readonly totalFailures: number;
  readonly totalCompleted: number;
  /** نسبة الفشل من (فشل + مكتمل). صفر إن لا مهام. */
  readonly failureRate: number;
  readonly reasons: ReadonlyArray<{ readonly category: string; readonly count: number }>;
}

const REASON_PATTERNS: ReadonlyArray<{ re: RegExp; category: string }> = [
  { re: /\[timeout\]/i, category: 'timeout' },
  { re: /\[tenant-cap\]/i, category: 'tenant-cap' },
  { re: /RenderJobValidationError|\[templateId\]|\[size\]|\[brand\]|\[content\]|\[tenantId\]|\[outPath\]|\[fps\]/i, category: 'validation' },
  { re: /ffmpeg|EPIPE|spawn/i, category: 'ffmpeg' },
  { re: /ENOENT|ENOTDIR|EACCES/i, category: 'fs' },
];

function classifyReason(reason: string | undefined): string {
  if (!reason) return 'unknown';
  for (const p of REASON_PATTERNS) if (p.re.test(reason)) return p.category;
  return 'other';
}

export async function failureRate(windowHours = 24): Promise<FailureBreakdown> {
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  let totalFailures = 0;
  let totalCompleted = 0;
  const counts = new Map<string, number>();

  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const [failed, completed] = await Promise.all([
      q.getFailed(0, 500),
      q.getCompleted(0, 500),
    ]);
    for (const j of failed) {
      const ts = j.finishedOn ?? j.processedOn ?? j.timestamp ?? 0;
      if (ts < cutoff) continue;
      totalFailures++;
      const cat = classifyReason(j.failedReason);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    for (const j of completed) {
      const ts = j.finishedOn ?? j.processedOn ?? j.timestamp ?? 0;
      if (ts >= cutoff) totalCompleted++;
    }
  }

  const total = totalFailures + totalCompleted;
  const reasons = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    windowHours,
    totalFailures,
    totalCompleted,
    failureRate: total > 0 ? totalFailures / total : 0,
    reasons,
  };
}

// ── موارد النظام: CPU · ذاكرة · قرص ───────────────────

export interface ResourceUsage {
  readonly cpuLoadAvg1m: number;
  readonly cpuLoadAvg5m: number;
  readonly cpuLoadAvg15m: number;
  readonly cores: number;
  readonly memTotalGB: number;
  readonly memUsedGB: number;
  readonly memUsedPct: number;
  readonly diskTotalGB: number | null;
  readonly diskUsedGB: number | null;
  readonly diskUsedPct: number | null;
  /** مسار الفحص للقرص — عادةً tmpdir (حيث تكتب المهام مخرجاتها). */
  readonly diskPath: string;
}

/**
 * يستعلم `df -k -P <path>` — نصف الوحدات KB لسهولة الحساب.
 * على أي فشل (المسار غير موجود، df غير متاح)، يعيد null بدل أن يكسر اللوحة.
 */
async function diskUsage(path: string): Promise<{
  totalGB: number;
  usedGB: number;
  usedPct: number;
} | null> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '-P', path], {
      timeout: 2000,
    });
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1]!.trim().split(/\s+/);
    // Filesystem 1K-blocks Used Available Capacity Mounted
    const totalKB = Number(parts[1]);
    const usedKB = Number(parts[2]);
    if (!Number.isFinite(totalKB) || !Number.isFinite(usedKB) || totalKB === 0) {
      return null;
    }
    return {
      totalGB: totalKB / 1024 / 1024,
      usedGB: usedKB / 1024 / 1024,
      usedPct: (usedKB / totalKB) * 100,
    };
  } catch {
    return null;
  }
}

export async function resourceUsage(): Promise<ResourceUsage> {
  const loads = os.loadavg();
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const cores = os.cpus().length;

  const diskPath = process.env['RENDER_TMPDIR'] ?? os.tmpdir();
  const disk = await diskUsage(diskPath);

  const toGB = (b: number): number => b / 1024 / 1024 / 1024;
  return {
    cpuLoadAvg1m: loads[0] ?? 0,
    cpuLoadAvg5m: loads[1] ?? 0,
    cpuLoadAvg15m: loads[2] ?? 0,
    cores,
    memTotalGB: toGB(totalBytes),
    memUsedGB: toGB(usedBytes),
    memUsedPct: (usedBytes / totalBytes) * 100,
    diskTotalGB: disk?.totalGB ?? null,
    diskUsedGB: disk?.usedGB ?? null,
    diskUsedPct: disk?.usedPct ?? null,
    diskPath,
  };
}

// ── التوزيع بين العملاء ───────────────────────────────

export interface TenantDistribution {
  readonly tenantId: string;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
}

export async function tenantDistribution(): Promise<readonly TenantDistribution[]> {
  const map = new Map<string, { waiting: number; active: number; delayed: number }>();

  const bump = (
    tenantId: string,
    slot: 'waiting' | 'active' | 'delayed'
  ): void => {
    if (!map.has(tenantId)) {
      map.set(tenantId, { waiting: 0, active: 0, delayed: 0 });
    }
    map.get(tenantId)![slot]++;
  };

  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const [waiting, prioritized, active, delayed] = await Promise.all([
      q.getWaiting(0, 500),
      q.getPrioritized(0, 500),
      q.getActive(0, 100),
      q.getDelayed(0, 100),
    ]);
    for (const j of waiting)
      bump((j.data as { tenantId?: string }).tenantId ?? 'unknown', 'waiting');
    for (const j of prioritized)
      bump((j.data as { tenantId?: string }).tenantId ?? 'unknown', 'waiting');
    for (const j of active)
      bump((j.data as { tenantId?: string }).tenantId ?? 'unknown', 'active');
    for (const j of delayed)
      bump((j.data as { tenantId?: string }).tenantId ?? 'unknown', 'delayed');
  }

  // نضيف عدّاد active من Redis (الحقيقة لدى worker.ts) — يكشف تسرّب
  const conn = getConnection();
  const activeKeys = await conn.keys(`${BULLMQ_PREFIX}:tenant:*:active`);
  for (const k of activeKeys) {
    const match = k.match(/tenant:(.+):active$/);
    if (!match) continue;
    const tenantId = match[1]!;
    const value = Number(await conn.get(k));
    if (!Number.isFinite(value) || value <= 0) continue;
    // لا نستبدل — نأخذ الأكبر بين ما رأيناه من getActive وما في العدّاد
    const cur = map.get(tenantId) ?? { waiting: 0, active: 0, delayed: 0 };
    if (value > cur.active) {
      map.set(tenantId, { ...cur, active: value });
    }
  }

  return Array.from(map.entries())
    .map(([tenantId, v]) => ({ tenantId, ...v }))
    .sort((a, b) => b.active + b.waiting - (a.active + a.waiting));
}

// ── حالة النظام (للعميل: عادي/ضغط/صيانة) ─────────────

export type SystemStatus = 'normal' | 'degraded' | 'maintenance';

export const MAINTENANCE_KEY = `${BULLMQ_PREFIX}:sys:maintenance`;

/**
 * `reasonKey` مفتاح i18n (system.reasonMaintenance / ...Busy / ...Paused /
 * ...Normal) لا نص عربي. الترجمة تحدث في الواجهة. يجنّبنا تسرّب لغة
 * الخادم إلى وضع en/mixed.
 */
export type SystemReasonKey =
  | 'system.reasonMaintenance'
  | 'system.reasonBusy'
  | 'system.reasonPaused'
  | 'system.reasonNormal';

export async function systemStatus(): Promise<{
  readonly status: SystemStatus;
  readonly reasonKey: SystemReasonKey;
}> {
  const conn = getConnection();
  const maint = await conn.get(MAINTENANCE_KEY);
  if (maint === '1') {
    return { status: 'maintenance', reasonKey: 'system.reasonMaintenance' };
  }

  const depths = await queueDepth();
  const urgent = depths.find((d) => d.name === 'urgent');
  const normal = depths.find((d) => d.name === 'normal');
  if ((urgent?.waiting ?? 0) > 10 || (normal?.waiting ?? 0) > 20) {
    return { status: 'degraded', reasonKey: 'system.reasonBusy' };
  }
  const anyPaused = depths.some((d) => d.paused);
  if (anyPaused) {
    return { status: 'degraded', reasonKey: 'system.reasonPaused' };
  }

  return { status: 'normal', reasonKey: 'system.reasonNormal' };
}
