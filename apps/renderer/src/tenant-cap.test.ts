// tenant-cap · اختبار L-46 (٣٦٠) — يحرس أنّ الرندر لا يبقى «queued أبداً».
//
// **العطبُ قبل ٣٦٠** (مقيسٌ في `_repro_360_tmp.mjs` · اسطر مثبّتة في التقرير):
//   cap=2 · 5 مهام لمستأجرٍ واحد ⇒ 3 يُرمى عليها throw ⇒ attemptsMade=1
//   ⇒ ينتقلن إلى `failed` في BullMQ · و`renders.status='queued'` أبد الآبدين.
//
// **بعد ٣٦٠:**
//   1. الزوائد لا تُرمى — تُؤجَّل CAP_DELAY_MS · تُعاد المحاولة تلقائيّاً.
//   2. بعد CAP_MAX_DELAYS تأجيلاً بلا نجاح ⇒ فشلٌ صريح بـ`TENANT_CAP_TIMEOUT`
//      (UnrecoverableError · لا retry).
//   3. `failed-listener` يُحدِّث DB row إلى `failed` برمزٍ مفهوم (اختبار
//      شقّه الآخر مؤجَّل — يحتاج pg + api-shape).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Queue, Worker, DelayedError, UnrecoverableError, type Job } from 'bullmq';
import IORedis from 'ioredis';
import {
  decideTenantCap,
  getCapDelayMs,
  getCapMaxDelays,
} from './api-worker.js';

// ───── الشقّ الأوّل · القرار الخالص ─────

describe('decideTenantCap · قرار خالص (٣٦٠)', () => {
  it('active ≤ cap ⇒ proceed', () => {
    const d = decideTenantCap({
      activeAfterIncr: 2, perTenantCap: 2, tenantId: 'T', delaysConsumed: 0,
    });
    expect(d).toEqual({ action: 'proceed', active: 2 });
  });

  it('active > cap · delaysConsumed=0 ⇒ delay بحسب CAP_DELAY_MS', () => {
    const d = decideTenantCap({
      activeAfterIncr: 3, perTenantCap: 2, tenantId: 'T', delaysConsumed: 0,
      capDelayMs: 100, capMaxDelays: 3,
    });
    expect(d).toEqual({ action: 'delay', delayMs: 100, nextDelaysConsumed: 1 });
  });

  it('active > cap · delaysConsumed=maxDelays-1 ⇒ delay أخير', () => {
    const d = decideTenantCap({
      activeAfterIncr: 3, perTenantCap: 2, tenantId: 'T', delaysConsumed: 2,
      capDelayMs: 100, capMaxDelays: 3,
    });
    expect(d.action).toBe('delay');
    if (d.action === 'delay') expect(d.nextDelaysConsumed).toBe(3);
  });

  it('active > cap · delaysConsumed=maxDelays ⇒ timeout + رسالة TENANT_CAP_TIMEOUT', () => {
    const d = decideTenantCap({
      activeAfterIncr: 3, perTenantCap: 2, tenantId: 'tenant-X', delaysConsumed: 3,
      capDelayMs: 100, capMaxDelays: 3,
    });
    expect(d.action).toBe('timeout');
    if (d.action === 'timeout') {
      expect(d.message).toContain('TENANT_CAP_TIMEOUT');
      expect(d.message).toContain('tenant-X');
      expect(d.message).toContain('cap=2');
      expect(d.message).toContain('3 تأجيلاً');
    }
  });

  it('يقرأ افتراضيّات env حين لا تُمرَّر', () => {
    // احتراز: القيَم الافتراضيّة في api-worker.ts (5000ms · 6 تأجيلات).
    expect(getCapDelayMs()).toBeGreaterThan(0);
    expect(getCapMaxDelays()).toBeGreaterThan(0);
  });
});

// ───── الشقّ الثاني · دورة كاملة مع BullMQ حقيقيّ ─────

// عزلٌ تامّ · prefix فريد لكلّ اختبار (vitest.setup.ts يُنشئ pf-mediakit-test-<pid>-<ts>).
// نُنشئ prefix ثاني مستقلّ خاصّ بـ٣٦٠ كي لا نتصادم مع اختباراتٍ أخرى تشاركنا Redis.
const TEST_PREFIX = `mkapi-360-test-${process.pid}-${Date.now()}`;
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379/3';

async function makeConn() {
  const c = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return c;
}

async function cleanup(conn: IORedis) {
  const keys = await conn.keys(`${TEST_PREFIX}:*`);
  if (keys.length) await conn.del(...keys);
}

