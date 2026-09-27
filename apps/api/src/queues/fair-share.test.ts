// 469c · fair-share priority reads waiting + delayed + prioritized.
// 469b §ب أثبت أنّ إغفال `prioritized` يُعطي priority=1 دائماً — انظر
// `fairnessVerdict:"PRIORITIZED_OMISSION_CONFIRMED"` في تقرير 469b.
// هذا الاختبارُ يحرسُ عدمَ العودة إلى تلك الحال.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { closeQueues, enqueueRender, getQueue, getRedis, type RenderJobPayload } from './index.js';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';

function payload(tenantId: string): RenderJobPayload {
  return {
    renderId: randomUUID(),
    tenantId,
    projectId: randomUUID(),
    size: 'x',
    format: 'png',
    brandSnapshot: {},
    templateSnapshot: {},
    content: {},
  };
}

afterEach(async () => {
  await getQueue('normal').obliterate({ force: true });
});

afterAll(async () => {
  if (!config.BULLMQ_PREFIX.startsWith('pf-mediakit-test-')) throw new Error('Expected test prefix');
  const keys = await getRedis().keys(`${config.BULLMQ_PREFIX}:*`);
  if (keys.length) await getRedis().del(...keys);
  await closeQueues();
});

describe('fair-share priority (469c)', () => {
  it('empty queue ⇒ priority = 1', async () => {
    const result = await enqueueRender(payload(TENANT_A), 'normal');
    expect(result.priority).toBe(1);
  });

  it('tenant A has one job in prioritized ⇒ next priority = 11', async () => {
    const first = await enqueueRender(payload(TENANT_A), 'normal');
    expect(first.priority).toBe(1);
    // enqueueRender adds with priority>0 ⇒ BullMQ stores in `prioritized` state.
    const firstJob = await getQueue('normal').getJob(first.jobId);
    expect(await firstJob!.getState()).toBe('prioritized');

    const second = await enqueueRender(payload(TENANT_A), 'normal');
    expect(second.priority).toBe(11);
  });

  it('two prioritized + one waiting for tenant A ⇒ next priority = 31', async () => {
    await enqueueRender(payload(TENANT_A), 'normal');
    await enqueueRender(payload(TENANT_A), 'normal');

    // Third job in plain `waiting` state (no priority option).
    const waitingPayload = payload(TENANT_A);
    await getQueue('normal').add(`render-${waitingPayload.renderId}`, waitingPayload, {
      jobId: waitingPayload.renderId,
    });
    const waitingJob = await getQueue('normal').getJob(waitingPayload.renderId);
    expect(await waitingJob!.getState()).toBe('waiting');

    // A different tenant must not inflate priority.
    await enqueueRender(payload(TENANT_B), 'normal');

    const next = await enqueueRender(payload(TENANT_A), 'normal');
    expect(next.priority).toBe(31);
  });
});
