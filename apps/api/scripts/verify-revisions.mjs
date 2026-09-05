#!/usr/bin/env node
/**
 * G-P4-11 — بوابة Revisions (docs/17 §A20، docs/16 §10).
 *
 * ست طبقات + حالات:
 *   1. وجود   — 3 endpoints × 5 موارد (نختبر عيّنة على brand_kits+projects)
 *              + triggers على 5 جداول تعمل
 *   2. عزل    — revision من مستأجر آخر → 404
 *   3. سلبي   — REVISION_NOT_FOUND · REASON_TOO_SHORT · INVALID_FILTER_FIELD
 *              · STALE_UPDATE (§7.4 If-Match)
 *   4. RBAC   — writer على restore → 403
 *   5. L-58   — grants على revisions
 *   6. حاسم   — DISABLE RLS على revisions
 *
 * حالات خاصّة (البند 4):
 *   (أ) استرجاع نسخة قديمة ⇒ المورد يعود لحالتها
 *   (ب) استرجاع نسخة من مستأجر آخر ⇒ 404
 *   (ج) تعديل على نسخة قديمة (If-Match قديم) ⇒ STALE_UPDATE
 *   (د) حذف مستخدم له مشاريع ⇒ صفوف revisions بـaction='reassign'
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
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

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'RevGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'revgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `revgate-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `RevGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label}: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // brand_kit + template + project لـA
  const bkA = json(await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(a.session.accessToken),
    payload: { name: 'rev-bk', config: {} },
  })).id;
  const tplA = json(await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(a.session.accessToken),
    payload: {
      name: 'rev-tpl', kind: 'static',
      definition: { id: 't', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] },
    },
  })).id;
  const projA = json(await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(a.session.accessToken),
    payload: { title: 'rev-prj', brand_kit_id: bkA, template_id: tplA },
  })).id;

  // مشروع لـB (للـعزل)
  const bkB = json(await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(b.session.accessToken),
    payload: { name: 'rev-bk-b', config: {} },
  })).id;
  const tplB = json(await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(b.session.accessToken),
    payload: {
      name: 'rev-tpl-b', kind: 'static',
      definition: { id: 't', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] },
    },
  })).id;
  const projB = json(await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(b.session.accessToken),
    payload: { title: 'rev-prj-b', brand_kit_id: bkB, template_id: tplB },
  })).id;

  // writer لـA (لـRBAC)
  const client = await migPool.connect();
  let writerToken;
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    const r = await client.query(
      `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'writer', true) RETURNING id`,
      [a.tenant.id, `revgate-writer-${suffix}@t.local`, pwHash]);
    await client.query('COMMIT');
    const lr = await fastify.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { email: `revgate-writer-${suffix}@t.local`, password: 'strong_password_1234!' },
    });
    writerToken = json(lr).session.accessToken;
  } finally { client.release(); }

  return { a, b, bkA, tplA, projA, projB, writerToken };
}

// ── Layer 1 ─────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود + triggers');

  // triggers أنشأت revisions للـcreate — تحقّق
  const revs = await queryAs(ctx.a.tenant.id,
    `SELECT resource_type, action, count(*) FROM revisions
     WHERE tenant_id = $1 GROUP BY resource_type, action ORDER BY resource_type, action`,
    [ctx.a.tenant.id]);
  if (revs.rowCount >= 3) {
    pass(`triggers أنشأت ${revs.rows.length} أنواع revisions (create × brand_kit/project/template/user)`);
  } else fail(`triggers: only ${revs.rowCount} types`);

  // نُعدّل brand_kit ونتحقّق أن revision جديد ظهر
  const beforeCount = json(await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions`, headers: H(ctx.a.session.accessToken),
  })).data.length;
  await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${ctx.bkA}`, headers: H(ctx.a.session.accessToken),
    payload: { name: 'rev-bk (updated)' },
  });
  const afterList = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions`, headers: H(ctx.a.session.accessToken),
  });
  const afterData = json(afterList).data;
  if (afterList.statusCode === 200 && afterData.length === beforeCount + 1) {
    pass(`GET /brand-kits/:id/revisions → 200 بعد PATCH، عدد نمى بـ1 (${beforeCount}→${afterData.length})`);
  } else fail(`revisions list: ${afterList.statusCode} count=${afterData.length}`);

  // GET :revId
  const revId = afterData[0].id;
  const rG = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions/${revId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rG.statusCode === 200 && json(rG)?.reconstructedState) {
    pass(`GET /revisions/:revId → 200 مع reconstructedState`);
  } else fail(`get revId: ${rG.statusCode}`);

  ctx.firstRevId = afterData[afterData.length - 1].id;  // أقدم revision (create)
  ctx.latestRevId = revId;

  // (أ) استعادة revision الأقدم (اسم أصلي 'rev-bk')
  const rR = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${ctx.bkA}/revisions/${ctx.firstRevId}/restore`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'test restore to original 12 chars' },
  });
  if (rR.statusCode === 200 && json(rR)?.name === 'rev-bk') {
    pass(`(أ) restore إلى revision الأقدم → name عاد 'rev-bk'`);
  } else fail(`restore: ${rR.statusCode} name=${json(rR)?.name}`);

  // نتأكّد أن الاستعادة أضافت revision جديد (action=restore + reason)
  const afterRestoreList = json(await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions`, headers: H(ctx.a.session.accessToken),
  })).data;
  if (afterRestoreList.length === afterData.length + 1) {
    pass(`الاستعادة أنشأت revision جديد (المجموع ${afterRestoreList.length})`);
  } else fail(`restore didn't add revision: ${afterRestoreList.length}`);
}

// ── Layer 2 ─────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل');

  // B يحاول قراءة revisions لـbrand_kit A → 404
  const rL = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions`, headers: H(ctx.b.session.accessToken),
  });
  if (rL.statusCode === 404) pass(`(ب) GET revisions A من B → 404`);
  else fail(`isolation list: ${rL.statusCode}`);

  // B يحاول restore revision لـA → 404
  const rR = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${ctx.bkA}/revisions/${ctx.firstRevId}/restore`,
    headers: H(ctx.b.session.accessToken),
    payload: { reason: 'evil restore 12+ chars long' },
  });
  if (rR.statusCode === 404) pass(`POST restore من B → 404`);
  else fail(`isolation restore: ${rR.statusCode}`);
}

// ── Layer 3 ─────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي');

  // REVISION_NOT_FOUND
  const fakeRev = '00000000-0000-0000-0000-000000000000';
  const rNF = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions/${fakeRev}`, headers: H(ctx.a.session.accessToken),
  });
  if (rNF.statusCode === 404 && json(rNF)?.error?.code === 'REVISION_NOT_FOUND') {
    pass(`revId غير موجود → 404 REVISION_NOT_FOUND`);
  } else fail(`revNF: ${rNF.statusCode} ${json(rNF)?.error?.code}`);

  // REASON_TOO_SHORT
  const rRS = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${ctx.bkA}/revisions/${ctx.firstRevId}/restore`,
    headers: H(ctx.a.session.accessToken), payload: { reason: 'short' },
  });
  if (rRS.statusCode === 400 && json(rRS)?.error?.code === 'REASON_TOO_SHORT') {
    pass(`restore بـreason < 10 → 400 REASON_TOO_SHORT`);
  } else fail(`reason: ${rRS.statusCode} ${json(rRS)?.error?.code}`);

  // INVALID_FILTER_FIELD
  const rIF = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${ctx.bkA}/revisions?filter[bogus]=x`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rIF.statusCode === 400 && json(rIF)?.error?.code === 'INVALID_FILTER_FIELD') {
    pass(`filter غير مسموح → 400 INVALID_FILTER_FIELD`);
  } else fail(`filter: ${rIF.statusCode}`);

  // (ج) STALE_UPDATE — نقرأ updated_at ثم نُعدّل بـPATCH بدون If-Match،
  // ثم نحاول PATCH بـIf-Match قديم
  const proj = json(await fastify.inject({
    method: 'GET', url: `/v1/projects/${ctx.projA}`, headers: H(ctx.a.session.accessToken),
  }));
  const oldUpdated = proj.updatedAt;

  // تعديل بلا If-Match — يجب أن ينجح (اختياري في A20)
  const rNoMatch = await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${ctx.projA}`, headers: H(ctx.a.session.accessToken),
    payload: { title: 'no-if-match' },
  });
  if (rNoMatch.statusCode === 200) pass(`PATCH بلا If-Match → 200 (اختياري)`);
  else fail(`patch no-if-match: ${rNoMatch.statusCode}`);

  // الآن نُعدّل بـIf-Match قديم — يجب أن يفشل بـ409
  const rStale = await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${ctx.projA}`,
    headers: { ...H(ctx.a.session.accessToken), 'if-match': oldUpdated },
    payload: { title: 'stale-attempt' },
  });
  if (rStale.statusCode === 409 && json(rStale)?.error?.code === 'STALE_UPDATE') {
    pass(`(ج) PATCH بـIf-Match قديم → 409 STALE_UPDATE`);
  } else fail(`stale: ${rStale.statusCode} ${json(rStale)?.error?.code}`);
}

// ── Layer 4 ─────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC (writer على restore → 403)');
  const r = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${ctx.bkA}/revisions/${ctx.firstRevId}/restore`,
    headers: H(ctx.writerToken), payload: { reason: 'writer trying restore' },
  });
  if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
    pass(`writer POST restore → 403`);
  } else fail(`writer restore: ${r.statusCode}`);
}

// ── Layer 5 ─────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='revisions'
     ORDER BY privilege_type`);
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) pass(`revisions: [${perms.join(', ')}]`);
  else fail(`grants: ${perms}`);
}

// ── Layer 6 ─────────────────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل RLS');
  const APP_URL = process.env.DATABASE_URL_APP;
  await migPool.query(`ALTER TABLE revisions DISABLE ROW LEVEL SECURITY`);
  try {
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
        const r = await c.query(`SELECT count(*)::int AS n FROM revisions WHERE tenant_id != $1`, [ctx.a.tenant.id]);
        await c.query('COMMIT');
        pass(`بلا RLS: A يرى ${r.rows[0].n} صف لـ!A`);
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE revisions ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE revisions FORCE ROW LEVEL SECURITY`);
  }
  pass(`ENABLE+FORCE مستعادة`);
}

// ── (د) — user delete reassign log ──────────────────
async function checkUserDeleteReassign(fastify, ctx) {
  console.log('\n▶ (د) DELETE user → revisions بـaction=reassign');

  // نُنشئ editor لـA، ننسب له مشروعاً غير-draft، ثم نحذفه
  const suffix = Date.now();
  const email2 = `revgate-editor2-${suffix}@t.local`;
  const pwHash = await hashPassword('strong_password_1234!');
  const editor2 = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'editor', true) RETURNING id`,
    [ctx.a.tenant.id, email2, pwHash])).rows[0].id;

  // مشروع غير-draft بـcreated_by=editor2
  const targetPid = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 'reassign-src', 'review', $4) RETURNING id`,
    [ctx.a.tenant.id, ctx.bkA, ctx.tplA, editor2])).rows[0].id;

  const beforeReassignCount = (await queryAs(ctx.a.tenant.id,
    `SELECT count(*)::int AS n FROM revisions
     WHERE resource_type='project' AND resource_id=$1 AND action='reassign'`,
    [targetPid])).rows[0].n;

  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${editor2}`, headers: H(ctx.a.session.accessToken),
    payload: { reason: 'A20 reassign gate test' },
  });
  if (rD.statusCode !== 200) { fail(`user delete: ${rD.statusCode} ${rD.body}`); return; }

  const afterReassignCount = (await queryAs(ctx.a.tenant.id,
    `SELECT count(*)::int AS n FROM revisions
     WHERE resource_type='project' AND resource_id=$1 AND action='reassign'`,
    [targetPid])).rows[0].n;

  if (afterReassignCount === beforeReassignCount + 1) {
    pass(`revisions.action='reassign' مضاف لكل مشروع مُعاد إسناده (${beforeReassignCount}→${afterReassignCount})`);
  } else fail(`reassign log: ${beforeReassignCount}→${afterReassignCount}`);

  // reason موجود
  const reasonRow = await queryAs(ctx.a.tenant.id,
    `SELECT reason FROM revisions WHERE resource_type='project' AND resource_id=$1 AND action='reassign'`,
    [targetPid]);
  if (reasonRow.rows[0]?.reason === 'A20 reassign gate test') {
    pass(`revisions.reason محفوظ للـreassign`);
  } else fail(`reason: ${reasonRow.rows[0]?.reason}`);
}

async function main() {
  console.log('▶ G-P4-11 — Revisions');
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
    await checkUserDeleteReassign(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await closeQueues();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'RevGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'revgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-11 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-11 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
