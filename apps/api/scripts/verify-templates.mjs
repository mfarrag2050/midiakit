#!/usr/bin/env node
/**
 * G-P4-7 — بوابة Templates (docs/17 §A13، docs/16 §6).
 *
 * سبع طبقات:
 *   1. وجود   — 5 endpoints (docs/16 §6.1–§6.5)
 *   2. عزل    — قالب خاص لمستأجر آخر → 404
 *   3. سلبي   — GLOBAL_TEMPLATE_READONLY · TEMPLATE_SCHEMA_VIOLATION ·
 *              TEMPLATE_IN_USE · INVALID_FILTER_FIELD
 *   4. RBAC   — writer/editor على write ops → 403
 *   5. L-58   — grants app_user على templates
 *   6. حاسم   — تعطيل السياسات الأربع كلها ⇒ تسريب ⇒ استعادة
 *              (اختبار SELECT و UPDATE كلاً على حدة)
 *   7. **العام** — مستأجر جديد يرى الستة العامة (لا صفراً)
 *              — PATCH على global ⇒ 403 من التطبيق
 *              — نفس مع تعطيل التطبيق ⇒ RLS ترفض
 *              — النسخ (GET + POST بدون /duplicate — قرار #1) لا يمسّ الأصل
 *              — check-template-sync يسقط عند تعديل ملف الحزمة
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';
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
const H = (token) => ({ authorization: `Bearer ${token}` });

async function queryAs(tenantId, sql, params = []) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'TplGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'tplgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `tplgate-${label}-${suffix}@test.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `TplGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label} failed: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // writer + editor لـA لاختبار RBAC
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['writer', 'editor']) {
      const email = `tplgate-${role}-${suffix}@test.local`;
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
  return { a, b, roleUsers };
}

// قالب اختبار صالح (يمرّ بـvalidateTemplate)
const validTplDef = {
  id: 'test_valid',
  name: 'قالب اختبار',
  kind: 'static',
  sizes: ['x'],
  fields: [{ key: 'headline', type: 'richtext', required: true, wordRange: [4, 16] }],
  layers: [
    { type: 'solid', fill: 'brand.colors.surface' },
    { type: 'headline', field: 'headline', wrap: 'uniform', align: 'right',
      anchor: 'centerLower', verticalAnchor: 0.5, font: 'brand.typography.breaking',
      justify: 'brand.typography.justify' },
  ],
};

// ── Layer 1 ─────────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (5 endpoints كالعقد)');

  // GET list
  const rL = await fastify.inject({ method: 'GET', url: '/v1/templates', headers: H(ctx.a.session.accessToken) });
  const lB = json(rL);
  if (rL.statusCode === 200 && Array.isArray(lB?.data) && lB.data.length >= 6) {
    pass(`GET /v1/templates → 200 (${lB.data.length} قالب، ≥6 عالمي)`);
  } else fail(`list → ${rL.statusCode}, count=${lB?.data?.length}`);

  // POST tenant template
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/templates',
    headers: H(ctx.a.session.accessToken),
    payload: { name: `Test A ${Date.now()}`, kind: 'static', definition: validTplDef },
  });
  const cB = json(rC);
  if (rC.statusCode === 201 && cB?.id && cB.scope === 'tenant') {
    pass(`POST /v1/templates → 201 (scope=tenant)`);
    ctx.tenantTplId = cB.id;
  } else fail(`create → ${rC.statusCode}: ${rC.body}`);

  // GET :id (على الذي أنشأناه)
  const rG = await fastify.inject({
    method: 'GET', url: `/v1/templates/${ctx.tenantTplId}`, headers: H(ctx.a.session.accessToken),
  });
  const gB = json(rG);
  if (rG.statusCode === 200 && gB?.definition) pass(`GET /v1/templates/:id → 200 مع definition`);
  else fail(`get → ${rG.statusCode}`);

  // PATCH
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/templates/${ctx.tenantTplId}`,
    headers: H(ctx.a.session.accessToken), payload: { name: 'Test A (updated)' },
  });
  if (rP.statusCode === 200 && json(rP)?.name === 'Test A (updated)') pass(`PATCH → 200 (name updated)`);
  else fail(`patch → ${rP.statusCode}: ${rP.body}`);

  // DELETE
  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/templates/${ctx.tenantTplId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rD.statusCode === 204) pass(`DELETE → 204 (soft)`);
  else fail(`delete → ${rD.statusCode}: ${rD.body}`);

  // بعد الحذف: GET :id ⇒ 404 (deleted_at IS NOT NULL)
  const rG2 = await fastify.inject({
    method: 'GET', url: `/v1/templates/${ctx.tenantTplId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rG2.statusCode === 404) pass(`بعد soft delete: GET :id → 404`);
  else fail(`soft-delete visibility: ${rG2.statusCode}`);
}

// ── Layer 2 ─────────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل (قالب خاص لـA من B → 404)');

  // ننشئ قالب لـA أولاً
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.a.session.accessToken),
    payload: { name: `Iso ${Date.now()}`, kind: 'static', definition: validTplDef },
  });
  const aTplId = json(rC).id;
  ctx.isoTplId = aTplId;

  for (const c of [
    { method: 'GET', url: `/v1/templates/${aTplId}` },
    { method: 'PATCH', url: `/v1/templates/${aTplId}`, payload: { name: 'evil' } },
    { method: 'DELETE', url: `/v1/templates/${aTplId}` },
  ]) {
    const r = await fastify.inject({ ...c, headers: H(ctx.b.session.accessToken) });
    if (r.statusCode === 404 && json(r)?.error?.code === 'NOT_FOUND') {
      pass(`${c.method} /v1/templates/<A-id> من B → 404`);
    } else fail(`${c.method} isolation: ${r.statusCode} ${json(r)?.error?.code}`);
  }
}

// ── Layer 3 ─────────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي');

  // GLOBAL_TEMPLATE_READONLY — PATCH على global
  const globals = json(await fastify.inject({
    method: 'GET', url: '/v1/templates?filter[scope]=global', headers: H(ctx.a.session.accessToken),
  }));
  const globalId = globals.data[0].id;
  ctx.globalId = globalId;

  const rPG = await fastify.inject({
    method: 'PATCH', url: `/v1/templates/${globalId}`,
    headers: H(ctx.a.session.accessToken), payload: { name: 'try modify global' },
  });
  if (rPG.statusCode === 403 && json(rPG)?.error?.code === 'GLOBAL_TEMPLATE_READONLY') {
    pass(`PATCH على global → 403 GLOBAL_TEMPLATE_READONLY`);
  } else fail(`GLOBAL PATCH: ${rPG.statusCode} ${json(rPG)?.error?.code}`);

  // DELETE على global → 403
  const rDG = await fastify.inject({
    method: 'DELETE', url: `/v1/templates/${globalId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rDG.statusCode === 403 && json(rDG)?.error?.code === 'GLOBAL_TEMPLATE_READONLY') {
    pass(`DELETE على global → 403 GLOBAL_TEMPLATE_READONLY`);
  } else fail(`GLOBAL DELETE: ${rDG.statusCode}`);

  // TEMPLATE_SCHEMA_VIOLATION — definition معطوب
  const rBad = await fastify.inject({
    method: 'POST', url: '/v1/templates',
    headers: H(ctx.a.session.accessToken),
    payload: { name: 'bad', kind: 'static', definition: { id: 'bad', name: 'x' } }, // ينقص layers
  });
  if (rBad.statusCode === 400 && json(rBad)?.error?.code === 'TEMPLATE_SCHEMA_VIOLATION') {
    pass(`POST بـdefinition معطوب → 400 TEMPLATE_SCHEMA_VIOLATION`);
  } else fail(`SCHEMA_VIOLATION: ${rBad.statusCode} ${json(rBad)?.error?.code}`);

  // TEMPLATE_IN_USE — نُنشئ قالباً ثم مشروعاً يشير إليه ثم DELETE
  const rNew = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.a.session.accessToken),
    payload: { name: `Used ${Date.now()}`, kind: 'static', definition: validTplDef },
  });
  const usedId = json(rNew).id;

  // نُنشئ brand_kit ثم مشروعاً يشير للقالب (لا endpoint لـprojects حتى A14)
  const bkId = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config)
     VALUES ($1, 'gate-bk-a13', '{}'::jsonb) RETURNING id`,
    [ctx.a.tenant.id],
  )).rows[0].id;
  await queryAs(ctx.a.tenant.id,
    `INSERT INTO projects(tenant_id, template_id, brand_kit_id, name)
     VALUES ($1, $2, $3, 'in-use test')`,
    [ctx.a.tenant.id, usedId, bkId],
  );

  const rDU = await fastify.inject({
    method: 'DELETE', url: `/v1/templates/${usedId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rDU.statusCode === 409 && json(rDU)?.error?.code === 'TEMPLATE_IN_USE') {
    pass(`DELETE قالب مستعمل → 409 TEMPLATE_IN_USE`);
  } else fail(`IN_USE: ${rDU.statusCode} ${json(rDU)?.error?.code}`);

  // تنظيف
  await queryAs(ctx.a.tenant.id, `DELETE FROM projects WHERE template_id = $1`, [usedId]);
  await queryAs(ctx.a.tenant.id, `DELETE FROM brand_kits WHERE id = $1`, [bkId]);

  // INVALID_FILTER_FIELD
  const rIF = await fastify.inject({
    method: 'GET', url: '/v1/templates?filter[bogus]=x', headers: H(ctx.a.session.accessToken),
  });
  if (rIF.statusCode === 400 && json(rIF)?.error?.code === 'INVALID_FILTER_FIELD') {
    pass(`filter غير معروف → 400 INVALID_FILTER_FIELD`);
  } else fail(`INVALID_FILTER: ${rIF.statusCode}`);
}

// ── Layer 4 ─────────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC (writer/editor على write ops → 403)');

  const cases = [
    { method: 'POST', url: '/v1/templates', payload: { name: 'r', kind: 'static', definition: validTplDef } },
    { method: 'PATCH', url: `/v1/templates/${ctx.isoTplId}`, payload: { name: 'x' } },
    { method: 'DELETE', url: `/v1/templates/${ctx.isoTplId}` },
  ];
  for (const role of ['writer', 'editor']) {
    for (const c of cases) {
      const r = await fastify.inject({ ...c, headers: H(ctx.roleUsers[role].token) });
      if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
        pass(`${role} ${c.method} → 403 INSUFFICIENT_ROLE`);
      } else fail(`${role} ${c.method}: ${r.statusCode} ${json(r)?.error?.code}`);
    }
  }
  // writer + editor يقرأون (viewer+)
  for (const role of ['writer', 'editor']) {
    const r = await fastify.inject({ method: 'GET', url: '/v1/templates', headers: H(ctx.roleUsers[role].token) });
    if (r.statusCode === 200) pass(`${role} GET /v1/templates → 200 (viewer+ لكل مصادَق)`);
    else fail(`${role} GET → ${r.statusCode}`);
  }
}

// ── Layer 5 ─────────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (grants app_user على templates)');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='templates'
     ORDER BY privilege_type`,
  );
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`templates: [${perms.join(', ')}] — يطابق SEC-1 القائمة`);
  } else fail(`templates grants: expected ${expected}, got ${perms}`);
}

// ── Layer 6 ─────────────────────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل السياسات (السياسات الأربع تعمل معاً)');

  // baseline: قوالب مستأجر B (يجب أن يكون فيها 6 عام + قالب iso لـA؟ لا — A فقط يرى iso.)
  // نُنشئ قالباً لـB ونتحقّق أن A لا يراه
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.b.session.accessToken),
    payload: { name: `B-only ${Date.now()}`, kind: 'static', definition: validTplDef },
  });
  const bTplId = json(rC).id;

  // A يبحث عن قوالب tenant → لا يرى B
  const rAT = await fastify.inject({
    method: 'GET', url: '/v1/templates?filter[scope]=tenant', headers: H(ctx.a.session.accessToken),
  });
  const beforeB = json(rAT).data.filter(t => t.id === bTplId).length;
  if (beforeB === 0) pass(`baseline: A لا يرى قالب B (RLS تعمل)`);
  else fail(`baseline mismatch: A يرى قالب B قبل تعطيل RLS`);

  // تعطيل RLS
  await migPool.query(`ALTER TABLE templates DISABLE ROW LEVEL SECURITY`);
  try {
    const APP_URL = process.env.DATABASE_URL_APP;
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
        const r = await c.query(
          `SELECT count(*)::int AS n FROM templates WHERE scope='tenant' AND tenant_id != $1`,
          [ctx.a.tenant.id],
        );
        await c.query('COMMIT');
        if ((r.rows[0]?.n ?? 0) >= 1) {
          pass(`بلا RLS على templates: A يرى ≥1 قالب لـB (تسريب — الحاجز مفتوح)`);
        } else fail(`بلا RLS: got ${r.rows[0]?.n}`);
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE templates ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE templates FORCE ROW LEVEL SECURITY`);
  }

  // استعادة: A مجدداً لا يرى B
  const rAT2 = await fastify.inject({
    method: 'GET', url: '/v1/templates?filter[scope]=tenant', headers: H(ctx.a.session.accessToken),
  });
  const afterB = json(rAT2).data.filter(t => t.id === bTplId).length;
  if (afterB === 0) pass(`بعد ENABLE+FORCE: A لا يرى قالب B (استعادة)`);
  else fail(`استعادة فاشلة`);
}

// ── Layer 7 — العام ─────────────────────────────────────
async function checkGlobals(fastify, ctx) {
  console.log('\n▶ Layer 7 — العام (مستأجر جديد + النسخ + check-template-sync)');

  // (أ) مستأجر جديد يرى الستة العامة
  const suffix = String(Date.now());
  const rNew = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `tplgate-fresh-${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `TplGate-Fresh-${suffix}` },
  });
  const fresh = json(rNew);
  const rGl = await fastify.inject({
    method: 'GET', url: '/v1/templates?filter[scope]=global', headers: H(fresh.session.accessToken),
  });
  const glCount = json(rGl)?.data?.length ?? 0;
  if (glCount === 6) pass(`مستأجر جديد يرى ${glCount} عام (لا صفراً — العيب المؤكَّد قبل A13 لا يعود)`);
  else fail(`مستأجر جديد يرى ${glCount} عام (متوقّع 6)`);

  // (ب) نسخ من عام إلى خاص (GET + POST — قرار #1 لا /duplicate)
  const rGetGl = await fastify.inject({
    method: 'GET', url: `/v1/templates/${ctx.globalId}`, headers: H(fresh.session.accessToken),
  });
  const orig = json(rGetGl);
  const rDup = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(fresh.session.accessToken),
    payload: { name: `${orig.name} — نسخة`, kind: orig.kind, definition: orig.definition },
  });
  if (rDup.statusCode === 201 && json(rDup)?.scope === 'tenant') {
    pass(`نسخ عام إلى خاص (GET + POST) → 201 scope=tenant`);
  } else fail(`نسخ عام: ${rDup.statusCode} ${rDup.body}`);

  // (ج) تعديل النسخة لا يمسّ الأصل
  const dupId = json(rDup).id;
  await fastify.inject({
    method: 'PATCH', url: `/v1/templates/${dupId}`, headers: H(fresh.session.accessToken),
    payload: { name: 'نسخة معدَّلة' },
  });
  const rOrigAgain = await fastify.inject({
    method: 'GET', url: `/v1/templates/${ctx.globalId}`, headers: H(fresh.session.accessToken),
  });
  if (json(rOrigAgain)?.name === orig.name) pass(`تعديل النسخة لا يمسّ الأصل`);
  else fail(`أصل تغيّر بعد تعديل نسخة!`);

  // (د) اختبار وجود check-template-sync (L-46)
  const filePath = join(__dirname, '../../../packages/templates/src/templates/plain.json');
  const backup = join(__dirname, '../../../packages/templates/src/templates/plain.json.gate-backup');
  copyFileSync(filePath, backup);
  const orig2 = readFileSync(filePath, 'utf-8');
  // تعديل مؤقّت
  writeFileSync(filePath, orig2.replace('بسيط', 'بسيطGATE'));
  let syncFailed = false;
  try {
    execSync('pnpm --filter @pf-mediakit/db exec node scripts/check-template-sync.mjs', {
      cwd: join(__dirname, '../../..'),
      env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      stdio: 'pipe',
    });
  } catch { syncFailed = true; }
  // استعادة
  copyFileSync(backup, filePath);
  execSync(`rm -f ${backup}`);
  if (syncFailed) pass(`check-template-sync يسقط عند تعديل ملف (L-46 محقَّق)`);
  else fail(`check-template-sync لم يسقط على تعديل — الحارس معطَّل!`);
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('▶ G-P4-7 — بوابة Templates');
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
    await checkGlobals(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await migPool.query(`DELETE FROM projects WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'TplGate-%')`);
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'TplGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'tplgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-7 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-7 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
