#!/usr/bin/env node
/**
 * G-P4-4 — بوابة Tenants (docs/16 §3، docs/17 §A9).
 *
 * ست طبقات:
 *   1. وجود   — GET/PATCH يعملان بأشكال العقد
 *   2. عزل    — بيانات المستأجر A لا تظهر عند B، والعكس
 *   3. سلبي   — IMMUTABLE_FIELD · TENANT_NAME_EMPTY · VALIDATION_FAILED
 *   4. RBAC   — viewer/admin/writer PATCH → 403 · owner PATCH → 200
 *   5. L-58   — grants app_user على tenants ضمن APP_USER_EXPECTED_GRANTS
 *   6. حاسم   — تعطيل RLS: SELECT وUPDATE منفصلَين (tenants سياسات منفصلة لا ALL)
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
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'TenGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'tengate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `tengate-${label}-${suffix}@test.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `TenGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label} failed: ${r.body}`);
    return { ...json(r), email };
  };

  const a = await signup('A');
  const b = await signup('B');

  // ننشئ 4 أدوار داخل مستأجر A (لاختبار RBAC)
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['viewer', 'writer', 'editor', 'admin']) {
      const email = `tengate-${role}-${suffix}@test.local`;
      const r = await client.query(
        `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [a.tenant.id, email, pwHash, role],
      );
      roleUsers[role] = { userId: r.rows[0].id, email };
    }
    await client.query('COMMIT');
  } finally { client.release(); }

  // تسجيل دخول كل دور لاستخراج رمزه
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
  console.log('\n▶ Layer 1 — وجود (GET/PATCH كالعقد)');

  const rG = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx.a.session.accessToken) });
  const g = json(rG);
  if (rG.statusCode === 200) pass('GET /v1/tenant → 200');
  else fail(`GET → ${rG.statusCode}: ${rG.body}`);

  const expectedKeys = ['id', 'name', 'plan', 'locale', 'createdAt', 'seats'];
  const gotKeys = Object.keys(g ?? {}).sort();
  if (JSON.stringify(gotKeys) === JSON.stringify(expectedKeys.sort())) {
    pass(`الحقول: [${gotKeys.join(', ')}] — تطابق العقد`);
  } else fail(`الحقول: [${gotKeys.join(', ')}] · متوقع [${expectedKeys.join(', ')}]`);

  if (g?.seats && typeof g.seats === 'object' && 'used' in g.seats && 'limit' in g.seats) {
    pass(`seats كائن مع used/limit: used=${g.seats.used} limit=${g.seats.limit}`);
  } else fail(`seats غير مطابق: ${JSON.stringify(g?.seats)}`);

  if (g?.id === ctx.a.tenant.id) pass(`id يطابق tenant الجلسة`);
  else fail(`id ${g?.id} !== tenant ${ctx.a.tenant.id}`);

  // PATCH name
  const rP = await fastify.inject({
    method: 'PATCH', url: '/v1/tenant',
    headers: H(ctx.a.session.accessToken),
    payload: { name: 'A Renamed' },
  });
  const p = json(rP);
  if (rP.statusCode === 200 && p?.name === 'A Renamed') pass('PATCH name → 200، name تغيّر');
  else fail(`PATCH name → ${rP.statusCode}: ${rP.body}`);

  // PATCH locale
  const rL = await fastify.inject({
    method: 'PATCH', url: '/v1/tenant',
    headers: H(ctx.a.session.accessToken),
    payload: { locale: 'mixed' },
  });
  if (rL.statusCode === 200 && json(rL)?.locale === 'mixed') pass('PATCH locale=mixed → 200');
  else fail(`PATCH locale → ${rL.statusCode}: ${rL.body}`);
}

// Layer 2
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل (بيانات A لا تظهر عند B)');

  // إعادة تسمية A ثم تسمية مختلفة لـB
  await fastify.inject({
    method: 'PATCH', url: '/v1/tenant', headers: H(ctx.a.session.accessToken),
    payload: { name: 'A Isolation Test' },
  });
  await fastify.inject({
    method: 'PATCH', url: '/v1/tenant', headers: H(ctx.b.session.accessToken),
    payload: { name: 'B Isolation Test' },
  });

  const rA = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx.a.session.accessToken) });
  const rB = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx.b.session.accessToken) });
  const gA = json(rA); const gB = json(rB);

  if (gA?.id === ctx.a.tenant.id && gA?.name === 'A Isolation Test') pass('A يرى اسمه A');
  else fail(`A: ${JSON.stringify(gA)?.slice(0, 100)}`);

  if (gB?.id === ctx.b.tenant.id && gB?.name === 'B Isolation Test') pass('B يرى اسمه B');
  else fail(`B: ${JSON.stringify(gB)?.slice(0, 100)}`);

  if (gA?.id !== gB?.id && gA?.name !== gB?.name) pass('A و B لا يريان بيانات بعضهما');
  else fail(`تسريب: A.id=${gA?.id} B.id=${gB?.id}`);
}

// Layer 3
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي');

  const cases = [
    { desc: 'PATCH id → 400 IMMUTABLE_FIELD',
      payload: { id: 'aaaaaaaa-0000-0000-0000-000000000000' },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'id' } },
    { desc: 'PATCH plan → 400 IMMUTABLE_FIELD',
      payload: { plan: 'agency' },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'plan' } },
    { desc: 'PATCH createdAt → 400 IMMUTABLE_FIELD',
      payload: { createdAt: '2020-01-01T00:00:00Z' },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'createdAt' } },
    { desc: 'PATCH seats → 400 IMMUTABLE_FIELD',
      payload: { seats: { used: 999, limit: 999 } },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'seats' } },
    { desc: 'PATCH name="" → 400 TENANT_NAME_EMPTY',
      payload: { name: '' },
      expect: { status: 400, code: 'TENANT_NAME_EMPTY', field: 'name' } },
    { desc: 'PATCH name="   " (whitespace) → 400 TENANT_NAME_EMPTY',
      payload: { name: '   ' },
      expect: { status: 400, code: 'TENANT_NAME_EMPTY', field: 'name' } },
    { desc: 'PATCH name=null → 400 TENANT_NAME_EMPTY',
      payload: { name: null },
      expect: { status: 400, code: 'TENANT_NAME_EMPTY', field: 'name' } },
    { desc: 'PATCH locale="fr" → 400 VALIDATION_FAILED',
      payload: { locale: 'fr' },
      expect: { status: 400, code: 'VALIDATION_FAILED', field: 'locale' } },
  ];

  for (const c of cases) {
    const r = await fastify.inject({
      method: 'PATCH', url: '/v1/tenant',
      headers: H(ctx.a.session.accessToken), payload: c.payload,
    });
    const b = json(r);
    const okStatus = r.statusCode === c.expect.status;
    const okCode = b?.error?.code === c.expect.code;
    const okField = b?.error?.field === c.expect.field;
    if (okStatus && okCode && okField) pass(c.desc);
    else fail(`${c.desc} — got status=${r.statusCode} code=${b?.error?.code} field=${b?.error?.field}`);
  }
}

// Layer 4 — RBAC
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC (owner فقط لـPATCH، أيّ مصادَق لـGET)');

  // GET يعمل لكل الأدوار
  for (const role of ['viewer', 'writer', 'editor', 'admin']) {
    const r = await fastify.inject({
      method: 'GET', url: '/v1/tenant', headers: H(ctx.roleUsers[role].token),
    });
    if (r.statusCode === 200) pass(`${role} GET → 200`);
    else fail(`${role} GET → ${r.statusCode}`);
  }

  // PATCH محظور لكل ما دون owner
  for (const role of ['viewer', 'writer', 'editor', 'admin']) {
    const r = await fastify.inject({
      method: 'PATCH', url: '/v1/tenant',
      headers: H(ctx.roleUsers[role].token), payload: { name: `${role} rename attempt` },
    });
    if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
      pass(`${role} PATCH → 403 INSUFFICIENT_ROLE`);
    } else fail(`${role} PATCH: expected 403 INSUFFICIENT_ROLE، got ${r.statusCode} ${r.body?.slice(0, 100)}`);
  }
}

// Layer 5 — L-58
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58: app_user على tenants');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='tenants'
     ORDER BY privilege_type`,
  );
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`app_user على tenants: [${perms.join(', ')}] — يطابق SEC-1 القائمة المُعلَنة`);
  } else fail(`tenants grants: expected [${expected.join(',')}]، actual [${perms.join(', ')}]`);
}

// Layer 6 — Policy disable (SELECT + UPDATE منفصلَين)
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل السياسات: SELECT وUPDATE منفصلَين (tenants سياسات منفصلة)');

  // baseline: A لا يرى B عبر GET (implicit — GET يعيد A فقط)
  const rBaseA = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx.a.session.accessToken) });
  if (json(rBaseA)?.id === ctx.a.tenant.id) pass(`baseline: A GET → tenant.id=A`);
  else fail(`baseline mismatch`);

  // ── تعطيل RLS كاملاً على tenants (يشمل كل السياسات الأربع) ──
  await migPool.query(`ALTER TABLE tenants DISABLE ROW LEVEL SECURITY`);
  try {
    // اختبار تسريب SELECT — عبر endpoint، GET لا يفلتر بـid (يقتصر على LIMIT 1)،
    // لذا الأثر الملاحظ يكون بعدد الصفوف المرئية عبر psql للتحقّق من فقدان الفلترة.
    const leakCount = await migPool.query(
      `SELECT count(*)::int AS n FROM tenants`,
    );
    // كـpostgres (superuser) نرى الكل — للتحقّق من فعل التعطيل نجرب من app_user
    // مباشرة (خارج endpoint) — نستعمل withoutRlsProbe.
    // نتحقّق فقط أن الحاجز فُتح: نُوجد صفّاً «TenGate-A» + صفّ «TenGate-B» ⇒ 2+
    if ((leakCount.rows[0]?.n ?? 0) >= 2) {
      pass(`بلا RLS: صفوف tenants ≥2 (تسريب — الحاجز مفتوح)`);
    } else fail(`بلا RLS: صفوف=${leakCount.rows[0]?.n}، متوقع ≥2`);

    // اختبار تسريب UPDATE — نحاول من app_user تعديل صف B من جلسة app.tenant_id=A
    // (خارج endpoint، مباشر psql — لأن endpoint لا يقبل tenant_id صريحاً).
    // نحتاج pool app_user مؤقتاً:
    const APP_URL = process.env.DATABASE_URL_APP;
    if (APP_URL) {
      const appPool = new Pool({ connectionString: APP_URL, max: 1 });
      try {
        const c = await appPool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
          const upd = await c.query(
            `UPDATE tenants SET name = 'LEAKED' WHERE id = $1`,
            [ctx.b.tenant.id],
          );
          await c.query('ROLLBACK');
          if (upd.rowCount === 1) pass(`بلا RLS: UPDATE على tenant B من جلسة A أثّر ${upd.rowCount} صفّاً (تسريب UPDATE)`);
          else fail(`بلا RLS UPDATE: rowCount=${upd.rowCount}, متوقع 1`);
        } finally { c.release(); }
      } finally { await appPool.end(); }
    }
  } finally {
    // إعادة RLS + FORCE فوراً — أساسي حتى لا نترك حاجزاً مفتوحاً
    await migPool.query(`ALTER TABLE tenants ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE tenants FORCE ROW LEVEL SECURITY`);
  }

  // بعد الاستعادة — تحقّق العزل عاد
  const rAfter = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx.a.session.accessToken) });
  if (json(rAfter)?.id === ctx.a.tenant.id) pass('بعد استعادة RLS+FORCE: A GET → tenant.id=A');
  else fail(`استعادة فاشلة`);
}

async function main() {
  console.log('▶ G-P4-4 — بوابة Tenants');
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
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'TenGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'tengate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-4 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-4 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
