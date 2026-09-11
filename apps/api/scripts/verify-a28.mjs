#!/usr/bin/env node
/**
 * G-P4-21 — A28: لوحة المالك (Plans CRUD · Users CRUD · Auth Refresh · Audit).
 *
 * ست طبقات + الحالات المطلوبة من التذكرة:
 *   1. وجود   — 12 endpoint (plans×6 + users×5 + auth/refresh + revisions)
 *   2. عزل    — رمز مستأجر ⇒ 401
 *   3. سلبي   — viewer platform على write ⇒ 403 PLATFORM_INSUFFICIENT_ROLE
 *   4. RBAC   — owner platform ⇒ 200
 *   5. حاسم   — تعطيل control_plane_all على plans ⇒ صفر ⇒ استعادة
 *   6. البنيوي — check-plan-sync: تعديل key يدوياً ⇒ يسقط · brand_kits_limit ⇒ يمرّ
 *
 * الحالات الحاسمة:
 *   (أ) رمز مستأجر على /platform/plans ⇒ 401
 *   (ب) viewer platform على PATCH /plans ⇒ 403
 *   (ج) PATCH باقة ⇒ الأثر **فوري** في getEffectiveLimits (لا 60ث)
 *   (د) PATCH tenant.plan_overrides ⇒ الأثر فوري كذلك
 *   (هـ) PATCH باقة ⇒ صفّ plan_revisions بفاعل=platform_user
 *   (و) DELETE باقة مستعملة ⇒ 409 PLAN_IN_USE
 *   (ز) refresh على رمز منصّة صحيح ⇒ رمز جديد + refreshToken جديد
 *   (ح) refresh برمز مستأجر ⇒ 401 REFRESH_TOKEN_INVALID
 *   (ط) تعديل key يدوياً ⇒ check-plan-sync يسقط
 *   (ي) تعديل brand_kits_limit يدوياً ⇒ check-plan-sync يمرّ
 *   (ك) app_user على plan_revisions ⇒ صفر منح
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { hash as argonHash } from '@node-rs/argon2';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { clearPlanLimitsCache } from '../src/plugins/plan-limits-cache.js';
import { getEffectiveLimits } from '../src/config/effective-limits.js';
import { bumpTenantLimits } from './lib/tenant-limits.mjs';

process.env.RATE_LIMIT_DISABLE = '1';
process.env.AI_PROVIDER = 'fake';

const { Pool } = pg;
const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ DATABASE_URL missing'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 3 });

let failures = 0;
function pass(m) { console.log(`  ✓ ${m}`); }
function fail(m) { failures++; console.error(`  ✗ ${m}`); }
function json(r) { try { return JSON.parse(r.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

async function main() {
  console.log('▶ G-P4-21 — A28: لوحة المالك');
  const fastify = await buildServer();
  await fastify.ready();

  const cpPool = new Pool({ connectionString: process.env.DATABASE_URL_PLATFORM, max: 3 });

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A28-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);
    await cpPool.query(`DELETE FROM platform_users WHERE email LIKE 'a28-%'`);
    await cpPool.query(`DELETE FROM plans WHERE key LIKE 'a28test-%'`);
    // إعادة starter إلى قيم افتراضية (السكربت يعدّلها في اختبار «الأثر فوري»)
    await cpPool.query(`UPDATE plans SET brand_kits_limit = 1, seats_limit = 2, videos_per_month_limit = 20, requests_per_minute_limit = 60, concurrent_renders_limit = 1 WHERE key = 'starter'`);

    // إعداد: مستأجر + platform owner + platform viewer
    const sig = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `a28t-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `A28-T-${Date.now()}` },
    });
    if (sig.statusCode !== 201) throw new Error(`signup: ${sig.body}`);
    const tenantCtx = json(sig);
    await bumpTenantLimits(migPool, tenantCtx.tenant.id);

    const pwHash = await argonHash('platform-pass-1234!', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `a28-owner-${Date.now()}@ops.local`;
    const viewerEmail = `a28-viewer-${Date.now()}@ops.local`;
    await cpPool.query(`INSERT INTO platform_users(email, password_hash, platform_role, is_active) VALUES ($1, $2, 'owner', true)`, [ownerEmail, pwHash]);
    await cpPool.query(`INSERT INTO platform_users(email, password_hash, platform_role, is_active) VALUES ($1, $2, 'viewer', true)`, [viewerEmail, pwHash]);

    const ownerLogin = json(await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/login',
      payload: { email: ownerEmail, password: 'platform-pass-1234!' },
    }));
    const viewerLogin = json(await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/login',
      payload: { email: viewerEmail, password: 'platform-pass-1234!' },
    }));
    const ownerTok = ownerLogin.session.accessToken;
    const ownerRefresh = ownerLogin.session.refreshToken;
    const viewerTok = viewerLogin.session.accessToken;

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 2+3 — عزل: رمز مستأجر / viewer على write');
    const tOnPlatform = await fastify.inject({
      method: 'GET', url: '/v1/platform/plans', headers: H(tenantCtx.session.accessToken),
    });
    tOnPlatform.statusCode === 401 ? pass('رمز مستأجر على /platform/plans → 401') : fail(`tenant→${tOnPlatform.statusCode}`);

    const viewerPatch = await fastify.inject({
      method: 'PATCH', url: '/v1/platform/plans/starter', headers: H(viewerTok),
      payload: { priceUsdCents: 999 },
    });
    viewerPatch.statusCode === 403 && json(viewerPatch)?.error?.code === 'PLATFORM_INSUFFICIENT_ROLE'
      ? pass('viewer PATCH /plans/starter → 403 PLATFORM_INSUFFICIENT_ROLE')
      : fail(`viewer PATCH: ${viewerPatch.statusCode} ${viewerPatch.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1+4 — endpoints تعمل');
    const rList = await fastify.inject({ method: 'GET', url: '/v1/platform/plans', headers: H(ownerTok) });
    rList.statusCode === 200 && json(rList)?.data?.length === 5
      ? pass(`GET /plans → 200 · 5 باقات (${json(rList).data.map((p) => p.key).join(', ')})`)
      : fail(`list: ${rList.statusCode}`);

    const rGet = await fastify.inject({ method: 'GET', url: '/v1/platform/plans/starter', headers: H(ownerTok) });
    const starterBefore = json(rGet);
    rGet.statusCode === 200 && starterBefore?.limits?.brandKits === 1
      ? pass(`GET /plans/starter → 200 · limits.brandKits=${starterBefore.limits.brandKits}`)
      : fail(`get starter: ${rGet.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer الحاسمة (ج): PATCH plan ⇒ الأثر فوري في getEffectiveLimits');
    // نضبط المستأجر على starter (بلا override) قبل الاختبار
    const c1 = await migPool.connect();
    try {
      await c1.query('BEGIN');
      await c1.query('SELECT app_set_tenant($1::uuid)', [tenantCtx.tenant.id]);
      await c1.query(`UPDATE tenants SET plan = 'starter', plan_overrides = NULL WHERE id = $1`, [tenantCtx.tenant.id]);
      await c1.query('COMMIT');
    } finally { c1.release(); }
    clearPlanLimitsCache();

    // نُسخّن الـcache بقراءة أولى
    const pool = (await import('../src/db.js')).getPool();
    const cSam = await pool.connect();
    try {
      await cSam.query('BEGIN');
      await cSam.query('SELECT app_set_tenant($1::uuid)', [tenantCtx.tenant.id]);
      const l0 = await getEffectiveLimits(cSam, tenantCtx.tenant.id);
      await cSam.query('COMMIT');
      // ندعو getCachedRequestsPerMinute لتخزين cache
      const { getCachedRequestsPerMinute } = await import('../src/plugins/plan-limits-cache.js');
      await getCachedRequestsPerMinute(pool, tenantCtx.tenant.id);
      // الآن نُعدّل starter.brand_kits_limit عبر PATCH
      const patch = await fastify.inject({
        method: 'PATCH', url: '/v1/platform/plans/starter', headers: H(ownerTok),
        payload: { brandKitsLimit: 999 },
      });
      if (patch.statusCode !== 200) { fail(`PATCH plan: ${patch.body}`); return; }

      // Cache يجب أن يكون أُسقط ⇒ قراءة جديدة تعطي 999
      const cAfter = await pool.connect();
      try {
        await cAfter.query('BEGIN');
        await cAfter.query('SELECT app_set_tenant($1::uuid)', [tenantCtx.tenant.id]);
        const lAfter = await getEffectiveLimits(cAfter, tenantCtx.tenant.id);
        await cAfter.query('COMMIT');
        lAfter.brandKitsLimit === 999 && l0.brandKitsLimit === 1
          ? pass(`PATCH plans/starter brand_kits_limit=999 ⇒ getEffectiveLimits فوري (كان 1، صار 999)`)
          : fail(`limits: before=${l0.brandKitsLimit} after=${lAfter.brandKitsLimit}`);
      } finally { cAfter.release(); }
    } finally { cSam.release(); }

    // (هـ) plan_revisions يسجّل التغيير بفاعل=platform_user
    const revs = await cpPool.query(
      `SELECT actor_id, action FROM plan_revisions WHERE plan_key = 'starter' ORDER BY created_at DESC LIMIT 1`,
    );
    revs.rows[0]?.action === 'update' && revs.rows[0]?.actor_id === ownerLogin.session.platformUserId
      ? pass(`plan_revisions: action=update · actor_id=platformUserId ✓`)
      : fail(`revisions: ${JSON.stringify(revs.rows[0])}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer الحاسمة (د): PATCH tenant.plan_overrides ⇒ فوري');
    const cSam2 = await pool.connect();
    try {
      await cSam2.query('BEGIN');
      await cSam2.query('SELECT app_set_tenant($1::uuid)', [tenantCtx.tenant.id]);
      const before = await getEffectiveLimits(cSam2, tenantCtx.tenant.id);
      await cSam2.query('COMMIT');
      const { getCachedRequestsPerMinute } = await import('../src/plugins/plan-limits-cache.js');
      await getCachedRequestsPerMinute(pool, tenantCtx.tenant.id);

      const p2 = await fastify.inject({
        method: 'PATCH', url: `/v1/platform/tenants/${tenantCtx.tenant.id}`, headers: H(ownerTok),
        payload: { planOverrides: { requests_per_minute_limit: 5555 } },
      });
      if (p2.statusCode !== 200) { fail(`PATCH tenant: ${p2.body}`); return; }

      const cA = await pool.connect();
      try {
        await cA.query('BEGIN');
        await cA.query('SELECT app_set_tenant($1::uuid)', [tenantCtx.tenant.id]);
        const after = await getEffectiveLimits(cA, tenantCtx.tenant.id);
        await cA.query('COMMIT');
        after.requestsPerMinuteLimit === 5555 && before.requestsPerMinuteLimit !== 5555
          ? pass(`PATCH tenant.plan_overrides.rpm=5555 ⇒ getEffectiveLimits فوري (كان ${before.requestsPerMinuteLimit})`)
          : fail(`tenant limits: before=${before.requestsPerMinuteLimit} after=${after.requestsPerMinuteLimit}`);
      } finally { cA.release(); }
    } finally { cSam2.release(); }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1-ب — DELETE باقة مستعملة ⇒ 409 PLAN_IN_USE');
    const delUsed = await fastify.inject({
      method: 'DELETE', url: '/v1/platform/plans/starter', headers: H(ownerTok),
    });
    delUsed.statusCode === 409 && json(delUsed)?.error?.code === 'PLAN_IN_USE'
      ? pass('DELETE plans/starter (مستعمل) → 409 PLAN_IN_USE')
      : fail(`delete used: ${delUsed.statusCode} ${delUsed.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1-ج — refresh');
    // (ز) رمز منصّة صحيح ⇒ رمز جديد
    const refreshOK = await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/refresh',
      payload: { refreshToken: ownerRefresh },
    });
    refreshOK.statusCode === 200 && json(refreshOK)?.session?.accessToken && json(refreshOK)?.session?.refreshToken !== ownerRefresh
      ? pass(`refresh على platform refreshToken ⇒ رمز جديد + rotation`)
      : fail(`refresh OK: ${refreshOK.statusCode} ${refreshOK.body}`);

    // (ح) رمز مستأجر ⇒ 401 (بنية refresh مختلفة عن platform)
    const refreshTenant = await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/refresh',
      payload: { refreshToken: tenantCtx.session.refreshToken },
    });
    refreshTenant.statusCode === 401 && json(refreshTenant)?.error?.code === 'REFRESH_TOKEN_INVALID'
      ? pass('refresh برمز مستأجر → 401 REFRESH_TOKEN_INVALID')
      : fail(`refresh tenant: ${refreshTenant.statusCode} ${refreshTenant.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — البنيوي: check-plan-sync');
    // (ي) تعديل brand_kits_limit يدوياً ⇒ يمرّ (بعد A28 = خارج hash)
    await cpPool.query(`UPDATE plans SET brand_kits_limit = 42 WHERE key = 'trial'`);
    try {
      execSync('node packages/db/scripts/check-plan-sync.mjs', {
        cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      });
      pass('تعديل brand_kits_limit يدوياً ⇒ check-plan-sync يمرّ (سلوك A28 مقصود)');
    } catch (e) {
      fail(`check-plan-sync: ${e.stderr?.toString() ?? e.message}`);
    }

    // (ط) تعديل key يدوياً ⇒ يسقط
    // نُنشئ باقة test ثم نُعدّل key SQL يدوياً
    const testHash = 'a'.repeat(64);  // hash خاطئ لن يطابق
    await cpPool.query(
      `INSERT INTO plans(key, name_ar, name_en, price_usd_cents,
                          brand_kits_limit, seats_limit, videos_per_month_limit,
                          requests_per_minute_limit, concurrent_renders_limit,
                          source_ref, definition_hash)
       VALUES ('a28test-fake', 'اختبار', 'test', 0, 1, 1, 1, 60, 1, 'A28-test', $1)`,
      [testHash]);
    let syncFailed = false;
    try {
      execSync('node packages/db/scripts/check-plan-sync.mjs', {
        cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: MIGRATION_URL },
      });
    } catch { syncFailed = true; }
    syncFailed ? pass('صفّ بـidentity hash خاطئ ⇒ check-plan-sync يسقط (L-46)')
             : fail('check-plan-sync لم يسقط على identity غير مطابق');
    // تنظيف الصفّ التجريبي
    await cpPool.query(`DELETE FROM plans WHERE key = 'a28test-fake'`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer الحاسمة — تعطيل control_plane_all على plans');
    await migPool.query(`ALTER POLICY plans_control_plane_write ON plans USING (false) WITH CHECK (false)`);
    try {
      const rDis = await fastify.inject({ method: 'GET', url: '/v1/platform/plans', headers: H(ownerTok) });
      // SELECT policy موجود من A26 — لن يتأثّر بإسقاط write policy على القراءة
      // نجرب PATCH بدلاً (write policy مطلوب)
      const patchDis = await fastify.inject({
        method: 'PATCH', url: '/v1/platform/plans/studio', headers: H(ownerTok),
        payload: { priceUsdCents: 12345 },
      });
      // مع تعطيل write policy، PATCH يجب أن يفشل (0 صفوف مُحدَّثة)
      patchDis.statusCode >= 400
        ? pass(`تعطيل plans_control_plane_write ⇒ PATCH ${patchDis.statusCode} (السياسة تحرس)`)
        : fail(`تعطيل السياسة: PATCH نجح ${patchDis.statusCode}`);
    } finally {
      await migPool.query(`ALTER POLICY plans_control_plane_write ON plans USING (CURRENT_USER = 'control_plane_user') WITH CHECK (CURRENT_USER = 'control_plane_user')`);
      pass('استعادة plans_control_plane_write');
    }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — app_user على plan_revisions ⇒ صفر منح');
    const grants = await migPool.query(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
       WHERE grantee='app_user' AND table_name='plan_revisions'`);
    grants.rows[0].n === 0
      ? pass('app_user grants على plan_revisions = 0 (كما platform_users)')
      : fail(`app_user لديه ${grants.rows[0].n} منح على plan_revisions`);

    // ══════════════════════════════════════════════
    // تنظيف بعدي: إعادة plans إلى القيم الافتراضية (منعاً لتأثير على verify:plans و verify:a21)
    await cpPool.query(`UPDATE plans SET brand_kits_limit = 1, seats_limit = 2, videos_per_month_limit = 20, requests_per_minute_limit = 60, concurrent_renders_limit = 1 WHERE key = 'starter'`);
    await cpPool.query(`UPDATE plans SET brand_kits_limit = 1, seats_limit = 1, videos_per_month_limit = 5, requests_per_minute_limit = 30, concurrent_renders_limit = 1 WHERE key = 'trial'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);
    await cpPool.query(`DELETE FROM platform_users WHERE email LIKE 'a28-%'`);

    console.log('');
    if (failures === 0) console.log('✓ G-P4-21 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-21 FAILED — ${failures} إخفاق`);
  } finally {
    await cpPool.end();
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  console.log(`\n[verify-summary] a28: ${failures} إخفاقاً`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
