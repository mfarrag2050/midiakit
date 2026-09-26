#!/usr/bin/env node
// Manual, dev-only measurement for ticket 469. Never starts/stops workers or cleans queues.
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import pg from 'pg';
import { QueueEvents } from 'bullmq';
import { S3Client, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { cleanDevEnvironment, readLocalEnvironment, launchCertificate } from './dev-environment.mjs';
import { createPeakFixtures, inTenant } from './peak-load-fixtures.mjs';

const mode = process.argv[2];
if (!['--preflight', '--run'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node --import tsx apps/api/scripts/peak-load.mjs --preflight|--run');
  process.exit(1);
}
const runId = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
const evidencePath = `/Users/mdervis/MediaKit/pf-mediakit/claude/reports/469-${runId}.jsonl`;
function emit(event, data) {
  const line = JSON.stringify({ event, observedAt: new Date().toISOString(), ...data });
  appendFileSync(evidencePath, `${line}\n`, { mode: 0o600 });
  console.log(line);
}
const names = ['normal', 'urgent', 'edit', 'batch'];
let db, queuesModule, s3;
const events = [];
const transitions = [];
const jobs = [];
let gate = null;

async function snapshot() {
  const result = {};
  for (const name of names) {
    const queue = queuesModule.getQueue(name);
    const start = Date.now();
    const counts = await queue.getJobCounts('active', 'waiting', 'prioritized', 'delayed');
    const byTenant = {};
    for (const state of ['active', 'waiting', 'prioritized', 'delayed']) {
      const pending = await queue.getJobs([state], 0, -1);
      // Only identify our synthetic tenants. Global counts still expose external load.
      for (const job of pending) {
        const fixture = jobs.find(item => item.payload.renderId === job.id);
        if (!fixture) continue;
        const tenant = byTenant[fixture.payload.tenantId] ??= { label: fixture.label, active: 0, waiting: 0, prioritized: 0, delayed: 0 };
        tenant[state]++;
      }
    }
    result[name] = { counts, pending: counts.waiting + counts.prioritized, byTenant, sampleStartedMs: start, sampleEndedMs: Date.now() };
  }
  return result;
}

async function enqueue(item) {
  const queue = queuesModule.getQueue(item.queue);
  const before = await queue.getJobs(['waiting', 'prioritized', 'delayed'], 0, -1);
  const sameTenant = before.filter(job => job.data.tenantId === item.payload.tenantId).map(job => job.id);
  const calledAt = Date.now();
  if (item.queue === 'edit') {
    // enqueueRender only accepts normal|urgent. The separate edit queue is explicitly in 469.
    const job = await queue.add(`render-${item.payload.renderId}`, item.payload, { jobId: item.payload.renderId });
    item.priority = job.opts.priority ?? 0;
  } else {
    const result = await queuesModule.enqueueRender(item.payload, item.queue);
    item.priority = result.priority;
  }
  item.enqueued = true;
  const job = await queue.getJob(item.payload.renderId);
  item.timestamp = job.timestamp;
  emit('enqueued', { id: job.id, tenantId: item.payload.tenantId, label: item.label, queue: item.queue,
    priority: item.priority, calledAt, returnedAt: Date.now(), queuedAt: job.timestamp,
    pendingSameTenantBefore: sameTenant });
}

function peakOverlap(intervals) {
  const points = intervals.flatMap(([start, end]) => start != null && end != null ? [[start, 1], [end, -1]] : []);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, peak = 0;
  for (const [, delta] of points) { active += delta; peak = Math.max(peak, active); }
  return peak;
}

async function results() {
  const rows = [];
  for (const item of jobs.filter(item => item.enqueued)) {
    const job = await queuesModule.getQueue(item.queue).getJob(item.payload.renderId);
    if (!job) throw new Error('PEAK_JOB_EVIDENCE_MISSING');
    const result = await inTenant(db, item.payload.tenantId, client => client.query(`SELECT status,started_at,completed_at,duration_ms,error_code,output_storage_key
      FROM renders WHERE id=$1`, [item.payload.renderId]));
    if (result.rowCount !== 1) throw new Error('PEAK_RENDER_ROW_MISSING');
    const row = result.rows[0];
    let outputBytes = null;
    if (row.status === 'succeeded' && row.output_storage_key) {
      outputBytes = (await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: row.output_storage_key }))).ContentLength;
    }
    rows.push({ id: job.id, tenantId: item.payload.tenantId, label: item.label, queue: item.queue,
      priority: item.priority, queuedAtMs: job.timestamp, processedOnMs: job.processedOn ?? null,
      dbStartedAt: row.started_at, dbCompletedAt: row.completed_at,
      queueStartMs: job.processedOn == null ? null : job.processedOn - job.timestamp,
      renderStartMs: row.started_at == null ? null : row.started_at.getTime() - job.timestamp,
      finishedOnMs: job.finishedOn ?? null, state: await job.getState(), dbStatus: row.status,
      durationMs: row.duration_ms, attemptsMade: job.attemptsMade, capDelays: job.data.__capDelays ?? 0,
      errorCode: row.error_code, outputBytes, outputKey: row.output_storage_key });
  }
  emit('results', { rows });
  const urgent = rows.filter(row => row.queue === 'urgent');
  emit('summary', {
    gate, injected: rows.length, enqueueWindowMs: rows.length ? Math.max(...rows.map(r => r.queuedAtMs)) - Math.min(...rows.map(r => r.queuedAtMs)) : null,
    peakOutstanding: peakOverlap(rows.map(row => [row.queuedAtMs, row.finishedOnMs])),
    peakBullmqActive: peakOverlap(rows.map(row => [row.processedOnMs, row.finishedOnMs])),
    peakRendering: peakOverlap(rows.map(row => [row.dbStartedAt?.getTime(), row.dbCompletedAt?.getTime()])),
    urgentWithin45s: urgent.length === 2 && urgent.every(row => row.renderStartMs != null && row.renderStartMs >= 0 && row.renderStartMs <= 45000),
    allCompleted: rows.length === 9 && rows.every(row => row.state === 'completed' && row.dbStatus === 'succeeded' && row.outputBytes > 0),
    normalStartOrder: rows.filter(row => row.queue === 'normal').sort((a,b) => (a.dbStartedAt?.getTime() ?? Infinity) - (b.dbStartedAt?.getTime() ?? Infinity))
      .map(row => ({ id: row.id, tenantId: row.tenantId, priority: row.priority, startedAt: row.dbStartedAt })),
    stalled: transitions.filter(event => event.kind === 'stalled'),
  });
  const after = await snapshot();
  const activeOver60s = [];
  for (const name of names) {
    for (const job of await queuesModule.getQueue(name).getJobs(['active'], 0, -1)) {
      if (job.processedOn != null && Date.now() - job.processedOn > 60000) activeOver60s.push({ queue: name, id: job.id, activeMs: Date.now() - job.processedOn });
    }
  }
  emit('after', { queues: after, activeOver60s });
}

