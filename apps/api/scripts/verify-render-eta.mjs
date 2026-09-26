// Manual 462 acceptance measurement against dev API + its real PostgreSQL/Redis.
// Requires dev-launch.mjs api, no render workers, and empty normal/batch queues.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cleanDevEnvironment, readLocalEnvironment } from './dev-environment.mjs';

Object.assign(process.env, cleanDevEnvironment(process.env, readLocalEnvironment()));
const { getQueue, getRedis, closeQueues, getWorkerCounts } = await import('../src/queues/index.ts');
const { averageRenderSeconds, getRenderEta } = await import('../src/queues/render-eta.ts');
const { getPool, closePool } = await import('../src/db.ts');
const { Worker } = await import('bullmq');

const base = 'http://127.0.0.1:19040';
const suffix = randomUUID();
let token;
let tenantId;
let projectId;
let renderId;
let activeJob;
let worker;
const jobs = [];
const lockToken = randomUUID();

async function api(path, payload, status, headers = {}) {
  const response = await fetch(`${base}/v1${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, status, `POST ${path} status`);
  return response.json();
}

function assertEta(response, seconds, saturated) {
  assert.equal(response.eta_seconds, seconds);
  assert.equal(response.saturated, saturated);
}

async function addJob(queue, payload, options = {}) {
  const job = await queue.add('462-measurement', payload, { jobId: randomUUID(), ...options });
  jobs.push(job);
  return job;
}

async function measureHistory(templateId) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    assert.equal(await averageRenderSeconds(client, templateId, 'png'), 8);
    assert.equal(await averageRenderSeconds(client, templateId, 'mp4'), 45);
    // 21 successes: the oldest outlier must fall out of the last-20 window.
    for (let index = 0; index <= 20; index++) {
      await client.query(
        `INSERT INTO renders(tenant_id, project_id, size, format, status, brand_snapshot,
          template_snapshot, duration_ms, completed_at)
         SELECT tenant_id, project_id, size, format, 'succeeded', brand_snapshot,
           template_snapshot, $2, to_timestamp($3) FROM renders WHERE id = $1`,
        [renderId, index === 0 ? 100000 : index * 1000, 1700000000 + index],
      );
    }
    await client.query(
      `INSERT INTO renders(tenant_id, project_id, size, format, status, brand_snapshot,
        template_snapshot, duration_ms, completed_at)
       SELECT tenant_id, project_id, size, format, 'failed', brand_snapshot,
         template_snapshot, 999000, now() FROM renders WHERE id = $1`, [renderId],
    );
    await client.query(
      `INSERT INTO renders(tenant_id, project_id, size, format, status, brand_snapshot,
        template_snapshot, duration_ms, completed_at)
       SELECT tenant_id, project_id, size, format, 'succeeded', brand_snapshot,
         jsonb_set(template_snapshot, '{id}', '"other-462"'), 999000, now()
       FROM renders WHERE id = $1`, [renderId],
    );
    const average = await averageRenderSeconds(client, templateId, 'mp4');
    assert.equal(average, 10.5);
    console.log(JSON.stringify({ measurement: 'history', successes: 21, window: 20,
      excluded_failed: 1, excluded_other_template: 1, average_seconds: average }));
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

try {
  assert.deepEqual(await getWorkerCounts(), { urgent: 0, normal: 0, edit: 0, batch: 0 },
    'dev workers must be absent; this script never stops them');
  for (const name of ['normal', 'batch']) {
    assert.equal(await getQueue(name).getJobCountByTypes('waiting', 'prioritized', 'delayed', 'active'), 0,
      `${name} must be empty; existing jobs are never removed`);
  }
  const signup = await api('/auth/signup', { email: `eta-${suffix}@example.test`,
    password: randomBytes(32).toString('base64url'), tenantName: `eta-${suffix}` }, 201);
  token = signup.session.accessToken;
  tenantId = signup.tenant.id;
  const brand = await api('/brand-kits', { name: `eta-${suffix}` }, 201);
  const templateId = `eta-${suffix}`;
  const template = await api('/templates', { name: 'قالب قياس', kind: 'static',
    definition: { id: templateId, name: 'قالب قياس', kind: 'static', sizes: ['x'],
      layers: [{ type: 'solid', fill: 'brand.colors.background' }] } }, 201);
  const project = await api('/projects', { title: 'قياس الانتظار', brand_kit_id: brand.id,
    template_id: template.id, content: { headline: 'عنوان قياس' } }, 201);
  projectId = project.id;
  const body = { project_id: projectId, size: 'x', format: 'mp4' };
  const headers = { 'idempotency-key': suffix };
  const empty = await api('/renders', body, 202, headers);
  renderId = empty.id;
  assertEta(empty, 1.5, false);
  console.log(JSON.stringify({ measurement: 'empty', response: empty }));
  const normal = getQueue('normal');
  const original = await normal.getJob(renderId);
  assert.ok(original);
  jobs.push(original);
  const payload = original.data;
  await measureHistory(templateId);

  // Higher priority 0, equal priority 1 (including delayed), lower priority 2.
  const mixed = await Promise.all([
    addJob(normal, payload), addJob(normal, payload, { priority: 1 }),
    addJob(normal, payload, { priority: 1, delay: 60000 }),
    addJob(normal, payload, { priority: 2 }),
  ]);
  const mixedResponse = await api('/renders', body, 202, headers);
  assertEta(mixedResponse, 90, true); // Three eligible predecessors × 45 + 1.5.
  const counted = await getRenderEta({ queueName: 'normal', renderId,
    priority: original.priority, averageSeconds: 1 }, { warn: () => assert.fail('unexpected active warning') });
  assertEta(counted, 4.5, false);
  console.log(JSON.stringify({ measurement: 'priority_filter', states: await Promise.all(mixed.map(job => job.getState())),
    queued_ahead: 3, lower_priority_excluded: 1, self_excluded: 1, response: counted }));
  for (const job of mixed) await job.remove();

  // A distinct predecessor proves exclusion of active, independently of self-exclusion.
  const predecessor = await addJob(normal, payload);
  worker = new Worker(normal.name, async () => {}, { connection: getRedis(),
    prefix: process.env.BULLMQ_PREFIX, autorun: false });
  activeJob = await worker.getNextJob(lockToken, { block: false });
  assert.equal(activeJob?.id, predecessor.id);
  const oldStart = Date.now() - 271000;
  await getRedis().hset(normal.toKey(predecessor.id), 'processedOn', oldStart);
  const activeResponse = await api('/renders', body, 202, headers);
  assertEta(activeResponse, 1.5, false);
  console.log(JSON.stringify({ measurement: 'overdue_active', queue: 'normal',
    active_job_id: predecessor.id, processedOn: oldStart, warn_threshold_seconds: 270,
    response: activeResponse }));
  await activeJob.moveToFailed(new Error('462 measurement finished'), lockToken);
  activeJob = undefined;
  await worker.close();
  worker = undefined;
  await original.remove();

  // Replaying the original id finds the actual batch queue, not the request default.
  const batch = getQueue('batch');
  for (let index = 0; index < 7; index++) await addJob(batch, payload, { priority: 1 });
  jobs.push(await batch.add('462-target', payload, { jobId: renderId, priority: 1 }));
  const batchResponse = await api('/renders', body, 202, headers);
  assertEta(batchResponse, 300, true);
  console.log(JSON.stringify({ measurement: 'batch_saturated', queued_ahead: 7,
    average_seconds: 45, uncapped_seconds: 316.5, response: batchResponse }));

  // Authentication is supplied through stdin, never argv or a file.
  const curl = spawnSync('curl', ['--silent', '--show-error', '--max-time', '10', '--config', '-'], {
    input: `url = "${base}/v1/renders"\nrequest = "POST"\nheader = "Authorization: Bearer ${token}"\nheader = "Content-Type: application/json"\nheader = "Idempotency-Key: ${suffix}"\ndata = ${JSON.stringify(JSON.stringify(body))}\n`,
    encoding: 'utf8',
  });
  assert.equal(curl.status, 0);
  assertEta(JSON.parse(curl.stdout), 300, true);
  console.log(`curl response: ${curl.stdout}`);
} finally {
  if (activeJob) await activeJob.moveToFailed(new Error('462 cleanup'), lockToken);
  if (worker) await worker.close();
  for (const job of jobs) await job.remove();
  await closeQueues();
  await closePool();
  console.log(JSON.stringify({ fixture_tenant: tenantId, fixture_project: projectId,
    fixture_render: renderId, queue_jobs_removed: jobs.length,
    database_fixture: 'retained for review; sample history rolled back' }));
}
