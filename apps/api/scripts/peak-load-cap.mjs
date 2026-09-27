#!/usr/bin/env node
// 469b: real dev worker, existing 469 tenants; no worker/queue configuration changes.
import { randomUUID } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { QueueEvents } from 'bullmq';
import { cleanDevEnvironment, readLocalEnvironment, launchCertificate } from './dev-environment.mjs';
import { inTenant } from './peak-load-fixtures.mjs';

const mode = process.argv[2];
const size = process.argv[3] ?? 'x';
if (!['--cap', '--fairness'].includes(mode) || !['x', 'instagram'].includes(size) || process.argv.length > 4) {
  console.error('Usage: node --import tsx apps/api/scripts/peak-load-cap.mjs --cap|--fairness [x|instagram]');
  process.exit(1);
}
const runId = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
const path = `/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469b-${runId}.jsonl`;
function emit(event, data) {
  const line = JSON.stringify({ event, observedAt: new Date().toISOString(), ...data });
  appendFileSync(path, `${line}\n`, { mode: 0o600 });
  console.log(line);
}
let db, queues, listener, gate, fairnessEvidence;
const items = [];
const transitions = [];

async function pendingSnapshot(queue) {
  const startMs = Date.now();
  const states = {};
  for (const state of ['waiting', 'delayed', 'prioritized', 'active']) {
    const jobs = await queue.getJobs([state], 0, -1);
    states[state] = jobs.filter(job => items.some(item => item.payload.renderId === job.id))
      .map(job => ({ id: job.id, name: items.find(item => item.payload.renderId === job.id).name, tenantId: job.data.tenantId, priority: job.opts.priority ?? 0, capDelays: job.data.__capDelays ?? 0 }));
  }
  const byTenant = {};
  for (const label of ['A', 'B', 'C']) {
    const tenantId = items.find(item => item.label === label)?.payload.tenantId;
    byTenant[label] = Object.fromEntries(Object.entries(states).map(([state, jobs]) =>
      [state, jobs.filter(job => job.tenantId === tenantId).length]));
  }
  return { startMs, endMs: Date.now(), states, byTenant };
}

async function add(item) {
  const result = await queues.enqueueRender(item.payload, 'normal');
  item.priority = result.priority;
  item.enqueued = true;
  emit('enqueued', { id: result.jobId, label: item.label, name: item.name, tenantId: item.payload.tenantId, priority: result.priority });
}

async function collect(queue) {
  const rows = [];
  for (const item of items.filter(item => item.enqueued)) {
    const job = await queue.getJob(item.payload.renderId);
    if (!job) throw new Error('PEAK_JOB_MISSING');
    const result = await inTenant(db, item.payload.tenantId, client => client.query(
      'SELECT status,started_at,completed_at,duration_ms,error_code FROM renders WHERE id=$1', [job.id]));
    if (result.rowCount !== 1) throw new Error('PEAK_RENDER_MISSING');
    rows.push({ id: job.id, name: item.name, label: item.label, enqueuePriority: item.priority, tenantId: item.payload.tenantId, priority: job.opts.priority ?? 0,
      queuedAtMs: job.timestamp, processedOn: job.processedOn ?? null, finishedOn: job.finishedOn ?? null,
      capDelays: job.data.__capDelays ?? 0, state: await job.getState(), ...result.rows[0] });
  }
  const ordered = [...rows].sort((a,b) => (a.started_at?.getTime() ?? Infinity) - (b.started_at?.getTime() ?? Infinity));
  emit('results', { rows, startOrder: ordered.map(row => ({ id: row.id, name: row.name, tenantId: row.tenantId, priority: row.priority, startedAt: row.started_at })),
    transitions, gate: gate ?? null, capObserved: rows.some(row => row.capDelays > 0) });
  if (fairnessEvidence) {
    const c2 = rows.find(row => row.name === 'C2');
    const a4 = rows.find(row => row.name === 'A4');
    const comparisonValid = fairnessEvidence.a4PendingAfter
      && a4?.started_at?.getTime() >= fairnessEvidence.injectionEndMs;
    let verdict = 'INCONCLUSIVE';
    if (fairnessEvidence.c1PrioritizedBeforeAndAfter && c2.priority === 1 && c2.enqueuePriority === 1) {
      verdict = 'PRIORITIZED_OMISSION_CONFIRMED';
    } else if (comparisonValid && c2.priority > 1 && c2.enqueuePriority === c2.priority && c2.started_at && a4.started_at) {
      if (c2.started_at < a4.started_at) verdict = 'ROTATION_CONFIRMED';
      if (c2.started_at > a4.started_at) verdict = 'PRIORITY_DID_NOT_ADVANCE_C2';
    }
    emit('fairnessVerdict', { verdict, comparisonValid, evidence: fairnessEvidence,
      c2: { id: c2.id, enqueuePriority: c2.enqueuePriority, jobOptsPriority: c2.priority, startedAt: c2.started_at },
      a4: { id: a4.id, startedAt: a4.started_at } });
    if (verdict !== 'ROTATION_CONFIRMED') gate = verdict;
  }
}

