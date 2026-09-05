#!/usr/bin/env node
/**
 * G-P4-5 — بوابة Users + invite (docs/17 §A10، docs/16 §4).
 *
 * ست طبقات + ثلاث حالات خاصة:
 *   1. وجود   — 5 endpoints تعمل كما في العقد
 *   2. عزل    — معرّف مستأجر آخر → 404 (لا 403)
 *   3. سلبي   — 6 أكواد أخطاء (§4)
 *   4. RBAC   — viewer/writer/editor/reviewer/approver: invite/patch/delete → 403
 *   5. L-58   — grants app_user على users + invitations (SEC-1 القائمة)
 *   6. حاسم   — تعطيل RLS على users + invitations كلاهما (users بسياستين)
 *
 * حالات خاصة:
 *   - حذف آخر owner ⇒ 409 LAST_OWNER
 *   - خفض دور آخر owner ⇒ 409 LAST_OWNER
 *   - دعوة ببريد موجود في المستأجر ⇒ 409 USER_ALREADY_MEMBER
 *
 * users يحمل سياستَين — الطبقة الحاسمة تُثبت أن app_user لا يستفيد
 * من users_auth_lookup (المقصورة على TO auth_lookup).
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

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'UsrGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'usrgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `usrgate-${label}-${suffix}@test.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `UsrGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label} failed: ${r.body}`);
    return { ...json(r), email };
  };

  const a = await signup('A');   // owner tenant A
  const b = await signup('B');   // owner tenant B

  // إضافة 5 أدوار غير-owner في مستأجر A لاختبار RBAC
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']) {
      const email = `usrgate-${role}-${suffix}@test.local`;
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
    if (r.statusCode !== 200) throw new Error(`login ${role} failed: ${r.body}`);
    roleUsers[role].token = json(r).session.accessToken;
  }

  return { a, b, roleUsers };
}

// Layer 1
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (5 endpoints كالعقد)');

  const rL = await fastify.inject({ method: 'GET', url: '/v1/users', headers: H(ctx.a.session.accessToken) });
  const list = json(rL);
  if (rL.statusCode === 200 && Array.isArray(list?.data) && list.data.length >= 7) {
    pass(`GET /v1/users → 200 مع ${list.data.length} مستخدماً (owner + 6 أدوار)`);
  } else fail(`GET list → ${rL.statusCode}, count=${list?.data?.length}`);

  const rG = await fastify.inject({
    method: 'GET', url: `/v1/users/${ctx.a.user.id}`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rG.statusCode === 200 && json(rG)?.role === 'owner') pass('GET /v1/users/:id (owner لنفسه) → 200');
  else fail(`GET :id → ${rG.statusCode}`);

  const rI = await fastify.inject({
    method: 'POST', url: '/v1/users/invite',
    headers: H(ctx.a.session.accessToken),
    payload: { email: `usrgate-invited-${Date.now()}@test.local`, role: 'writer' },
  });
  const invBody = json(rI);
  if (rI.statusCode === 201 && invBody?.id && invBody?.expiresAt) {
    pass(`POST /v1/users/invite → 201 مع id + expiresAt`);
  } else fail(`invite → ${rI.statusCode}: ${rI.body}`);

  // PATCH role — نجرّب على editor (نحوّله إلى writer)
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/users/${ctx.roleUsers.editor.userId}`,
    headers: H(ctx.a.session.accessToken),
    payload: { role: 'writer' },
  });
  if (rP.statusCode === 200 && json(rP)?.role === 'writer') pass('PATCH /v1/users/:id role → 200');
  else fail(`PATCH → ${rP.statusCode}: ${rP.body}`);

  // DELETE — نحذف approver (لسنا آخر owner)
  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${ctx.roleUsers.approver.userId}`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'gate test cleanup 10+ chars' },
  });
  const dB = json(rD);
  if (rD.statusCode === 200 && dB?.userId === ctx.roleUsers.approver.userId && 'reassignedProjects' in dB) {
    pass(`DELETE /v1/users/:id → 200 مع {userId, reassignedProjects: ${dB.reassignedProjects}, deletedDrafts: ${dB.deletedDrafts}, newOwnerId: ${dB.newOwnerId?.slice(0, 8) ?? 'null'}...}`);
  } else fail(`DELETE → ${rD.statusCode}: ${rD.body}`);
}

// Layer 2
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل (معرّف من مستأجر آخر → 404)');

  const cases = [
    { method: 'GET', url: `/v1/users/${ctx.b.user.id}` },
    { method: 'PATCH', url: `/v1/users/${ctx.b.user.id}`, payload: { role: 'writer' } },
    { method: 'DELETE', url: `/v1/users/${ctx.b.user.id}`, payload: { reason: 'evil attempt 10+ chars' } },
  ];

  for (const c of cases) {
    const r = await fastify.inject({ ...c, headers: H(ctx.a.session.accessToken) });
    if (r.statusCode === 404 && json(r)?.error?.code === 'NOT_FOUND') {
      pass(`${c.method} /v1/users/<B-owner-id> من A → 404 NOT_FOUND`);
    } else fail(`${c.method} isolation: expected 404، got ${r.statusCode} ${r.body?.slice(0, 100)}`);
  }
}

// Layer 3 — سلبي + الحالات الثلاث الخاصة
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي + 3 حالات خاصة');

  // (خاص 1) دعوة ببريد موجود → 409 USER_ALREADY_MEMBER
  const rExists = await fastify.inject({
    method: 'POST', url: '/v1/users/invite',
    headers: H(ctx.a.session.accessToken),
    payload: { email: ctx.roleUsers.writer.email, role: 'viewer' },
  });
  const eB = json(rExists);
  if (rExists.statusCode === 409 && eB?.error?.code === 'USER_ALREADY_MEMBER') {
    pass(`دعوة ببريد موجود → 409 USER_ALREADY_MEMBER`);
  } else fail(`invite existing → ${rExists.statusCode} ${eB?.error?.code}`);

  // PENDING_INVITE_EXISTS — دعوتان متتاليتان لنفس البريد
  const pendingEmail = `usrgate-pending-${Date.now()}@test.local`;
  const rP1 = await fastify.inject({
    method: 'POST', url: '/v1/users/invite',
    headers: H(ctx.a.session.accessToken),
    payload: { email: pendingEmail, role: 'writer' },
  });
  if (rP1.statusCode !== 201) { fail(`setup PENDING failed: ${rP1.body}`); }
  const rP2 = await fastify.inject({
    method: 'POST', url: '/v1/users/invite',
    headers: H(ctx.a.session.accessToken),
    payload: { email: pendingEmail, role: 'viewer' },
  });
  if (rP2.statusCode === 409 && json(rP2)?.error?.code === 'PENDING_INVITE_EXISTS') {
    pass(`دعوة ثانية على بريد بصفّ نشط → 409 PENDING_INVITE_EXISTS`);
  } else fail(`PENDING → ${rP2.statusCode} ${json(rP2)?.error?.code}`);

  // REASON_TOO_SHORT
  const rReason = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${ctx.roleUsers.reviewer.userId}`,
    headers: H(ctx.a.session.accessToken), payload: { reason: 'short' },
  });
  if (rReason.statusCode === 400 && json(rReason)?.error?.code === 'REASON_TOO_SHORT') {
    pass(`DELETE بـreason < 10 → 400 REASON_TOO_SHORT`);
  } else fail(`REASON_TOO_SHORT → ${rReason.statusCode}`);

  // IMMUTABLE_FIELD على PATCH بـemail (مفتاح غير مسموح)
  const rEmail = await fastify.inject({
    method: 'PATCH', url: `/v1/users/${ctx.roleUsers.viewer.userId}`,
    headers: H(ctx.a.session.accessToken),
    payload: { email: 'change@evil.com' },
  });
  if (rEmail.statusCode === 400 && ['IMMUTABLE_FIELD','VALIDATION_FAILED'].includes(json(rEmail)?.error?.code)) {
    pass(`PATCH بـemail → 400 (email محظور)`);
  } else fail(`PATCH email → ${rEmail.statusCode}`);

  // VALIDATION_FAILED لـinvite بدور غير صالح
  const rBadRole = await fastify.inject({
    method: 'POST', url: '/v1/users/invite',
    headers: H(ctx.a.session.accessToken),
    payload: { email: `bad-${Date.now()}@test.local`, role: 'nonsense' },
  });
  if (rBadRole.statusCode === 400 && json(rBadRole)?.error?.code === 'VALIDATION_FAILED') {
    pass(`invite بدور غير صالح → 400 VALIDATION_FAILED`);
  } else fail(`invite bad role → ${rBadRole.statusCode}`);

  // منع الحذف الذاتي (انحراف مُعلَن — العقد صامت)
  const rSelfDel = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${ctx.a.user.id}`,
    headers: H(ctx.a.session.accessToken), payload: { reason: 'self delete attempt' },
  });
  if (rSelfDel.statusCode === 403 && json(rSelfDel)?.error?.code === 'FORBIDDEN') {
    pass(`DELETE ذاتي → 403 FORBIDDEN (انحراف مُعلَن)`);
  } else fail(`self-delete → ${rSelfDel.statusCode}`);

  // (خاص 2) خفض آخر owner → LAST_OWNER
  const rDemote = await fastify.inject({
    method: 'PATCH', url: `/v1/users/${ctx.a.user.id}`,
    headers: H(ctx.a.session.accessToken), payload: { role: 'admin' },
  });
  if (rDemote.statusCode === 409 && json(rDemote)?.error?.code === 'LAST_OWNER') {
    pass(`خفض آخر owner → 409 LAST_OWNER`);
  } else fail(`demote last owner → ${rDemote.statusCode} ${json(rDemote)?.error?.code}`);

  // (خاص 3) حذف آخر owner → LAST_OWNER (نستعمل admin ليحذف owner)
  const rDelOwner = await fastify.inject({
    method: 'DELETE', url: `/v1/users/${ctx.a.user.id}`,
    headers: H(ctx.roleUsers.admin.token),
    payload: { reason: 'admin trying to delete last owner' },
  });
  if (rDelOwner.statusCode === 409 && json(rDelOwner)?.error?.code === 'LAST_OWNER') {
    pass(`حذف آخر owner (بواسطة admin) → 409 LAST_OWNER`);
  } else fail(`delete last owner → ${rDelOwner.statusCode} ${json(rDelOwner)?.error?.code}`);
}

// Layer 4
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC (invite/patch/delete)');

  // GET :self لكل الأدوار
  for (const role of ['writer', 'editor', 'reviewer', 'viewer']) {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/users/${ctx.roleUsers[role].userId}`,
      headers: H(ctx.roleUsers[role].token),
    });
    if (r.statusCode === 200) pass(`${role} GET :self → 200`);
    else fail(`${role} GET :self → ${r.statusCode}`);
  }

  // GET :other لغير-admin+ → 404 (بحسب get.ts)
  for (const role of ['writer', 'editor', 'viewer']) {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/users/${ctx.a.user.id}`,
      headers: H(ctx.roleUsers[role].token),
    });
    if (r.statusCode === 404) pass(`${role} GET :other → 404 (لا 403 كمنطق العزل)`);
    else fail(`${role} GET :other → ${r.statusCode}`);
  }

  // invite/patch/delete لغير-admin+ → 403
  const nonAdmins = ['writer', 'editor', 'reviewer', 'viewer'];
  for (const role of nonAdmins) {
    const token = ctx.roleUsers[role].token;
    const cases = [
      { method: 'POST', url: '/v1/users/invite', payload: { email: `evil-${Date.now()}@test.local`, role: 'writer' } },
      { method: 'PATCH', url: `/v1/users/${ctx.roleUsers.viewer.userId}`, payload: { role: 'writer' } },
      { method: 'DELETE', url: `/v1/users/${ctx.roleUsers.viewer.userId}`, payload: { reason: 'rbac test 10+ chars' } },
    ];
    for (const c of cases) {
      const r = await fastify.inject({ ...c, headers: H(token) });
      if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
        pass(`${role} ${c.method} → 403 INSUFFICIENT_ROLE`);
      } else fail(`${role} ${c.method}: expected 403، got ${r.statusCode} ${json(r)?.error?.code}`);
    }
  }
}

// Layer 5 — L-58
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (grants app_user على users + invitations)');
  for (const table of ['users', 'invitations']) {
    const r = await migPool.query(
      `SELECT privilege_type FROM information_schema.table_privileges
       WHERE grantee='app_user' AND table_schema='public' AND table_name=$1
       ORDER BY privilege_type`,
      [table],
    );
    const perms = r.rows.map((row) => row.privilege_type).sort();
    const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
    if (JSON.stringify(perms) === JSON.stringify(expected)) {
      pass(`${table}: [${perms.join(', ')}] — يطابق SEC-1 القائمة`);
    } else fail(`${table} grants: expected [${expected.join(',')}], got [${perms.join(', ')}]`);
  }
}

// Layer 6 — Policy disable (users بسياستَين + invitations)
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل السياسات (users بسياستَين + invitations)');

  // baseline: A لا يرى B عبر GET :id
  const rBase = await fastify.inject({
    method: 'GET', url: `/v1/users/${ctx.b.user.id}`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rBase.statusCode === 404) pass(`baseline: A GET(B-owner) = 404 (RLS + tenant_isolation policy)`);
  else fail(`baseline mismatch — got ${rBase.statusCode}`);

  // تعطيل users RLS (يعطّل السياستَين معاً)
  await migPool.query(`ALTER TABLE users DISABLE ROW LEVEL SECURITY`);
  try {
    const APP_URL = process.env.DATABASE_URL_APP;
    if (APP_URL) {
      const appPool = new Pool({ connectionString: APP_URL, max: 1 });
      try {
        const c = await appPool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
          const r = await c.query(`SELECT count(*)::int AS n FROM users`);
          await c.query('COMMIT');
          if ((r.rows[0]?.n ?? 0) >= 8) {
            pass(`بلا RLS على users: app_user يرى ≥8 مستخدمين (تسريب — الحاجز مفتوح)`);
          } else fail(`بلا RLS users: got ${r.rows[0]?.n}, متوقع ≥8`);
        } finally { c.release(); }
      } finally { await appPool.end(); }
    }
  } finally {
    await migPool.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE users FORCE ROW LEVEL SECURITY`);
  }

  // تعطيل invitations RLS
  await migPool.query(`ALTER TABLE invitations DISABLE ROW LEVEL SECURITY`);
  try {
    const APP_URL = process.env.DATABASE_URL_APP;
    if (APP_URL) {
      const appPool = new Pool({ connectionString: APP_URL, max: 1 });
      try {
        const c = await appPool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT app_set_tenant($1::uuid)', [ctx.b.tenant.id]);
          // ننشئ دعوة في B، ثم من جلسة A نرى invitations كلها
          await c.query(
            `INSERT INTO invitations(tenant_id, email, role, token_hash, expires_at)
             VALUES ($1, 'leak-probe@test.local', 'viewer', 'hash', now() + interval '1 day')
             ON CONFLICT DO NOTHING`,
            [ctx.b.tenant.id],
          );
          await c.query('COMMIT');

          await c.query('BEGIN');
          await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
          const r = await c.query(`SELECT count(*)::int AS n FROM invitations WHERE tenant_id != $1`, [ctx.a.tenant.id]);
          await c.query('COMMIT');
          if ((r.rows[0]?.n ?? 0) >= 1) {
            pass(`بلا RLS على invitations: A يرى دعوة B (تسريب — الحاجز مفتوح)`);
          } else fail(`بلا RLS invitations: got ${r.rows[0]?.n} صفوف لغير-A، متوقع ≥1`);
        } finally { c.release(); }
      } finally { await appPool.end(); }
    }
  } finally {
    await migPool.query(`ALTER TABLE invitations ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE invitations FORCE ROW LEVEL SECURITY`);
  }

  // استعادة
  const rAfter = await fastify.inject({
    method: 'GET', url: `/v1/users/${ctx.b.user.id}`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rAfter.statusCode === 404) pass('بعد استعادة RLS+FORCE: A GET(B-owner) = 404 مجدداً');
  else fail(`استعادة فاشلة`);

  // اختبار حاسم إضافي: users_auth_lookup لا يفيد app_user
  // (السياسة FOR TO auth_lookup فقط — app_user لا يرث)
  const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 1 });
  try {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      // بلا SET LOCAL — نتوقّع 0 صفوف من app_user (لا يستفيد من users_auth_lookup)
      const r = await c.query(`SELECT count(*)::int AS n FROM users`);
      await c.query('COMMIT');
      if ((r.rows[0]?.n ?? 0) === 0) {
        pass(`app_user بلا SET LOCAL يرى 0 من users (لا يستفيد من users_auth_lookup)`);
      } else fail(`app_user بلا SET LOCAL يرى ${r.rows[0]?.n} — سياسة auth_lookup تسرّبت لـapp_user!`);
    } finally { c.release(); }
  } finally { await appPool.end(); }
}

async function main() {
  console.log('▶ G-P4-5 — بوابة Users + invite');
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
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'UsrGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'usrgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-5 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-5 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
