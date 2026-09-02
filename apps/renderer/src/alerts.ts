// alerts — تنبيهات على العتبات الحرجة (docs/08 §المراقبة).
//
// **الحالة الحالية:** واجهة webhook فقط — لا تكامل تيليجرام هنا. الاستدعاء
// من jobs مجدولة (cron) أو من داخل حلقة observe الخاصة بالوب هوك.
//
// **De-duplication:** كل تنبيه له مفتاح Redis TTL. لا نطلق نفس التنبيه
// أكثر من مرة كل REPEAT_WINDOW_SEC. يمنع طوفان الويب هوك عند عتبة عالقة.
//
// **العتبات (من docs/08 §المراقبة):**
//   • فشل مهمة (نطلق فوراً، بلا de-dup لأن كل failure حالة مستقلة)
//   • قرص > 80%
//   • عمق طابور > 10 (per queue)
//   • عامل معلّق > 5 دقائق (active job age)

import { getConnection, BULLMQ_PREFIX, QUEUE_NAMES } from './queues.js';
import {
  activeJobs,
  queueDepth,
  resourceUsage,
  failureRate,
  MAINTENANCE_KEY,
} from './observe.js';

// ── العتبات ──────────────────────────────────────────

export const DISK_PCT_THRESHOLD = 80;
export const QUEUE_DEPTH_THRESHOLD = 10;
export const WORKER_STUCK_MS = 5 * 60 * 1000;
export const REPEAT_WINDOW_SEC = 15 * 60; // 15 دقيقة قبل إعادة إطلاق نفس التنبيه

// ── نوع الحدث ────────────────────────────────────────

export type AlertCode =
  | 'job-failed'
  | 'disk-high'
  | 'queue-deep'
  | 'worker-stuck'
  | 'system-maintenance';

export type AlertSeverity = 'info' | 'warn' | 'crit';

export interface AlertEvent {
  readonly ts: string;
  readonly code: AlertCode;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly data: Readonly<Record<string, unknown>>;
  /** مفتاح فريد للتجميع/de-dup. */
  readonly key: string;
}

// ── webhook (بيئة) ────────────────────────────────────

const WEBHOOK_URL = process.env['ALERT_WEBHOOK_URL'] ?? '';

/**
 * يطلق التنبيه على الويب هوك. صمت إن لم يكن ALERT_WEBHOOK_URL محدداً
 * (بيئة التطوير). خطأ الشبكة يُبتلع مع log — التنبيه لا يجب أن يوقف الرندر.
 */
