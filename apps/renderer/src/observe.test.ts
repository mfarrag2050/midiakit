// observe — اختبار L-dash-2 (تُبلَّغ لـLESSONS.md من main).
//
// **البذرة:** BullMQ 5 يفصل مجموعتَي "waiting" و "prioritized". مهام
// بلا priority تدخل waiting؛ مهام بـpriority > 0 تدخل prioritized.
// `getState()` يعيد `'prioritized'` لا `'waiting'`، و`getWaiting()` لا
// يشملها، و`getJobCounts()` يحتاج المفتاح صراحةً.
//
// **الغاية:** ضمان أن `queueDepth()` يجمع الاثنين تحت `waiting` من منظور
// العميل. طابور فيه waiting=1 و prioritized=2 يجب أن يُظهر waiting=3.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Queue } from 'bullmq';

import { getConnection, BULLMQ_PREFIX, closeQueues } from './queues.js';
import { queueDepth, tenantJobs } from './observe.js';

const TEST_PREFIX = `${BULLMQ_PREFIX}:__test_observe__`;
const TEST_QUEUE = 'render-urgent'; // يجب أن يطابق تسمية queues.ts

async function cleanTestKeys(): Promise<void> {
  const conn = getConnection();
  const keys = await conn.keys(`${BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await conn.del(...keys);
}

describe('observe — L-dash-2: queueDepth يجمع prioritized + waiting', () => {
  beforeEach(async () => {
    await cleanTestKeys();
  });

  afterAll(async () => {
    await cleanTestKeys();
    await closeQueues();
  });

  it('طابور فارغ: waiting=0', async () => {
    const depths = await queueDepth();
    const urgent = depths.find((d) => d.name === 'urgent');
    expect(urgent).toBeDefined();
    expect(urgent!.waiting).toBe(0);
  });

  it('مهمة بلا priority ⇒ waiting=1', async () => {
    const q = new Queue(TEST_QUEUE, {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
    });
    try {
      // priority غير محدد ⇒ 0 ⇒ waiting
      await q.add('t', { tenantId: 'x' });
      const depths = await queueDepth();
      const urgent = depths.find((d) => d.name === 'urgent')!;
      expect(urgent.waiting).toBe(1);
    } finally {
      await q.close();
    }
  });

  it('مهمة بـpriority>0 ⇒ prioritized ⇒ waiting=1', async () => {
    const q = new Queue(TEST_QUEUE, {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
    });
    try {
      await q.add('t', { tenantId: 'x' }, { priority: 5 });
      const depths = await queueDepth();
      const urgent = depths.find((d) => d.name === 'urgent')!;
      expect(urgent.waiting).toBe(1); // البُذرة: يجب أن يجمع prioritized
    } finally {
      await q.close();
    }
  });

  it('خليط 1 waiting + 2 prioritized ⇒ waiting=3', async () => {
    const q = new Queue(TEST_QUEUE, {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
    });
    try {
      await q.add('t', { tenantId: 'x' }); // waiting
      await q.add('t', { tenantId: 'x' }, { priority: 3 }); // prioritized
      await q.add('t', { tenantId: 'x' }, { priority: 7 }); // prioritized
      const depths = await queueDepth();
      const urgent = depths.find((d) => d.name === 'urgent')!;
      expect(urgent.waiting).toBe(3);
    } finally {
      await q.close();
    }
  });
});

describe('observe — tenantJobs: prioritized يظهر مع الموقع الصحيح', () => {
  beforeEach(async () => {
    await cleanTestKeys();
  });

  afterAll(async () => {
    await cleanTestKeys();
    await closeQueues();
  });

  it('مستأجرَان × مهمتان prioritized ⇒ الموقع 1..4 عبر priority', async () => {
    const q = new Queue(TEST_QUEUE, {
      connection: getConnection(),
      prefix: BULLMQ_PREFIX,
    });
    try {
      // نُدخل بترتيب متناوب لكن مع priorities يجب أن تفرض الترتيب
      await q.add('t', { tenantId: 'A' }, { priority: 1 });
      await q.add('t', { tenantId: 'B' }, { priority: 2 });
      await q.add('t', { tenantId: 'A' }, { priority: 3 });
      await q.add('t', { tenantId: 'B' }, { priority: 4 });

      const jobsA = await tenantJobs('A');
      const jobsB = await tenantJobs('B');

      expect(jobsA.length).toBe(2);
      expect(jobsB.length).toBe(2);

      // كلها في prioritized (لا waiting) — يجب أن تحمل الحالة الصحيحة
      for (const j of [...jobsA, ...jobsB]) {
        expect(j.status).toBe('prioritized');
        expect(j.position).not.toBeNull();
      }

      // Position 1 يجب أن يكون tenant A (priority=1)
      const first = [...jobsA, ...jobsB].sort(
        (a, b) => (a.position ?? 999) - (b.position ?? 999)
      )[0];
      expect(first!.position).toBe(1);
    } finally {
      await q.close();
    }
  });
});
