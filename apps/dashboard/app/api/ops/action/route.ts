// POST /api/ops/action — إجراءات إدارية على الطوابير + وضع الصيانة.
//
// **الحدود:** لا نعدّل worker.ts، فالإجراءات محدودة بما يمكن فعله من
// خارج عملية العامل:
//   • kill-job   — يحذف مهمة waiting/delayed (active لا يمكن قتلها بلا token)
//   • pause      — Queue.pause()  يوقف سحب مهام جديدة (لا يوقف الجارية)
//   • resume     — Queue.resume() يستأنف السحب
//   • set-worker-count — يكتب علم Redis؛ يحتاج إعادة تشغيل العامل يدوياً
//   • maintenance-on/off — يكتب علم Redis يقرأه observe.systemStatus

import { NextResponse } from 'next/server';

import { getQueue, getConnection, BULLMQ_PREFIX, QUEUE_NAMES, type QueueName } from '@pf-mediakit/renderer/queues';
import { MAINTENANCE_KEY } from '@pf-mediakit/renderer/observe';

export const dynamic = 'force-dynamic';

const WORKER_COUNT_KEY = `${BULLMQ_PREFIX}:sys:worker-count`;

type Action =
  | { type: 'kill-job'; queue: QueueName; jobId: string }
  | { type: 'pause'; queue: QueueName }
  | { type: 'resume'; queue: QueueName }
  | { type: 'set-worker-count'; count: number }
  | { type: 'maintenance-on' }
  | { type: 'maintenance-off' };

function isQueueName(v: unknown): v is QueueName {
  return typeof v === 'string' && (QUEUE_NAMES as readonly string[]).includes(v);
}

// **رسائل الخطأ بالإنجليزية:** لا نريد تسرّب عربي في وضع en (L-dash-5).
// الأخطاء نادرة وتقنية — الإنجليزية آمنة عبر الأوضاع الثلاثة.
function parseAction(body: unknown): Action | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'invalid body' };
  const b = body as Record<string, unknown>;
  const type = b['type'];

  if (type === 'kill-job') {
    if (!isQueueName(b['queue'])) return { error: 'unknown queue' };
    if (typeof b['jobId'] !== 'string' || !b['jobId']) return { error: 'jobId required' };
    return { type: 'kill-job', queue: b['queue'], jobId: b['jobId'] };
  }
  if (type === 'pause' || type === 'resume') {
    if (!isQueueName(b['queue'])) return { error: 'unknown queue' };
    return { type, queue: b['queue'] };
  }
  if (type === 'set-worker-count') {
    const c = Number(b['count']);
    if (!Number.isFinite(c) || c < 0 || c > 32) return { error: 'count must be in [0, 32]' };
    return { type: 'set-worker-count', count: Math.round(c) };
  }
  if (type === 'maintenance-on') return { type: 'maintenance-on' };
  if (type === 'maintenance-off') return { type: 'maintenance-off' };
  return { error: `unknown type: ${String(type)}` };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = parseAction(body);
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });

  try {
    const conn = getConnection();

    if (parsed.type === 'kill-job') {
      const q = getQueue(parsed.queue);
      const job = await q.getJob(parsed.jobId);
      if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });
      const state = await job.getState();
      if (state === 'active') {
        return NextResponse.json(
          {
            error:
              'active job — worker must be stopped manually to kill it. Removing does not abort the running render.',
            state,
          },
          { status: 409 }
        );
      }
      await job.remove();
      return NextResponse.json({ ok: true, removed: parsed.jobId, wasState: state });
    }

    if (parsed.type === 'pause') {
      await getQueue(parsed.queue).pause();
      return NextResponse.json({ ok: true, paused: parsed.queue });
    }

    if (parsed.type === 'resume') {
      await getQueue(parsed.queue).resume();
      return NextResponse.json({ ok: true, resumed: parsed.queue });
    }

    if (parsed.type === 'set-worker-count') {
      await conn.set(WORKER_COUNT_KEY, String(parsed.count));
      return NextResponse.json({
        ok: true,
        stored: parsed.count,
        note: 'worker restart required to apply — value is read from env at startup.',
      });
    }

    if (parsed.type === 'maintenance-on') {
      await conn.set(MAINTENANCE_KEY, '1');
      // نوقف كل الطوابير أيضاً — منعاً لسحب مهام جديدة
      await Promise.all(QUEUE_NAMES.map((n) => getQueue(n).pause()));
      return NextResponse.json({ ok: true, maintenance: 'on', queuesPaused: true });
    }

    if (parsed.type === 'maintenance-off') {
      await conn.del(MAINTENANCE_KEY);
      await Promise.all(QUEUE_NAMES.map((n) => getQueue(n).resume()));
      return NextResponse.json({ ok: true, maintenance: 'off', queuesResumed: true });
    }

    return NextResponse.json({ error: 'unreachable' }, { status: 500 });
  } catch (err) {
    return NextResponse.json(
      { error: String((err as Error).message ?? err) },
      { status: 500 }
    );
  }
}