describe('tenant-cap · دورة BullMQ كاملة (٣٦٠)', () => {
  let conn: IORedis;

  beforeEach(async () => {
    conn = await makeConn();
    await cleanup(conn);
    // اختبار خفيف: تأجيلٌ قصير + سقف قصير.
    process.env['TENANT_CAP_DELAY_MS'] = '150';
    process.env['TENANT_CAP_MAX_DELAYS'] = '5';
  });

  afterEach(async () => {
    await cleanup(conn);
    await conn.quit();
    delete process.env['TENANT_CAP_DELAY_MS'];
    delete process.env['TENANT_CAP_MAX_DELAYS'];
  });

  /**
   * يُنشئ Queue + Worker يحاكي processJob (نفس منطق decideTenantCap).
   * الفارقُ الوحيد عن processJob الحقيقيّ: يستعمل tenantKey مبنيّاً على TEST_PREFIX
   * (لا BULLMQ_PREFIX). العمل: sleep بسيط بلا DB.
   */
  function makeQueueWorker(perTenantCap: number, jobDurMs: number) {
    const tenantKey = (t: string) => `${TEST_PREFIX}:tenant:${t}:active`;
    const queue = new Queue('render-test', {
      connection: conn.duplicate(),
      prefix: TEST_PREFIX,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 100 },
      },
    });
    const worker = new Worker(
      'render-test',
      async (job: Job, token?: string) => {
        const tenantId = job.data.tenantId as string;
        const key = tenantKey(tenantId);
        const activeAfterIncr = await conn.incr(key);
        const data = job.data as { __capDelays?: number };
        const decision = decideTenantCap({
          activeAfterIncr, perTenantCap, tenantId,
          delaysConsumed: data.__capDelays ?? 0,
        });
        if (decision.action !== 'proceed') {
          await conn.decr(key);
          if (decision.action === 'timeout') throw new UnrecoverableError(decision.message);
          if (!token) throw new UnrecoverableError('token missing');
          await job.updateData({ ...data, __capDelays: decision.nextDelaysConsumed });
          await job.moveToDelayed(Date.now() + decision.delayMs, token);
          throw new DelayedError();
        }
        try { await new Promise((r) => setTimeout(r, jobDurMs)); }
        finally { await conn.decr(key); }
      },
      { connection: conn.duplicate(), prefix: TEST_PREFIX, concurrency: 8 },
    );
    return { queue, worker };
  }

  async function waitForTerminal(queue: Queue, expectedTotal: number, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
      const terminal = counts.completed + counts.failed;
      if (terminal >= expectedTotal && counts.waiting === 0 && counts.active === 0 && counts.delayed === 0) {
        return counts;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  }

  it('5 مهام · cap=2 · جميعها تنجح تدريجيّاً (لا زومبي)', async () => {
    const { queue, worker } = makeQueueWorker(2, 100);
    try {
      for (let i = 1; i <= 5; i++) {
        await queue.add(`j-${i}`, { tenantId: 'tA', seq: i });
      }
      const counts = await waitForTerminal(queue, 5, 5000);
      expect(counts.completed).toBe(5);
      expect(counts.failed).toBe(0);
      expect(counts.waiting).toBe(0);
      expect(counts.active).toBe(0);
      expect(counts.delayed).toBe(0);
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 10_000);

  it('cap=1 · تأجيلاتٌ تنفد ⇒ TENANT_CAP_TIMEOUT · الميّت يُدفن في BullMQ', async () => {
    process.env['TENANT_CAP_DELAY_MS'] = '50';
    process.env['TENANT_CAP_MAX_DELAYS'] = '2'; // سقفٌ منخفض لسرعة الاختبار
    // مهمّة طويلة جدّاً تحتلّ الـcap طول مدّة الاختبار
    const { queue, worker } = makeQueueWorker(1, 3000);
    try {
      await queue.add('long', { tenantId: 'tB', seq: 0 });
      await new Promise((r) => setTimeout(r, 100)); // اترك الطويلة تبدأ
      await queue.add('short', { tenantId: 'tB', seq: 1 }); // ستعبر الـcap
      // انتظر الفشل (2 delays × 50ms + هامش)
      await new Promise((r) => setTimeout(r, 800));
      const failed = await queue.getFailed(0, 10);
      const timeoutJobs = failed.filter((j) => (j.failedReason || '').includes('TENANT_CAP_TIMEOUT'));
      expect(timeoutJobs.length).toBeGreaterThanOrEqual(1);
      expect(timeoutJobs[0]!.failedReason).toContain('TENANT_CAP_TIMEOUT');
      expect(timeoutJobs[0]!.failedReason).toContain('tB');
      expect(timeoutJobs[0]!.failedReason).toContain('cap=1');
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 10_000);

  it('cap=2 · مستأجرَان ⇒ كلٌّ يحصل على حصّته بلا خنق للآخر', async () => {
    const { queue, worker } = makeQueueWorker(2, 100);
    try {
      // A يرمي 4 · B يرمي 2 — بعد الأول، B يجب أن ينجح بلا تأجيل
      for (let i = 1; i <= 4; i++) await queue.add(`A-${i}`, { tenantId: 'A' });
      for (let i = 1; i <= 2; i++) await queue.add(`B-${i}`, { tenantId: 'B' });
      const counts = await waitForTerminal(queue, 6, 5000);
      expect(counts.completed).toBe(6);
      expect(counts.failed).toBe(0);
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 10_000);
});