export async function fireWebhook(event: AlertEvent): Promise<boolean> {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[alerts] webhook ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[alerts] webhook failed: ${String(err)}`);
    return false;
  }
}

// ── De-duplication ───────────────────────────────────

function dedupKey(code: AlertCode, key: string): string {
  return `${BULLMQ_PREFIX}:alerts:sent:${code}:${key}`;
}

async function shouldFire(event: AlertEvent): Promise<boolean> {
  const conn = getConnection();
  const k = dedupKey(event.code, event.key);
  // SET NX EX — يعيد OK إن كان جديداً، null إن كان موجوداً
  const result = await conn.set(k, event.ts, 'EX', REPEAT_WINDOW_SEC, 'NX');
  return result === 'OK';
}

// ── فحص العتبات ──────────────────────────────────────

/**
 * يفحص كل العتبات ويعيد قائمة الأحداث الجديدة (لم تُطلق مؤخراً).
 * المستدعي يطلقها عبر `fireWebhook` بحسب اختياره — نفصل الفحص عن الإطلاق
 * لسهولة الاختبار.
 */
export async function checkThresholds(): Promise<readonly AlertEvent[]> {
  const now = new Date().toISOString();
  const candidates: AlertEvent[] = [];

  // 1. قرص عالٍ
  const res = await resourceUsage();
  if (res.diskUsedPct !== null && res.diskUsedPct > DISK_PCT_THRESHOLD) {
    candidates.push({
      ts: now,
      code: 'disk-high',
      severity: res.diskUsedPct > 90 ? 'crit' : 'warn',
      message: `القرص ${res.diskUsedPct.toFixed(1)}% مستخدم (${res.diskPath})`,
      data: {
        diskPath: res.diskPath,
        diskUsedPct: res.diskUsedPct,
        diskTotalGB: res.diskTotalGB,
      },
      key: 'root',
    });
  }

  // 2. عمق الطابور
  const depths = await queueDepth();
  for (const d of depths) {
    if (d.waiting > QUEUE_DEPTH_THRESHOLD) {
      candidates.push({
        ts: now,
        code: 'queue-deep',
        severity: d.name === 'urgent' ? 'crit' : 'warn',
        message: `طابور ${d.name} فيه ${d.waiting} مهمة منتظرة`,
        data: { queue: d.name, waiting: d.waiting },
        key: d.name,
      });
    }
  }

  // 3. عامل معلّق
  const jobs = await activeJobs();
  for (const j of jobs) {
    if (j.ageMs > WORKER_STUCK_MS) {
      candidates.push({
        ts: now,
        code: 'worker-stuck',
        severity: 'warn',
        message: `مهمة ${j.jobId} في ${j.queue} تعمل منذ ${(j.ageMs / 60000).toFixed(1)} دقيقة`,
        data: {
          jobId: j.jobId,
          queue: j.queue,
          tenantId: j.tenantId,
          ageMs: j.ageMs,
        },
        key: `${j.queue}:${j.jobId}`,
      });
    }
  }

  // فلترة عبر de-dup
  const firing: AlertEvent[] = [];
  for (const c of candidates) if (await shouldFire(c)) firing.push(c);
  return firing;
}

// ── فحص الفشل الجديد ─────────────────────────────────

/**
 * يفحص الفشل الحديث ويطلق تنبيه لكل مهمة فشلت جديداً (لم يسبق تنبيهها).
 * `job-failed` لا يخضع للـwindow العام — كل فشل حالة منفصلة، والـkey هو
 * jobId فيمنع التكرار على نفس المهمة بنفسها.
 */
export async function checkRecentFailures(): Promise<readonly AlertEvent[]> {
  const now = new Date().toISOString();
  const cutoff = Date.now() - 60 * 60 * 1000; // آخر ساعة فقط — نتوقع cron كل بضع دقائق
  const candidates: AlertEvent[] = [];

  const { getQueue } = await import('./queues.js');
  for (const name of QUEUE_NAMES) {
    const q = getQueue(name);
    const failed = await q.getFailed(0, 100);
    for (const j of failed) {
      const ts = j.finishedOn ?? j.processedOn ?? j.timestamp ?? 0;
      if (ts < cutoff) continue;
      const data = (j.data ?? {}) as { tenantId?: string; templateId?: string };
      candidates.push({
        ts: now,
        code: 'job-failed',
        severity: 'crit',
        message: `فشلت مهمة ${j.id} في ${name}: ${j.failedReason ?? 'بلا سبب'}`,
        data: {
          jobId: j.id,
          queue: name,
          tenantId: data.tenantId,
          templateId: data.templateId,
          failedReason: j.failedReason,
        },
        key: `${name}:${j.id}`,
      });
    }
  }

  const firing: AlertEvent[] = [];
  for (const c of candidates) if (await shouldFire(c)) firing.push(c);
  return firing;
}

// ── نبض دوري (اختياري) ───────────────────────────────

/**
 * يشغّل فحصاً واحداً كاملاً ويطلق التنبيهات على الويب هوك.
 * يُستدعى من cron/loop خارجي. لا يبني حلقة داخلية (النبض مسؤولية المستدعي).
 * يعيد ملخصاً لأغراض logging.
 */
export interface AlertSummary {
  readonly checked: number;
  readonly fired: number;
  readonly webhookUp: boolean;
}

export async function runAlertCycle(): Promise<AlertSummary> {
  const conn = getConnection();
  const maint = await conn.get(MAINTENANCE_KEY);
  if (maint === '1') {
    // في الصيانة، نصمت عن كل شيء عدا disk وworker-stuck (شؤون التشغيل)
    // للتبسيط الآن: نصمت كلياً — الصيانة قرار مقصود.
    return { checked: 0, fired: 0, webhookUp: !!WEBHOOK_URL };
  }
  const [thresh, fails] = await Promise.all([
    checkThresholds(),
    checkRecentFailures(),
  ]);
  const all = [...thresh, ...fails];
  const failure = await failureRate(1);
  // إن كان معدل الفشل > 20% في آخر ساعة، نضيف تنبيه ملخصي
  if (failure.totalFailures + failure.totalCompleted >= 5 && failure.failureRate > 0.2) {
    const summary: AlertEvent = {
      ts: new Date().toISOString(),
      code: 'job-failed',
      severity: 'crit',
      message: `معدل الفشل ${(failure.failureRate * 100).toFixed(1)}% آخر ساعة (${failure.totalFailures}/${failure.totalFailures + failure.totalCompleted})`,
      data: { failureRate: failure.failureRate, ...failure },
      key: 'aggregate:1h',
    };
    if (await shouldFire(summary)) all.push(summary);
  }

  let fired = 0;
  for (const ev of all) {
    if (await fireWebhook(ev)) fired++;
  }
  return { checked: all.length, fired, webhookUp: !!WEBHOOK_URL };
}