try {
  const env = cleanDevEnvironment(process.env, readLocalEnvironment());
  Object.assign(process.env, env);
  queues = await import('../src/queues/index.ts');
  const queue = queues.getQueue('normal');
  db = new pg.Client({ connectionString: env.DATABASE_URL_APP, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  db.on('error', () => { gate = 'DATABASE_CONNECTION_ERROR'; });
  await db.connect();
  emit('target', { runId, mode, size, path, ...launchCertificate(env) });
  for (const name of ['normal', 'urgent', 'edit', 'batch']) {
    const q = queues.getQueue(name);
    const counts = await q.getJobCounts('active', 'waiting', 'delayed', 'prioritized');
    const workers = (await q.getWorkers()).length;
    const paused = await q.isPaused();
    emit('preflight', { queue: name, counts, workers, paused });
    if (workers !== 1 || paused || Object.values(counts).some(count => count)) throw new Error('PEAK_NOT_IDLE');
  }
  const original = readFileSync('/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-20260925T040823444Z-bc50859a.jsonl', 'utf8')
    .trim().split('\n').map(JSON.parse);
  const fixtures = {};
  for (const entry of original.filter(event => event.event === 'fixture')) {
    const result = await inTenant(db, entry.tenantId, client => client.query(`SELECT p.content,b.config,t.definition
      FROM projects p JOIN tenants n ON n.id=p.tenant_id JOIN brand_kits b ON b.id=p.brand_kit_id
      JOIN templates t ON t.id=p.template_id WHERE p.id=$1 AND n.name=$2`,
    [entry.projectId, `peak-469-20260925T040823444Z-bc50859a-${entry.label}`]));
    if (result.rowCount !== 1) throw new Error('PEAK_EXISTING_FIXTURE_MISSING');
    const row = result.rows[0];
    fixtures[entry.label] = { tenantId: entry.tenantId, projectId: entry.projectId,
      brandSnapshot: row.config, templateSnapshot: row.definition, content: row.content, size, format: 'png' };
    emit('fixture', { label: entry.label, tenantId: entry.tenantId, projectId: entry.projectId });
  }
  const names = mode === '--cap' ? ['A1','A2','A3','A4','A5'] : ['A1','A2','B1','B2','B3','A3','A4','C1','C2'];
  for (const name of names) {
    const label = name[0];
    const payload = { ...fixtures[label], renderId: randomUUID() };
    await inTenant(db, payload.tenantId, client => client.query(`INSERT INTO renders
      (id,tenant_id,project_id,size,format,status,brand_snapshot,template_snapshot,idempotency_key)
      VALUES($1,$2,$3,$4,'png','queued',$5::jsonb,$6::jsonb,$7)`,
    [payload.renderId,payload.tenantId,payload.projectId,size,JSON.stringify(payload.brandSnapshot),JSON.stringify(payload.templateSnapshot),`peak-469b-${runId}-${items.length}`]));
    items.push({ name, label, payload, enqueued: false });
  }
  listener = new QueueEvents('render-normal', { connection: queues.getRedis(), prefix: env.BULLMQ_PREFIX });
  for (const kind of ['active','delayed','completed','failed','stalled']) listener.on(kind, (data,streamId) => {
    if (!items.some(item => item.payload.renderId === data.jobId)) return;
    const event = { kind, id: data.jobId, streamId };
    transitions.push(event);
    emit('transition', event);
    if (kind === 'failed' || kind === 'stalled') gate = `JOB_${kind.toUpperCase()}`;
  });
  listener.on('error', () => { gate = 'QUEUE_EVENTS_ERROR'; });
  await listener.waitUntilReady();
  emit('plan', { initial: items.filter(item => item.name !== 'C2').map(item => ({ name: item.name, id: item.payload.renderId })),
    followup: items.find(item => item.name === 'C2')?.payload.renderId ?? null, observationWindowMs: 5000, sampleIntervalMs: 100, requiredConsecutive: 2 });
  for (const item of items.filter(item => item.name !== 'C2')) {
    if (gate) break;
    await add(item);
  }
  if (mode === '--fairness' && !gate) {
    const a4 = items.find(item => item.name === 'A4');
    const c1 = items.find(item => item.name === 'C1');
    const c2 = items.find(item => item.name === 'C2');
    const deadline = Date.now() + 5000;
    let ready = false;
    let consecutive = 0;
    do {
      const snap = await pendingSnapshot(queue);
      const pending = ['waiting','delayed','prioritized'].flatMap(state => snap.states[state]);
      const contains = item => pending.some(job => job.id === item.payload.renderId)
        && !snap.states.active.some(job => job.id === item.payload.renderId);
      const qualifies = pending.length >= 3 && contains(a4) && contains(c1);
      consecutive = qualifies ? consecutive + 1 : 0;
      emit('waitingObserved', { count: pending.length, qualifies, consecutive, snapshot: snap });
      if (consecutive >= 2 && !gate) {
        emit('beforeNinth', snap);
        const injectionStartMs = Date.now();
        await add(c2);
        const injectionEndMs = Date.now();
        const predecessorAfter = await queue.getJob(c1.payload.renderId);
        const c1StateAfter = await predecessorAfter.getState();
        const a4After = await queue.getJob(a4.payload.renderId);
        const a4StateAfter = await a4After.getState();
        const c2Job = await queue.getJob(c2.payload.renderId);
        fairnessEvidence = { injectionStartMs, injectionEndMs, c1Id: c1.payload.renderId, a4Id: a4.payload.renderId,
          c1StateAfter, a4StateAfter,
          c1PrioritizedBeforeAndAfter: snap.states.prioritized.some(job => job.id === c1.payload.renderId) && c1StateAfter === 'prioritized',
          a4PendingAfter: ['waiting','delayed','prioritized'].includes(a4StateAfter) };
        emit('ninth', { ...fairnessEvidence, id: c2.payload.renderId, enqueuePriority: c2.priority, jobOptsPriority: c2Job.opts.priority });
        ready = true;
        break;
      }
      if (gate) break;
      await sleep(100);
    } while (Date.now() < deadline);
    if (!ready) {
      emit('ninthNotInjected', { reason: 'STABLE_THREE_PENDING_WITH_A4_AND_C1_NOT_OBSERVED', renderId: c2.payload.renderId,
        snapshot: await pendingSnapshot(queue) });
      process.exitCode = 2;
    }
  }
  const deadline = Date.now() + 90000;
  let lastDelayed = '';
  while (!gate && Date.now() < deadline) {
    const snap = await pendingSnapshot(queue);
    const delayed = JSON.stringify(snap.states.delayed);
    if (snap.states.delayed.length && delayed !== lastDelayed) emit('delayedSnapshot', snap);
    lastDelayed = delayed;
    const active = await Promise.all(items.filter(item => item.enqueued).map(async item => (await queue.getJob(item.payload.renderId)).getState()));
    if (active.every(state => state === 'completed' || state === 'failed')) break;
    await sleep(100);
  }
  if (!gate && Date.now() >= deadline) gate = 'OBSERVATION_TIMEOUT';
  await collect(queue);
  emit('after', { counts: await queue.getJobCounts('active','waiting','delayed','prioritized') });
  if (gate) process.exitCode = 2;
} catch (error) {
  emit('error', { code: /^PEAK_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'PEAK_OPERATION_FAILED', type: error.name });
  process.exitCode = 1;
} finally {
  if (listener) await listener.close();
  if (queues) await queues.closeQueues();
  if (db) await db.end();
}
