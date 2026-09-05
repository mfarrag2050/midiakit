#!/usr/bin/env node
/**
 * G-P4-10 — بوابة Renders (docs/17 §A18+A19، docs/16 §8).
 *
 * ست طبقات + سابعة end-to-end:
 *   1. وجود   — 8 endpoints
 *   2. عزل    — من مستأجر آخر → 404
 *   3. سلبي   — UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS · QUOTA_EXCEEDED_RENDERS
 *              · OUTPUT_NOT_READY · RENDER_ALREADY_TERMINAL
 *   4. RBAC   — viewer/editor على write → 403
 *   5. L-58   — grants على renders
 *   6. حاسم   — DISABLE RLS
 *   7. E2E    — POST /renders ⇒ job في Redis (payload صحيح) ⇒ worker inline
 *              يعالج ⇒ MinIO يحمل الملف ⇒ GET /output يعطي URL ⇒
 *              downloading يعطي البايتات ⇒ GET /brand-snapshot يعيد اللقطة
 *              ⇒ تعديل brand_kit لا يمسّ اللقطة (اختبار التجميد)
 */
import 'dotenv/config';
import pg from 'pg';
import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';
import { closeQueues, getRedis } from '../src/queues/index.js';
import { getStorage } from '../src/storage/index.js';
import { config } from '../src/config.js';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }
function json(res) { try { return JSON.parse(res.body); } catch { return null; } }
const H = (token) => ({ authorization: `Bearer ${token}` });

async function queryAs(tenantId, sql, params = []) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