try {
  const environment = cleanDevEnvironment(process.env, readLocalEnvironment());
  Object.assign(process.env, environment);
  queuesModule = await import('../src/queues/index.ts');
  db = new pg.Client({ connectionString: environment.DATABASE_URL_APP, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  db.on('error', () => { gate = 'DATABASE_CONNECTION_ERROR'; });
  await db.connect();
  s3 = new S3Client({ endpoint: environment.S3_ENDPOINT, region: environment.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: environment.S3_ACCESS_KEY_ID, secretAccessKey: environment.S3_SECRET_ACCESS_KEY } });
  await s3.send(new HeadBucketCommand({ Bucket: environment.S3_BUCKET }));
  emit('target', { runId, evidencePath, ...launchCertificate(environment), cpus: os.cpus().length,
    database: (await db.query('SELECT current_database() AS database,current_user AS role')).rows[0] });
  for (const name of names) {
    const queue = queuesModule.getQueue(name);
    const workers = await queue.getWorkers();
    const paused = await queue.isPaused();
    emit('worker', { queue: name, count: workers.length, paused });
    if (workers.length !== 1 || paused) throw new Error('PEAK_WORKER_PREFLIGHT_FAILED');
  }
  const before = await snapshot();
  emit('before', { queues: before });
  if (names.some(name => Object.values(before[name].counts).some(count => count !== 0))) throw new Error('PEAK_EXTERNAL_LOAD_PRESENT');
  if (mode === '--run') {
    jobs.push(...await createPeakFixtures(db, s3, environment.S3_BUCKET, runId, emit));
    for (const name of names.filter(name => name !== 'batch')) {
      const listener = new QueueEvents(`render-${name}`, { connection: queuesModule.getRedis(), prefix: environment.BULLMQ_PREFIX });
      events.push(listener);
      for (const kind of ['active', 'completed', 'failed', 'stalled', 'delayed']) {
        listener.on(kind, (data, streamId) => {
          if (!jobs.some(item => item.payload.renderId === data.jobId)) return;
          const event = { kind, queue: name, id: data.jobId, streamId };
          transitions.push(event);
          emit('transition', event);
          if (kind === 'failed' || kind === 'stalled') gate = `JOB_${kind.toUpperCase()}`;
        });
      }
      listener.on('error', () => { gate = 'QUEUE_EVENTS_ERROR'; });
      await listener.waitUntilReady();
    }
    const waveStart = Date.now();
    for (const item of jobs.filter(item => item.queue === 'normal' || item.queue === 'edit')) {
      if (gate) break;
      await enqueue(item);
    }
    await sleep(Math.max(0, waveStart + 1000 - Date.now()));
    emit('atUrgent', { waveStart, queues: await snapshot() });
    if (!gate) for (const item of jobs.filter(item => item.queue === 'urgent')) await enqueue(item);
    const deadline = Date.now() + 180000;
    while (!gate && Date.now() < deadline) {
      let terminal = 0;
      for (const item of jobs.filter(item => item.enqueued)) {
        const job = await queuesModule.getQueue(item.queue).getJob(item.payload.renderId);
        if (!job) throw new Error('PEAK_JOB_EVIDENCE_MISSING');
        const state = await job.getState();
        if (state === 'completed' || state === 'failed') terminal++;
        if (state === 'failed') gate = 'JOB_FAILED';
        if (item.queue === 'urgent' && (job.processedOn ?? Date.now()) - job.timestamp > 45000) gate = 'URGENT_START_OVER_45000MS';
      }
      if (terminal === jobs.filter(item => item.enqueued).length) break;
      await sleep(50);
    }
    if (!gate && Date.now() >= deadline) gate = 'OBSERVATION_TIMEOUT';
    await results();
    if (gate) process.exitCode = 2;
  }
} catch (error) {
  // SDK/DB exceptions may contain credentials. Do not print their message/stack.
  const code = typeof error.message === 'string' && /^PEAK_[A-Z_]+$/.test(error.message) ? error.message : 'PEAK_OPERATION_FAILED';
  emit('error', { code, errorType: error.name });
  process.exitCode = 1;
} finally {
  await Promise.all(events.map(async listener => { await listener.close(); }));
  if (queuesModule) await queuesModule.closeQueues();
  if (db) await db.end();
  s3?.destroy();
}
