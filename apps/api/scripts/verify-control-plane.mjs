#!/usr/bin/env node
/**
 * G-P4-13 — بوابة control plane (A27).
 *
 * ست طبقات + سبع خاصّة بالحدّ الثاني:
 *   1. وجود   — /platform/auth/login · list · get · update
 *   2. عزل    — رمز مستأجر على /platform → 401 · رمز منصّة على /v1/projects → 401
 *   3. سلبي   — plan_overrides بمفتاح مجهول → 400 · role غير كافٍ → 403
 *   4. RBAC   — platform viewer على PATCH → 403
 *   5. L-58   — app_user بلا منح على platform_users/platform_sessions
 *   6. حاسم   — DISABLE سياسة control_plane على tenants ⇒ المالك يرى 0
 *              ⇒ استعادة
 *
 * الخاصّة (البند 4):
 *   (أ) المالك يقرأ عبر مستأجرين — بيانات فعلية
 *   (ب) owner عادي على /platform/tenants ⇒ 401 (رمزه من users JWT)
 *   (ج) رمز مالك على /v1/projects ⇒ 401 (sub_type='platform' لا يمرّ auth-guard)
 *   (د) app_user + auth_lookup لا يحصلون على platform_users
 *   (هـ) صفر BYPASSRLS في كل الأدوار
 *   (و) جدول تجريبي بلا سياسة ⇒ check-control-plane-policies يسقط
 *   (ز) plan_overrides بمفتاح مجهول ⇒ 400
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }
function json(res) { try { return JSON.parse(res.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'CpGate-%'`);
  await migPool.query(`DELETE FROM platform_users WHERE email LIKE 'cpgate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'cpgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  // مستأجرَان عاديّان
  const signup = async (label) => {
    const email = `cpgate-tenant-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `CpGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
    return { ...json(r), email };
  };
  const t1 = await signup('T1');
  const t2 = await signup('T2');

  // 3 platform users (owner/admin/viewer) — نُنشئها عبر migPool
  // (لا endpoint /platform/users بعد — يُنشأ في A28)
  const platformUsers = {};
  const pool = getPlatformPool();
  const c = await pool.connect();
  try {
    for (const role of ['owner', 'admin', 'viewer']) {
      const email = `cpgate-${role}-${suffix}@platform.local`;
      const r = await c.query(
        `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [email, pwHash, role],
      );
      platformUsers[role] = { id: r.rows[0].id, email };
    }
  } finally { c.release(); }

  // تسجيل دخول كل واحد → رمز
  for (const role of Object.keys(platformUsers)) {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/login',
      payload: { email: platformUsers[role].email, password: 'strong_password_1234!' },
    });
    if (r.statusCode !== 200) throw new Error(`platform login ${role}: ${r.body}`);
    platformUsers[role].token = json(r).session.accessToken;
  }
  return { t1, t2, platformUsers };
}

// ── Layer 1 ─────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود');

  const rL = await fastify.inject({
    method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.platformUsers.owner.token),
  });
  const lB = json(rL);
  if (rL.statusCode === 200 && Array.isArray(lB?.data) && 'hasMore' in lB) {
    pass(`GET /v1/platform/tenants → 200 بغلاف §1.5 (data=${lB.data.length})`);
  } else fail(`list: ${rL.statusCode}`);

  const rG = await fastify.inject({
    method: 'GET', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.owner.token),
  });
  const gB = json(rG);
  if (rG.statusCode === 200 && gB?.effectiveLimits?.brandKitsLimit === 1) {
    pass(`GET /v1/platform/tenants/:id → 200 مع effectiveLimits`);
  } else fail(`get: ${rG.statusCode} ${rG.body?.slice(0, 200)}`);

  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.owner.token),
    payload: { plan: 'studio' },
  });
  if (rP.statusCode === 200 && json(rP)?.plan === 'studio') {
    pass(`PATCH plan='studio' → 200`);
  } else fail(`patch: ${rP.statusCode} ${rP.body}`);
}

// ── Layer 2 ─────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل بين المستوى الأول والثاني');

  // (ج) رمز مالك على /v1/projects → 401 (sub_type='platform')
  const rCP = await fastify.inject({
    method: 'GET', url: '/v1/projects', headers: H(ctx.platformUsers.owner.token),
  });
  if (rCP.statusCode === 401) pass(`(ج) رمز مالك على /v1/projects → 401 (sub_type='platform' لا يمرّ auth-guard)`);
  else fail(`platform token on tenant route: ${rCP.statusCode}`);

  // (ب) رمز مستأجر عادي على /platform/tenants → 401
  const rTP = await fastify.inject({
    method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.t1.session.accessToken),
  });
  if (rTP.statusCode === 401) pass(`(ب) رمز مستأجر (user JWT) على /platform → 401`);
  else fail(`tenant token on platform: ${rTP.statusCode}`);

  // بلا Bearer → 401
  const rNo = await fastify.inject({ method: 'GET', url: '/v1/platform/tenants' });
  if (rNo.statusCode === 401) pass(`بلا Bearer على /platform → 401`);
  else fail(`no auth: ${rNo.statusCode}`);
}

// ── Layer 3 ─────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي');

  // (ز) plan_overrides بمفتاح مجهول → 400
  const rBad = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.owner.token),
    payload: { planOverrides: { brandKits: 10 } }, // typo (should be brand_kits_limit)
  });
  if (rBad.statusCode === 400 && json(rBad)?.error?.code === 'IMMUTABLE_FIELD' && json(rBad)?.error?.field === 'planOverrides.brandKits') {
    pass(`(ز) planOverrides.brandKits (مفتاح مجهول) → 400 IMMUTABLE_FIELD مع field`);
  } else fail(`unknown key: ${rBad.statusCode} ${json(rBad)?.error?.code} ${json(rBad)?.error?.field}`);

  // القيمة الخاطئة (سالب)
  const rNeg = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.owner.token),
    payload: { planOverrides: { brand_kits_limit: -5 } },
  });
  if (rNeg.statusCode === 400 && json(rNeg)?.error?.code === 'VALIDATION_FAILED') {
    pass(`planOverrides.brand_kits_limit=-5 → 400 VALIDATION_FAILED`);
  } else fail(`neg value: ${rNeg.statusCode} ${json(rNeg)?.error?.code}`);

  // القيمة الصحيحة (10) — تنجح
  const rOk = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.owner.token),
    payload: { planOverrides: { brand_kits_limit: 10, seats_limit: null } },
  });
  if (rOk.statusCode === 200 && json(rOk)?.planOverrides?.brand_kits_limit === 10) {
    pass(`planOverrides صحيح → 200 محفوظ`);
  } else fail(`ok patch: ${rOk.statusCode}`);
}

// ── Layer 4 ─────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC platform');

  // viewer على PATCH → 403
  const rV = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${ctx.t1.tenant.id}`,
    headers: H(ctx.platformUsers.viewer.token),
    payload: { plan: 'starter' },
  });
  if (rV.statusCode === 403 && json(rV)?.error?.code === 'PLATFORM_INSUFFICIENT_ROLE') {
    pass(`viewer PATCH → 403 PLATFORM_INSUFFICIENT_ROLE`);
  } else fail(`viewer patch: ${rV.statusCode}`);

  // viewer على GET (list + tenant) → 200 (viewer+)
  const rVL = await fastify.inject({
    method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.platformUsers.viewer.token),
  });
  if (rVL.statusCode === 200) pass(`viewer GET list → 200`);
  else fail(`viewer list: ${rVL.statusCode}`);
}

// ── Layer 5 ─────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (app_user بلا منح على platform_*)');

  for (const t of ['platform_users', 'platform_sessions']) {
    const r = await migPool.query(
      `SELECT count(*)::int AS n FROM information_schema.table_privileges
       WHERE grantee = 'app_user' AND table_schema='public' AND table_name = $1`, [t]);
    if (r.rows[0].n === 0) pass(`(د) app_user على ${t}: 0 منح (فصل كامل)`);
    else fail(`${t} leaked grants: ${r.rows[0].n}`);
  }

  // auth_lookup كذلك
  const r2 = await migPool.query(
    `SELECT count(*)::int AS n FROM information_schema.table_privileges
     WHERE grantee = 'auth_lookup' AND table_schema='public' AND table_name IN ('platform_users','platform_sessions')`);
  if (r2.rows[0].n === 0) pass(`auth_lookup على platform_*: 0 منح`);
  else fail(`auth_lookup leaked: ${r2.rows[0].n}`);

  // control_plane_user يحمل SELECT على 18 جدول + كتابة محدودة
  const r3 = await migPool.query(
    `SELECT count(DISTINCT table_name) FROM information_schema.table_privileges
     WHERE grantee='control_plane_user' AND table_schema='public'`);
  if (r3.rows[0].count >= 20) pass(`control_plane_user يحمل منح على ≥20 جدولاً (18 tenant + plans + platform_*)`);
  else fail(`control_plane grants count: ${r3.rows[0].count}`);
}

// ── Layer 6 + (هـ) + (و) ────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل سياسة control_plane (الحاسم)');

  // (هـ) صفر BYPASSRLS
  const r = await migPool.query(
    `SELECT count(*)::int AS n FROM pg_roles WHERE rolbypassrls = true AND rolname NOT LIKE 'pg\\_%'`);
  if (r.rows[0].n === 0) pass(`(هـ) صفر BYPASSRLS في كل الأدوار غير-pg`);
  else fail(`BYPASSRLS leaked: ${r.rows[0].n}`);

  // baseline: المالك يرى مستأجرَين
  const rBase = await fastify.inject({
    method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.platformUsers.owner.token),
  });
  const baseCount = json(rBase)?.data?.length ?? 0;
  if (baseCount >= 2) pass(`(أ) baseline: المالك يرى ${baseCount} مستأجرين (عابر — RLS بسياسة لا bypass)`);
  else fail(`baseline: ${baseCount}`);

  // تعطيل سياسة control_plane على tenants → المالك يرى 0
  await migPool.query(`DROP POLICY IF EXISTS tenants_control_plane_all ON tenants`);
  try {
    const rAfter = await fastify.inject({
      method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.platformUsers.owner.token),
    });
    const afterCount = json(rAfter)?.data?.length ?? -1;
    if (afterCount === 0) {
      pass(`بلا policy على tenants: المالك يرى 0 (صمت بالانحياز للأمان)`);
    } else fail(`disable didn't lock out: ${afterCount}`);
  } finally {
    // استعادة
    await migPool.query(`
      CREATE POLICY tenants_control_plane_all ON tenants
        FOR ALL USING (current_user = 'control_plane_user')
        WITH CHECK (current_user = 'control_plane_user')
    `);
  }

  const rRestored = await fastify.inject({
    method: 'GET', url: '/v1/platform/tenants', headers: H(ctx.platformUsers.owner.token),
  });
  const restoredCount = json(rRestored)?.data?.length ?? 0;
  if (restoredCount === baseCount) pass(`استعادة: المالك يرى ${restoredCount} مجدداً`);
  else fail(`restore: ${restoredCount}`);

  // (و) الحارس check-control-plane-policies يسقط عند حذف سياسة
  await migPool.query(`DROP POLICY IF EXISTS tenants_control_plane_all ON tenants`);
  let guardFailed = false;
  try {
    execSync('pnpm --filter @pf-mediakit/db check:control-plane-policies', {
      cwd: join(__dirname, '../../..'),
      env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      stdio: 'pipe',
    });
  } catch { guardFailed = true; }
  // استعادة نهائية
  await migPool.query(`
    CREATE POLICY tenants_control_plane_all ON tenants
      FOR ALL USING (current_user = 'control_plane_user')
      WITH CHECK (current_user = 'control_plane_user')
  `);
  if (guardFailed) pass(`(و) check-control-plane-policies يسقط عند حذف سياسة (L-46)`);
  else fail(`guard didn't fail on missing policy`);
}

async function main() {
  console.log('▶ G-P4-13 — Control Plane (A27)');
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
    await closePlatformPool();
    await closeQueues();
    // تنظيف
    await migPool.query(`UPDATE tenants SET plan = 'trial' WHERE name LIKE 'CpGate-%'`);
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'CpGate-%'`);
    await migPool.query(`DELETE FROM platform_users WHERE email LIKE 'cpgate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'cpgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-13 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-13 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