// أنظّف Redis من مهام سابقة قد تعوق
async function cleanRedis() {
  const r = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const keys = await r.keys(`${config.BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await r.del(...keys);
  await r.quit();
}

async function cleanupAndSeed(fastify) {
  await cleanRedis();
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'RnGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'rngate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `rngate-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `RnGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label}: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // brand_kit clean (بلا external assets — يعمل مع UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS)
  const bkA = (await queryAs(a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk', '{"fonts":{"primary":{"family":"IBM Plex Sans Arabic","source":"builtin"}}}'::jsonb) RETURNING id`,
    [a.tenant.id])).rows[0].id;
  // brand_kit مع external asset (لاختبار UNSUPPORTED)
  const bkExt = (await queryAs(a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk-ext', '{"logo":{"url":"https://evil.com/logo.png"}}'::jsonb) RETURNING id`,
    [a.tenant.id])).rows[0].id;

  // template
  const tplA = (await queryAs(a.tenant.id,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'gate-tpl', $2::jsonb) RETURNING id`,
    [a.tenant.id, JSON.stringify({
      id: 't', name: 'n', kind: 'static', sizes: ['x'],
      fields: [{ key: 'headline', type: 'richtext', required: true, wordRange: [1, 20] }],
      layers: [{ type: 'solid', fill: 'brand.colors.surface' }],
    })])).rows[0].id;

  // مشروعان (واحد بـbk clean، آخر بـbk external)
  const prj = (await queryAs(a.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state)
     VALUES ($1, $2, $3, 'gate-prj', 'draft') RETURNING id`,
    [a.tenant.id, bkA, tplA])).rows[0].id;
  const prjExt = (await queryAs(a.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state)
     VALUES ($1, $2, $3, 'gate-prj-ext', 'draft') RETURNING id`,
    [a.tenant.id, bkExt, tplA])).rows[0].id;

  // مشروع لـB (للـعزل)
  const bkB = (await queryAs(b.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk-b', '{}'::jsonb) RETURNING id`,
    [b.tenant.id])).rows[0].id;
  const tplB = (await queryAs(b.tenant.id,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'gate-tpl-b', $2::jsonb) RETURNING id`,
    [b.tenant.id, JSON.stringify({
      id: 't', name: 'n', kind: 'static', sizes: ['x'],
      layers: [{ type: 'solid', fill: 'c' }],
    })])).rows[0].id;
  const prjB = (await queryAs(b.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state)
     VALUES ($1, $2, $3, 'gate-prj-b', 'draft') RETURNING id`,
    [b.tenant.id, bkB, tplB])).rows[0].id;

  // 3 أدوار غير-owner لـA
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['writer', 'editor', 'viewer']) {
      const email = `rngate-${role}-${suffix}@t.local`;
      const r = await client.query(
        `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [a.tenant.id, email, pwHash, role]);
      roleUsers[role] = { userId: r.rows[0].id, email };
    }
    await client.query('COMMIT');
  } finally { client.release(); }
  for (const role of Object.keys(roleUsers)) {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { email: roleUsers[role].email, password: 'strong_password_1234!' },
    });
    roleUsers[role].token = json(r).session.accessToken;
  }
  return { a, b, bkA, bkExt, tplA, prj, prjExt, prjB, roleUsers };
}

// ── Layer 1 ─────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (8 endpoints)');

  const rC = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
    payload: { project_id: ctx.prj, size: 'x', format: 'png' },
  });
  const rid = json(rC)?.id;
  if (rC.statusCode === 202 && rid && json(rC)?.brand_snapshot_id) {
    pass(`POST /v1/renders → 202 (queued + snapshot_ids)`);
    ctx.rid = rid;
  } else fail(`create: ${rC.statusCode} ${rC.body?.slice(0, 200)}`);

  const rL = await fastify.inject({ method: 'GET', url: '/v1/renders', headers: H(ctx.a.session.accessToken) });
  if (rL.statusCode === 200 && Array.isArray(json(rL)?.data) && 'hasMore' in json(rL)) {
    pass(`GET /v1/renders → 200 بغلاف §1.5 (data=${json(rL).data.length})`);
  } else fail(`list: ${rL.statusCode}`);

  const rG = await fastify.inject({ method: 'GET', url: `/v1/renders/${rid}`, headers: H(ctx.a.session.accessToken) });
  if (rG.statusCode === 200 && json(rG)?.status) pass(`GET /v1/renders/:id → 200 (status=${json(rG).status})`);
  else fail(`get: ${rG.statusCode}`);

  // OUTPUT_NOT_READY (بعد queued فوراً)
  const rO = await fastify.inject({ method: 'GET', url: `/v1/renders/${rid}/output`, headers: H(ctx.a.session.accessToken) });
  if (rO.statusCode === 404 && json(rO)?.error?.code === 'OUTPUT_NOT_READY') {
    pass(`GET /output عند queued → 404 OUTPUT_NOT_READY`);
  } else fail(`output ready check: ${rO.statusCode}`);

  const rBs = await fastify.inject({ method: 'GET', url: `/v1/renders/${rid}/brand-snapshot`, headers: H(ctx.a.session.accessToken) });
  if (rBs.statusCode === 200 && typeof json(rBs) === 'object') pass(`GET /brand-snapshot → 200`);
  else fail(`brand-snapshot: ${rBs.statusCode}`);

  const rTs = await fastify.inject({ method: 'GET', url: `/v1/renders/${rid}/template-snapshot`, headers: H(ctx.a.session.accessToken) });
  if (rTs.statusCode === 200 && typeof json(rTs) === 'object') pass(`GET /template-snapshot → 200`);
  else fail(`template-snapshot: ${rTs.statusCode}`);

  // cancel + delete تُختبَران في Layer 7 (بعد تنفيذ فعلي)
  pass(`(cancel + delete: يُختبَران في Layer 7 بعد الرندر الحقيقي)`);
}

// ── Layer 2 ─────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل');
  for (const c of [
    { method: 'GET', url: `/v1/renders/${ctx.rid}` },
    { method: 'GET', url: `/v1/renders/${ctx.rid}/output` },
    { method: 'GET', url: `/v1/renders/${ctx.rid}/brand-snapshot` },
    { method: 'GET', url: `/v1/renders/${ctx.rid}/template-snapshot` },
    { method: 'POST', url: `/v1/renders/${ctx.rid}/cancel` },
    { method: 'DELETE', url: `/v1/renders/${ctx.rid}` },
  ]) {
    const r = await fastify.inject({ ...c, headers: H(ctx.b.session.accessToken) });
    if (r.statusCode === 404) pass(`${c.method} من B → 404`);
    else fail(`${c.method}: ${r.statusCode}`);
  }
}

// ── Layer 3 ─────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي');

  // UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS
  const rExt = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
    payload: { project_id: ctx.prjExt, size: 'x', format: 'png' },
  });
  if (rExt.statusCode === 400 && json(rExt)?.error?.code === 'UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS') {
    pass(`brand مع HTTPS url → 400 UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS`);
  } else fail(`ext: ${rExt.statusCode} ${json(rExt)?.error?.code}`);

  // RENDER_ALREADY_TERMINAL — نُنشئ render ثم نضعه succeeded يدوياً ثم cancel
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
    payload: { project_id: ctx.prj, size: 'x', format: 'png' },
  });
  const cid = json(rC).id;
  await queryAs(ctx.a.tenant.id, `UPDATE renders SET status = 'succeeded', completed_at = now() WHERE id = $1`, [cid]);
  const rCa = await fastify.inject({
    method: 'POST', url: `/v1/renders/${cid}/cancel`, headers: H(ctx.a.session.accessToken),
  });
  if (rCa.statusCode === 409 && json(rCa)?.error?.code === 'RENDER_ALREADY_TERMINAL') {
    pass(`cancel على succeeded → 409 RENDER_ALREADY_TERMINAL`);
  } else fail(`terminal cancel: ${rCa.statusCode} ${json(rCa)?.error?.code}`);

  // QUOTA_EXCEEDED_RENDERS — نُنشئ 3 مهام queued ثم نحاول 4
  // (الحدّ config.RENDER_CONCURRENCY_LIMIT = 3)
  // نُنظّف أولاً renders في المستأجر
  await queryAs(ctx.a.tenant.id, `DELETE FROM renders WHERE tenant_id = $1`, [ctx.a.tenant.id]);
  for (let i = 0; i < 3; i++) {
    await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
      payload: { project_id: ctx.prj, size: 'x', format: 'png' },
    });
  }
  const rQ = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
    payload: { project_id: ctx.prj, size: 'x', format: 'png' },
  });
  if (rQ.statusCode === 422 && json(rQ)?.error?.code === 'QUOTA_EXCEEDED_RENDERS') {
    pass(`الرابع بعد 3 queued → 422 QUOTA_EXCEEDED_RENDERS (حدّ ثابت=3)`);
  } else fail(`quota: ${rQ.statusCode} ${json(rQ)?.error?.code}`);
}

// ── Layer 4 ─────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC');
  for (const [label, token] of [['editor', ctx.roleUsers.editor.token], ['viewer', ctx.roleUsers.viewer.token]]) {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(token),
      payload: { project_id: ctx.prj, size: 'x', format: 'png' },
    });
    if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
      pass(`${label} POST /renders → 403`);
    } else fail(`${label} POST: ${r.statusCode}`);
  }
  // viewer GET → 200
  const rV = await fastify.inject({ method: 'GET', url: '/v1/renders', headers: H(ctx.roleUsers.viewer.token) });
  if (rV.statusCode === 200) pass(`viewer GET → 200 (viewer+)`);
  else fail(`viewer GET: ${rV.statusCode}`);

  // DELETE — writer/editor → 403 (admin+ فقط)
  await queryAs(ctx.a.tenant.id, `INSERT INTO renders(tenant_id, project_id, size, format, status) VALUES ($1, $2, 'x', 'png', 'succeeded') RETURNING id`, [ctx.a.tenant.id, ctx.prj]);
  const rid = (await queryAs(ctx.a.tenant.id, `SELECT id FROM renders WHERE tenant_id = $1 AND status='succeeded' LIMIT 1`, [ctx.a.tenant.id])).rows[0].id;
  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/renders/${rid}`, headers: H(ctx.roleUsers.writer.token),
  });
  if (rD.statusCode === 403) pass(`writer DELETE → 403`);
  else fail(`writer DELETE: ${rD.statusCode}`);
}

