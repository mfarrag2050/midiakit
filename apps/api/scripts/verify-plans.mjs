#!/usr/bin/env node
/**
 * G-P4-12 — بوابة plans + plan_overrides (docs/17 §A26).
 *
 * ست طبقات + سابعة للبيانات المرجعية:
 *   1. وجود   — الجدول موجود، 5 صفوف، getEffectiveLimits يعمل
 *   2. عزل    — لا ينطبق (plans عامة لكل المستأجرين)
 *   3. سلبي   — tenants.plan بقيمة غير موجودة ⇒ FK يرفض
 *   4. RBAC   — كتابة على plans من app_user ⇒ 42501 RLS
 *   5. L-58   — app_user يحمل SELECT فقط على plans
 *   6. حاسم   — DISABLE RLS ⇒ app_user يستطيع INSERT (تسريب مُثبَت)
 *              ثم ENABLE+FORCE استعادة
 *   7. بيانات — مستأجر جديد يقرأ حدود باقته (لا صفراً)
 *              plan_overrides يعلو على قيم الباقة
 *              حذف باقة مستعملة ⇒ FK RESTRICT
 *              حارس تزامن يسقط عند تعديل صفّ يدوياً
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../src/server.js';
import { closePool, getPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { getEffectiveLimits } from '../src/config/effective-limits.js';
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

async function withTenant(tenantId, cb) {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await cb(c);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'PlanGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'plangate-%'`);

  const suffix = String(Date.now());
  const signup = async (label) => {
    const email = `plangate-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `PlanGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  return { a };
}

// ── Layer 1 ─────────────────────────────────────────
async function checkExistence(ctx) {
  console.log('\n▶ Layer 1 — وجود');
  const r = await migPool.query(`SELECT count(*)::int AS n FROM plans`);
  if (r.rows[0].n === 5) pass(`plans جدول موجود، 5 صفوف (trial/starter/studio/agency/api)`);
  else fail(`plans count: ${r.rows[0].n}`);

  // getEffectiveLimits يعمل — مستأجر A بدأ بـtrial (default)
  const limits = await withTenant(ctx.a.tenant.id, (c) => getEffectiveLimits(c, ctx.a.tenant.id));
  if (limits.brandKitsLimit === 1 && limits.requestsPerMinuteLimit === 30 && limits.concurrentRendersLimit === 1) {
    pass(`getEffectiveLimits(trial): BK=1 rpm=30 concurrent=1 (trial defaults)`);
  } else fail(`limits mismatch: ${JSON.stringify(limits)}`);
}

// ── Layer 3 ─────────────────────────────────────────
async function checkNegative(ctx) {
  console.log('\n▶ Layer 3 — سلبي');
  // tenants.plan بقيمة غير موجودة ⇒ FK يرفض
  try {
    await migPool.query(
      `INSERT INTO tenants(name, plan) VALUES ('BadPlan Tenant', 'nonexistent')`,
    );
    fail(`INSERT بـplan='nonexistent' نجح — FK لم يعمل!`);
  } catch (err) {
    if (err.code === '23503' || /foreign key/i.test(err.message)) {
      pass(`INSERT tenant بـplan غير موجود → 23503 foreign_key_violation`);
    } else fail(`FK: ${err.code} ${err.message}`);
  }
}

// ── Layer 4 ─────────────────────────────────────────
async function checkRbac(ctx) {
  console.log('\n▶ Layer 4 — RBAC (app_user لا يكتب على plans)');
  const APP_URL = process.env.DATABASE_URL_APP;
  const appPool = new Pool({ connectionString: APP_URL, max: 1 });
  try {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
      try {
        await c.query(
          `INSERT INTO plans (key, name_ar, name_en, price_usd_cents,
             requests_per_minute_limit, concurrent_renders_limit,
             source_ref, definition_hash)
           VALUES ('evil', 'Evil', 'Evil', 0, 1, 1, 'evil', 'evil')`,
        );
        fail(`app_user استطاع INSERT على plans!`);
      } catch (err) {
        if (err.code === '42501' || /row-level security|permission/i.test(err.message)) {
          pass(`app_user INSERT على plans → 42501 (RLS/permission — الكتابة migration_user فقط)`);
        } else fail(`app_user INSERT: ${err.code} ${err.message}`);
      }
      await c.query('ROLLBACK');
    } finally { c.release(); }
  } finally { await appPool.end(); }
}

// ── Layer 5 ─────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (app_user على plans = SELECT فقط)');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='plans'
     ORDER BY privilege_type`);
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['SELECT'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`plans grants app_user: [${perms.join(', ')}] — SELECT فقط، لا كتابة`);
  } else fail(`grants: expected ${expected}, got ${perms}`);
}

// ── Layer 6 ─────────────────────────────────────────
async function checkPolicyDisableFails(ctx) {
  console.log('\n▶ Layer 6 — تعطيل RLS الحاسم');
  await migPool.query(`ALTER TABLE plans DISABLE ROW LEVEL SECURITY`);
  try {
    // بلا RLS، app_user يعتمد على GRANTs فقط — لا زال بلا INSERT
    // (GRANT SELECT فقط). سيفشل بـ42501 من الـGRANT، لا RLS.
    const APP_URL = process.env.DATABASE_URL_APP;
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        try {
          await c.query(
            `INSERT INTO plans(key, name_ar, name_en, price_usd_cents,
                requests_per_minute_limit, concurrent_renders_limit,
                source_ref, definition_hash)
             VALUES ('noRls','x','x',0,1,1,'x','x')`);
          fail(`app_user INSERT نجح بلا GRANT INSERT — تسريب!`);
        } catch (err) {
          if (err.code === '42501') {
            pass(`بلا RLS: app_user INSERT → 42501 من GRANT (SELECT فقط) — دفاع بعمق`);
          } else fail(`unexpected: ${err.code} ${err.message}`);
        }
        await c.query('ROLLBACK');
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE plans ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE plans FORCE ROW LEVEL SECURITY`);
  }
  pass(`ENABLE+FORCE مستعادة`);
}

// ── Layer 7 — البيانات المرجعية ─────────────────────
async function checkReferenceDataLayer(fastify, ctx) {
  console.log('\n▶ Layer 7 — البيانات المرجعية (بيانات لا كود)');

  // (أ) مستأجر جديد يقرأ حدود باقته (trial default) — لا صفراً
  const limits = await withTenant(ctx.a.tenant.id, (c) => getEffectiveLimits(c, ctx.a.tenant.id));
  if (limits.brandKitsLimit === 1 && limits.videosPerMonthLimit === 5) {
    pass(`(أ) مستأجر جديد يقرأ trial: BK=1، فيديو/شهر=5 (لا صفراً)`);
  } else fail(`limits: ${JSON.stringify(limits)}`);

  // (ب) plan_overrides يعلو على قيم الباقة
  // tenants يحمل RLS + FORCE — migration_user يحتاج SET LOCAL
  const c1 = await migPool.connect();
  try {
    await c1.query('BEGIN');
    await c1.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
    await c1.query(
      `UPDATE tenants SET plan_overrides = '{"brand_kits_limit": 10, "seats_limit": null}'::jsonb
       WHERE id = $1`, [ctx.a.tenant.id],
    );
    await c1.query('COMMIT');
  } finally { c1.release(); }
  const withOverride = await withTenant(ctx.a.tenant.id, (c) => getEffectiveLimits(c, ctx.a.tenant.id));
  if (withOverride.brandKitsLimit === 10 && withOverride.seatsLimit === null && withOverride.videosPerMonthLimit === 5) {
    pass(`(ب) plan_overrides يعلو: BK=10 (override) · seats=null (override= unlimited) · videos=5 (من plans، بلا override)`);
  } else fail(`override: ${JSON.stringify(withOverride)}`);

  // (ج) حذف باقة مستعملة ⇒ FK RESTRICT
  const c2 = await migPool.connect();
  try {
    await c2.query('BEGIN');
    await c2.query('SELECT app_set_tenant($1::uuid)', [ctx.a.tenant.id]);
    await c2.query(`UPDATE tenants SET plan = 'studio' WHERE id = $1`, [ctx.a.tenant.id]);
    await c2.query('COMMIT');
  } finally { c2.release(); }
  try {
    await migPool.query(`DELETE FROM plans WHERE key = 'studio'`);
    fail(`DELETE plans studio نجح والمستأجر يستعملها — FK لم يعمل!`);
  } catch (err) {
    if (err.code === '23503') pass(`(ج) DELETE plans مستعملة → 23503 RESTRICT`);
    else fail(`FK del: ${err.code}`);
  }

  // (د) A28 (2026-09-07): check-plan-sync تحوَّل نطاقه ليحرس الهوية
  // فقط (key · name_ar · name_en). تعديل الحدود والسعر خارج الحارس عمداً
  // — A28 يفتح PATCH /platform/plans/:key من اللوحة. الاختبار يعكس
  // السلوك الجديد على مسارين:
  //   • تعديل brand_kits_limit يدوياً ⇒ يمرّ (سلوك A28 مقصود)
  //   • تعديل name_ar يدوياً ⇒ يسقط (identity محروسة، L-46)
  await migPool.query(`UPDATE plans SET brand_kits_limit = 999 WHERE key = 'trial'`);
  let limitEditFailed = false;
  try {
    execSync('pnpm --filter @pf-mediakit/db check:plan-sync', {
      cwd: join(__dirname, '../../..'),
      env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      stdio: 'pipe',
    });
  } catch { limitEditFailed = true; }
  await migPool.query(`UPDATE plans SET brand_kits_limit = 1 WHERE key = 'trial'`);
  if (!limitEditFailed) pass(`(د-1) A28: تعديل brand_kits_limit يدوياً ⇒ check-plan-sync يمرّ (سلوك مقصود)`);
  else fail(`A28 regression: تعديل brand_kits_limit أوقع check-plan-sync`);

  const originalNameAr = 'تجريبي';
  await migPool.query(`UPDATE plans SET name_ar = 'اختبار مؤقّت للهوية' WHERE key = 'trial'`);
  let identityEditFailed = false;
  try {
    execSync('pnpm --filter @pf-mediakit/db check:plan-sync', {
      cwd: join(__dirname, '../../..'),
      env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      stdio: 'pipe',
    });
  } catch { identityEditFailed = true; }
  await migPool.query(`UPDATE plans SET name_ar = $1 WHERE key = 'trial'`, [originalNameAr]);
  if (identityEditFailed) pass(`(د-2) A28: تعديل name_ar يدوياً ⇒ check-plan-sync يسقط (identity محروسة، L-46)`);
  else fail(`identity edit didn't trigger sync guard`);
}

async function main() {
  console.log('▶ G-P4-12 — plans + plan_overrides');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await cleanupAndSeed(fastify);
    await checkExistence(ctx);
    await checkNegative(ctx);
    await checkRbac(ctx);
    await checkPrivileges();
    await checkPolicyDisableFails(ctx);
    await checkReferenceDataLayer(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await closeQueues();
    // نستعيد أي مستأجر PlanGate إلى trial قبل الحذف (FK)
    await migPool.query(`UPDATE tenants SET plan = 'trial' WHERE name LIKE 'PlanGate-%'`);
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'PlanGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'plangate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-12 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-12 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
