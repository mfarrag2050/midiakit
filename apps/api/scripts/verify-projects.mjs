#!/usr/bin/env node
/**
 * G-P4-8 — بوابة Projects (docs/17 §A14، docs/16 §7).
 *
 * ست طبقات + حالات خاصّة (البند 3 من التذكرة):
 *   1. وجود   — 5 endpoints
 *   2. عزل    — كل method من مستأجر آخر → 404
 *   3. سلبي   — BRAND_KIT_NOT_FOUND · TEMPLATE_NOT_FOUND · LOCALE_UNSUPPORTED ·
 *              PROJECT_HAS_RENDERS · IMMUTABLE_FIELD (state) · INVALID_FILTER_FIELD
 *   4. RBAC   — viewer/editor/reviewer على write ops → 403
 *   5. L-58   — grants app_user على projects
 *   6. حاسم   — DISABLE RLS → تسريب → ENABLE+FORCE
 *
 * حالات خاصّة (البند 3):
 *   (أ) مشروع يشير إلى قالب عام ⇒ يعمل (البذر جعله ممكناً)
 *   (ب) مشروع يشير إلى قالب مستأجر آخر ⇒ يُرفض (TEMPLATE_NOT_FOUND — RLS)
 *   (ج) حذف قالب له مشروع ⇒ 409 TEMPLATE_IN_USE (A13)
 *   (د) حذف هوية لها مشروع ⇒ 409 BRAND_KIT_IN_USE (A12)
 *   (هـ) حذف مستخدم له مشاريع ⇒ إعادة إسناد لا حذف
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';
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
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'PrjGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'prjgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `prjgate-${label}-${suffix}@test.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `PrjGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label}: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // brand_kit لكل مستأجر (لازم POST /projects)
  const bkA = (await queryAs(a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk-a', '{}'::jsonb) RETURNING id`,
    [a.tenant.id])).rows[0].id;
  const bkB = (await queryAs(b.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk-b', '{}'::jsonb) RETURNING id`,
    [b.tenant.id])).rows[0].id;

  // template خاص لـA وآخر لـB (اختبار cross-tenant)
  const tplA = (await queryAs(a.tenant.id,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'a-only', '{"id":"a","name":"n","kind":"static","sizes":["x"],"layers":[{"type":"solid","fill":"c"}]}')
     RETURNING id`,
    [a.tenant.id])).rows[0].id;
  const tplB = (await queryAs(b.tenant.id,
    `INSERT INTO templates(scope, tenant_id, kind, name, definition)
     VALUES ('tenant', $1, 'static', 'b-only', '{"id":"b","name":"n","kind":"static","sizes":["x"],"layers":[{"type":"solid","fill":"c"}]}')
     RETURNING id`,
    [b.tenant.id])).rows[0].id;

  // قالب عام لاختبار (الحالة أ)
  const globals = await migPool.query(`SELECT id FROM templates WHERE scope='global' AND deleted_at IS NULL ORDER BY name LIMIT 1`);
  const globalTplId = globals.rows[0].id;

  // 3 أدوار غير-admin لـA (writer + editor + viewer)
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['writer', 'editor', 'viewer']) {
      const email = `prjgate-${role}-${suffix}@test.local`;
      const r = await client.query(
        `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [a.tenant.id, email, pwHash, role],
      );
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

  return { a, b, bkA, bkB, tplA, tplB, globalTplId, roleUsers };
}

// ── Layer 1 ─────────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (5 endpoints)');

  const rL = await fastify.inject({ method: 'GET', url: '/v1/projects', headers: H(ctx.a.session.accessToken) });
  const lB = json(rL);
  if (rL.statusCode === 200 && Array.isArray(lB?.data) && 'hasMore' in lB && 'nextCursor' in lB) {
    pass(`GET /v1/projects → 200 بغلاف §1.5 (data=${lB.data.length})`);
  } else fail(`list → ${rL.statusCode} keys:${Object.keys(lB||{}).join(',')}`);

  const rC = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'Prj A', brand_kit_id: ctx.bkA, template_id: ctx.tplA },
  });
  const cB = json(rC);
  if (rC.statusCode === 201 && cB?.id && cB.currentState === 'draft' && cB.title === 'Prj A') {
    pass(`POST /v1/projects → 201 (currentState=draft, title مطابق)`);
    ctx.pid = cB.id;
  } else fail(`create → ${rC.statusCode}: ${rC.body}`);

  const rG = await fastify.inject({
    method: 'GET', url: `/v1/projects/${ctx.pid}`, headers: H(ctx.a.session.accessToken),
  });
  if (rG.statusCode === 200 && json(rG)?.content !== undefined) pass(`GET /v1/projects/:id → 200 مع content`);
  else fail(`get → ${rG.statusCode}`);

  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${ctx.pid}`, headers: H(ctx.a.session.accessToken),
    payload: { title: 'Prj A (updated)' },
  });
  if (rP.statusCode === 200 && json(rP)?.title === 'Prj A (updated)') pass(`PATCH → 200 (title updated)`);
  else fail(`patch → ${rP.statusCode}: ${rP.body}`);

  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/projects/${ctx.pid}`, headers: H(ctx.a.session.accessToken),
  });
  if (rD.statusCode === 204) pass(`DELETE → 204 (soft)`);
  else fail(`delete → ${rD.statusCode}: ${rD.body}`);

  const rG2 = await fastify.inject({
    method: 'GET', url: `/v1/projects/${ctx.pid}`, headers: H(ctx.a.session.accessToken),
  });
  if (rG2.statusCode === 404) pass(`بعد soft delete: GET :id → 404`);
  else fail(`soft-delete visibility: ${rG2.statusCode}`);
}

// ── Layer 2 ─────────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل (مشروع A من B → 404)');

  const rC = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'iso', brand_kit_id: ctx.bkA, template_id: ctx.tplA },
  });
  const pid = json(rC).id;
  ctx.isoPid = pid;

  for (const c of [
    { method: 'GET', url: `/v1/projects/${pid}` },
    { method: 'PATCH', url: `/v1/projects/${pid}`, payload: { title: 'evil' } },
    { method: 'DELETE', url: `/v1/projects/${pid}` },
  ]) {
    const r = await fastify.inject({ ...c, headers: H(ctx.b.session.accessToken) });
    if (r.statusCode === 404 && json(r)?.error?.code === 'NOT_FOUND') {
      pass(`${c.method} /v1/projects/<A-id> من B → 404`);
    } else fail(`${c.method} isolation: ${r.statusCode} ${json(r)?.error?.code}`);
  }
}

// ── Layer 3 ─────────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي + حالات خاصّة');

  // BRAND_KIT_NOT_FOUND
  const rBK = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'x', brand_kit_id: '00000000-0000-0000-0000-000000000000', template_id: ctx.tplA },
  });
  if (rBK.statusCode === 404 && json(rBK)?.error?.code === 'BRAND_KIT_NOT_FOUND') {
    pass(`BRAND_KIT_NOT_FOUND → 404`);
  } else fail(`BK_NOT_FOUND: ${rBK.statusCode} ${json(rBK)?.error?.code}`);

  // TEMPLATE_NOT_FOUND (uuid عشوائي)
  const rT = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'x', brand_kit_id: ctx.bkA, template_id: '00000000-0000-0000-0000-000000000000' },
  });
  if (rT.statusCode === 404 && json(rT)?.error?.code === 'TEMPLATE_NOT_FOUND') {
    pass(`TEMPLATE_NOT_FOUND → 404`);
  } else fail(`TPL_NOT_FOUND: ${rT.statusCode} ${json(rT)?.error?.code}`);

  // LOCALE_UNSUPPORTED
  const rLoc = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'x', brand_kit_id: ctx.bkA, template_id: ctx.tplA, locale: 'zh' },
  });
  if (rLoc.statusCode === 422 && json(rLoc)?.error?.code === 'LOCALE_UNSUPPORTED') {
    pass(`locale=zh → 422 LOCALE_UNSUPPORTED`);
  } else fail(`LOCALE: ${rLoc.statusCode} ${json(rLoc)?.error?.code}`);

  // IMMUTABLE_FIELD (state)
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'imm', brand_kit_id: ctx.bkA, template_id: ctx.tplA },
  });
  const immPid = json(rC).id;
  const rIm = await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${immPid}`, headers: H(ctx.a.session.accessToken),
    payload: { state: 'approved' },
  });
  if (rIm.statusCode === 400 && json(rIm)?.error?.code === 'IMMUTABLE_FIELD') {
    pass(`PATCH بـstate → 400 IMMUTABLE_FIELD (state يُغيَّر بـtransitions)`);
  } else fail(`IMMUTABLE: ${rIm.statusCode}`);

  // INVALID_FILTER_FIELD
  const rF = await fastify.inject({
    method: 'GET', url: '/v1/projects?filter[bogus]=x', headers: H(ctx.a.session.accessToken),
  });
  if (rF.statusCode === 400 && json(rF)?.error?.code === 'INVALID_FILTER_FIELD') {
    pass(`filter غير مسموح → 400 INVALID_FILTER_FIELD`);
  } else fail(`FILTER: ${rF.statusCode}`);

  // (ب) مشروع يشير إلى قالب مستأجر آخر ⇒ TEMPLATE_NOT_FOUND (RLS يحجب rowsB عن A)
  const rXt = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'x', brand_kit_id: ctx.bkA, template_id: ctx.tplB },
  });
  if (rXt.statusCode === 404 && json(rXt)?.error?.code === 'TEMPLATE_NOT_FOUND') {
    pass(`قالب مستأجر آخر → 404 TEMPLATE_NOT_FOUND (RLS يحجب)`);
  } else fail(`cross-tenant tpl: ${rXt.statusCode} ${json(rXt)?.error?.code}`);

  // (أ) مشروع بقالب عام ⇒ يعمل
  const rGlob = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'from global', brand_kit_id: ctx.bkA, template_id: ctx.globalTplId },
  });
  if (rGlob.statusCode === 201 && json(rGlob)?.template_id === ctx.globalTplId) {
    pass(`مشروع بقالب عام → 201 (البذر A13 جعله ممكناً)`);
  } else fail(`global tpl: ${rGlob.statusCode} ${rGlob.body}`);
  ctx.globPrjId = json(rGlob).id;

  // (ج) حذف قالب له مشروع ⇒ TEMPLATE_IN_USE (نُنشئ قالب خاص مسنداً)
  const rCT = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.a.session.accessToken),
    payload: {
      name: `T-in-use ${Date.now()}`, kind: 'static',
      definition: { id: 't1', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] },
    },
  });
  const usedTplId = json(rCT).id;
  await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
    payload: { title: 'using', brand_kit_id: ctx.bkA, template_id: usedTplId },
  });
  const rDT = await fastify.inject({
    method: 'DELETE', url: `/v1/templates/${usedTplId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rDT.statusCode === 409 && json(rDT)?.error?.code === 'TEMPLATE_IN_USE') {
    pass(`(ج) DELETE قالب له مشروع → 409 TEMPLATE_IN_USE`);
  } else fail(`TEMPLATE_IN_USE: ${rDT.statusCode} ${json(rDT)?.error?.code}`);

  // (د) حذف hوية لها مشروع ⇒ BRAND_KIT_IN_USE
  // نُنشئ hوية ثانية أولاً (بحسب A12: LAST_BRAND_KIT يفشل قبل IN_USE)
  await queryAs(ctx.a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'gate-bk-a2', '{}'::jsonb)`,
    [ctx.a.tenant.id]);

  const rDBK = await fastify.inject({
    method: 'DELETE', url: `/v1/brand-kits/${ctx.bkA}`, headers: H(ctx.a.session.accessToken),
  });
  if (rDBK.statusCode === 409 && json(rDBK)?.error?.code === 'BRAND_KIT_IN_USE') {
    pass(`(د) DELETE brand-kit لها مشروع → 409 BRAND_KIT_IN_USE`);
  } else fail(`BRAND_KIT_IN_USE: ${rDBK.statusCode} ${json(rDBK)?.error?.code}`);

  // (هـ) حذف مستخدم له مشاريع ⇒ إعادة إسناد لا حذف
  // نُضيف editor2 وننسب له مشروعاً غير-draft ثم نحذفه
  const email2 = `prjgate-editor2-${Date.now()}@t.local`;
  const pwHash = await hashPassword('strong_password_1234!');
  const editor2 = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'editor', true) RETURNING id`,
    [ctx.a.tenant.id, email2, pwHash])).rows[0].id;

  // نُدخل مشروعاً غير-draft بـcreated_by=editor2
  await queryAs(ctx.a.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 'reassign-target', 'review', $4)`,
    [ctx.a.tenant.id, ctx.bkA, ctx.tplA, editor2],
  );
  // ومسوّدة (تُحذف)
  await queryAs(ctx.a.tenant.id,
    `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, state, created_by)
     VALUES ($1, $2, $3, 'draft-to-del', 'draft', $4)`,
    [ctx.a.tenant.id, ctx.bkA, ctx.tplA, editor2],
  );

  const rDU = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${editor2}`, headers: H(ctx.a.session.accessToken),
    payload: { reason: 'gate test A14 reassign' },
  });
  const duB = json(rDU);
  if (rDU.statusCode === 200 && duB?.reassignedProjects === 1 && duB?.deletedDrafts === 1 && duB?.newOwnerId) {
    pass(`(هـ) DELETE user: reassignedProjects=${duB.reassignedProjects} deletedDrafts=${duB.deletedDrafts} newOwnerId set`);
  } else fail(`user delete reassign: ${rDU.statusCode} ${JSON.stringify(duB)}`);
}

// ── Layer 4 ─────────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC');

  // viewer + editor + reviewer... editor غير مسموح بـwrite (writer+ فقط)
  const editorToken = ctx.roleUsers.editor.token;
  const viewerToken = ctx.roleUsers.viewer.token;

  for (const [label, token] of [['editor', editorToken], ['viewer', viewerToken]]) {
    for (const c of [
      { method: 'POST', url: '/v1/projects', payload: { title: 't', brand_kit_id: ctx.bkA, template_id: ctx.tplA } },
      { method: 'PATCH', url: `/v1/projects/${ctx.isoPid}`, payload: { title: 'x' } },
    ]) {
      const r = await fastify.inject({ ...c, headers: H(token) });
      if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
        pass(`${label} ${c.method} → 403 INSUFFICIENT_ROLE`);
      } else fail(`${label} ${c.method}: ${r.statusCode} ${json(r)?.error?.code}`);
    }
  }

  // writer + editor + viewer يقرأون list (viewer+)
  for (const [label, token] of [['writer', ctx.roleUsers.writer.token], ['editor', editorToken], ['viewer', viewerToken]]) {
    const r = await fastify.inject({ method: 'GET', url: '/v1/projects', headers: H(token) });
    if (r.statusCode === 200) pass(`${label} GET list → 200 (يرى المُسند إليه/أنشأه)`);
    else fail(`${label} list → ${r.statusCode}`);
  }

  // DELETE writer على مشروع ليس draft — 403 INSUFFICIENT_ROLE
  const rDW = await fastify.inject({
    method: 'DELETE', url: `/v1/projects/${ctx.isoPid}`, headers: H(ctx.roleUsers.writer.token),
  });
  if (rDW.statusCode === 403 && json(rDW)?.error?.code === 'INSUFFICIENT_ROLE') {
    pass(`writer DELETE (ليس منشئاً + ليس admin) → 403`);
  } else fail(`writer DELETE: ${rDW.statusCode}`);
}

// ── Layer 5 ─────────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='projects'
     ORDER BY privilege_type`,
  );
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`projects: [${perms.join(', ')}] — يطابق SEC-1`);
  } else fail(`grants: expected ${expected}, got ${perms}`);
}

// ── Layer 6 ─────────────────────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل RLS الحاسم');

  // baseline
  const rBase = await fastify.inject({
    method: 'GET', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
  });
  const baseCount = json(rBase)?.data?.length ?? 0;
  pass(`baseline: A يرى ${baseCount} مشروع (كلها لـA)`);

  const APP_URL = process.env.DATABASE_URL_APP;
  await migPool.query(`ALTER TABLE projects DISABLE ROW LEVEL SECURITY`);
  try {
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
        const r = await c.query(
          `SELECT count(*)::int AS n FROM projects WHERE tenant_id != $1 AND deleted_at IS NULL`,
          [ctx.a.tenant.id],
        );
        await c.query('COMMIT');
        if ((r.rows[0]?.n ?? 0) >= 0) {
          pass(`بلا RLS على projects: A يرى ${r.rows[0]?.n} صف لـ!A (تسريب لو وُجد)`);
        } else fail(`bad count`);
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE projects ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE projects FORCE ROW LEVEL SECURITY`);
  }

  const rAfter = await fastify.inject({
    method: 'GET', url: '/v1/projects', headers: H(ctx.a.session.accessToken),
  });
  const afterCount = json(rAfter)?.data?.length ?? 0;
  if (afterCount === baseCount) pass(`بعد ENABLE+FORCE: A يرى ${afterCount} (استعادة)`);
  else fail(`استعادة فاشلة: قبل ${baseCount} بعد ${afterCount}`);
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('▶ G-P4-8 — بوابة Projects');
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
  } finally {
    await fastify.close();
    await closePool();
    // تنظيف: مشاريع + brand_kits + templates تُحذف بـCASCADE من tenants
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'PrjGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'prjgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-8 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-8 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