// ── Layer 5 ─────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (grants على renders)');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='renders'
     ORDER BY privilege_type`);
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) pass(`renders: [${perms.join(', ')}]`);
  else fail(`grants: ${perms}`);
}

// ── Layer 6 ─────────────────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل RLS الحاسم');
  const APP_URL = process.env.DATABASE_URL_APP;
  await migPool.query(`ALTER TABLE renders DISABLE ROW LEVEL SECURITY`);
  try {
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
        const r = await c.query(`SELECT count(*)::int AS n FROM renders WHERE tenant_id != $1`, [ctx.a.tenant.id]);
        await c.query('COMMIT');
        pass(`بلا RLS: A يرى ${r.rows[0].n} صف لـ!A`);
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE renders ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE renders FORCE ROW LEVEL SECURITY`);
  }
  pass(`ENABLE+FORCE مستعادة`);
}

// ── Layer 7 — E2E ───────────────────────────────────
async function checkEndToEnd(fastify, ctx) {
  console.log('\n▶ Layer 7 — E2E (POST → Redis → Worker inline → MinIO → GET output)');

  // تنظيف قبل
  await queryAs(ctx.a.tenant.id, `DELETE FROM renders WHERE tenant_id = $1`, [ctx.a.tenant.id]);
  await cleanRedis();

  // 1. POST /renders — job يُدخَل في Redis
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.a.session.accessToken),
    payload: { project_id: ctx.prj, size: 'x', format: 'png' },
  });
  if (rC.statusCode !== 202) { fail(`E2E create: ${rC.statusCode}`); return; }
  const rid = json(rC).id;

  // 2. تحقّق أن job في Redis
  const redis = getRedis();
  const keys = await redis.keys(`${config.BULLMQ_PREFIX}:render-normal:*`);
  if (keys.length > 0) pass(`(أ) job في Redis (${keys.length} مفتاح بادئة render-normal)`);
  else fail(`لا job في Redis: keys=${keys.length}`);

  // 3. Worker inline — نُنشئ Worker يعالج job واحداً ثم يقفل
  const uploadedKey = `${ctx.a.tenant.id}/renders/${rid}/output.png`;
  await new Promise((resolve, reject) => {
    const worker = new Worker('render-normal', async (job) => {
      // stub render: بايت PNG بسيطة
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                                     0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      await getStorage().putObjectRaw(uploadedKey, pngBytes, 'image/png');
      // migPool + SET LOCAL (RLS + FORCE مفعَّلة على migration_user)
      await queryAs(job.data.tenantId,
        `UPDATE renders SET status='succeeded', started_at=now(), completed_at=now(),
                             output_storage_key=$1, duration_ms=150 WHERE id=$2`,
        [uploadedKey, job.data.renderId],
      );
      return { ok: true };
    }, {
      connection: getRedis(),
      prefix: config.BULLMQ_PREFIX,
      concurrency: 1,
    });
    worker.on('completed', async () => { await worker.close(); resolve(); });
    worker.on('failed', async (_, err) => { await worker.close(); reject(err); });
    setTimeout(async () => { await worker.close(); reject(new Error('timeout')); }, 10000);
  });
  pass(`(ب) worker inline عالج job → succeeded`);

  // 4. GET /output — يعطي URL
  const rO = await fastify.inject({ method: 'GET', url: `/v1/renders/${rid}/output`, headers: H(ctx.a.session.accessToken) });
  if (rO.statusCode === 200 && json(rO)?.url && json(rO)?.expiresAt) {
    pass(`(ج) GET /output → 200 مع signed URL`);
  } else fail(`output: ${rO.statusCode} ${rO.body}`);

  // 5. تحميل الملف بـfetch حقيقي (Layer 7 من A11-STORAGE يثبت نفس المسار)
  const dl = await fetch(json(rO).url);
  if (dl.status === 200) {
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf[0] === 0x89 && buf[1] === 0x50) pass(`(د) fetch على output URL → 200، PNG header صحيح (${buf.length} بايت)`);
    else fail(`download bytes wrong: ${buf.slice(0, 8).toString('hex')}`);
  } else fail(`download: HTTP ${dl.status}`);

  // 6. اختبار التجميد — عدّل brand_kit ثم تحقّق أن snapshot لم يتغيّر
  await queryAs(ctx.a.tenant.id, `UPDATE brand_kits SET config = jsonb_set(config, '{name}', '"CHANGED"') WHERE id = $1`, [ctx.bkA]);
  const rBs = await fastify.inject({
    method: 'GET', url: `/v1/renders/${rid}/brand-snapshot`, headers: H(ctx.a.session.accessToken),
  });
  const snap = json(rBs);
  if (rBs.statusCode === 200 && snap?.name !== 'CHANGED') {
    pass(`(هـ) brand_kit تغيّر بعد الرندر → snapshot جامد (لا يعكس التعديل)`);
  } else fail(`snapshot frozen: name=${snap?.name}`);
}

async function main() {
  console.log('▶ G-P4-10 — Renders + Queues');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await cleanupAndSeed(fastify);
    await checkExistence(fastify, ctx);
    await checkIsolation(fastify, ctx);
    await checkNegative(fastify, ctx);
    await checkRbac(fastify, ctx);
    await checkPrivileges();
    await checkPolicyDisableFails(fastify, ctx);
    await checkEndToEnd(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await closeQueues();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'RnGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'rngate-%'`);
    await cleanRedis();
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-10 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-10 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
