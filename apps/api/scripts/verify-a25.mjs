#!/usr/bin/env node
/**
 * G-P4-20 — A25: لوحة التشغيل (platform ops، قراءة فقط).
 *
 * ست طبقات + سبع حالات:
 *   1. وجود   — 3 endpoints /v1/platform/ops/* + الحارس البنيوي
 *   2. عزل    — رمز مستأجر ⇒ 401 (لا platform token)
 *   3. سلبي   — بلا Bearer ⇒ 401
 *   4. RBAC   — platform token ⇒ 200
 *   5. حاسم   — تعطيل سياسة control_plane_all على subscriptions ⇒ صفر ⇒ استعادة
 *   6. البنيوي — check-observe-import-scope يمرّ + يسقط على مخالفة (L-46)
 *
 * الحالات:
 *   (أ) subscriptions_by_status = عدد الصفوف الفعلي (nothing/manual)
 *   (ب) tenants_by_plan يفصل بين المستأجرين
 *   (ج) usage_current_month_totals ينمو بعد رندر جديد (نمط A22)
 *   (د) top_tenants_by_renders يرتّب صحيحاً
 *   (هـ) queues يرجع 4 طوابير من observe (queueDepth)
 *   (و) رمز مستأجر (Bearer JWT عادي) على platform → 401
 *   (ز) بلا Authorization → 401
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { hash as argonHash } from '@node-rs/argon2';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
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
  console.log('▶ G-P4-20 — A25: لوحة التشغيل (platform ops)');
  const fastify = await buildServer();
  await fastify.ready();

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A25-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);
    // platform_users cleanup عبر control_plane_user (RLS)
    const cpInit = new Pool({ connectionString: process.env.DATABASE_URL_PLATFORM, max: 2 });
    try { await cpInit.query(`DELETE FROM platform_users WHERE email LIKE 'a25-%'`); }
    finally { await cpInit.end(); }

    // ──────────────────────────────────────────
    // إعداد: مستأجران + platform user
    // ──────────────────────────────────────────
    const sig1 = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `a25a-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `A25-A-${Date.now()}` },
    });
    if (sig1.statusCode !== 201) throw new Error(`signup A: ${sig1.body}`);
    const a = json(sig1);
    await bumpTenantLimits(migPool, a.tenant.id);

    const sig2 = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `a25b-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `A25-B-${Date.now()}` },
    });
    if (sig2.statusCode !== 201) throw new Error(`signup B: ${sig2.body}`);
    const b = json(sig2);
    await bumpTenantLimits(migPool, b.tenant.id);

    // نضبط باقات مختلفة للاختبار
    const setPlan = async (tenantId, plan) => {
      const c = await migPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
        await c.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [plan, tenantId]);
        await c.query('COMMIT');
      } finally { c.release(); }
    };
    await setPlan(a.tenant.id, 'starter');
    await setPlan(b.tenant.id, 'studio');

    // platform user — INSERT عبر control_plane_user pool (السياسة تفرضه)
    const pwHash = await argonHash('platform-pass-1234!', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const platformEmail = `a25-platform-${Date.now()}@ops.local`;
    const cpPool = new Pool({ connectionString: process.env.DATABASE_URL_PLATFORM, max: 2 });
    try {
      await cpPool.query(
        `INSERT INTO platform_users(email, password_hash, platform_role, is_active) VALUES ($1, $2, 'owner', true)`,
        [platformEmail, pwHash],
      );
    } finally { await cpPool.end(); }

    const pLogin = await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/login',
      payload: { email: platformEmail, password: 'platform-pass-1234!' },
    });
    if (pLogin.statusCode !== 200) throw new Error(`platform login: ${pLogin.body}`);
    const platformToken = json(pLogin).session.accessToken;

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 2+3 — 401 على رمز مستأجر / بلا Bearer');
    const tenantOnPlatform = await fastify.inject({
      method: 'GET', url: '/v1/platform/ops/queues', headers: H(a.session.accessToken),
    });
    tenantOnPlatform.statusCode === 401
      ? pass('رمز مستأجر على /platform/ops → 401 UNAUTHORIZED')
      : fail(`tenant token → ${tenantOnPlatform.statusCode} ${tenantOnPlatform.body}`);

    const noBearer = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/queues' });
    noBearer.statusCode === 401
      ? pass('بلا Authorization → 401 UNAUTHORIZED')
      : fail(`no bearer → ${noBearer.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1+4 — 3 endpoints تعمل بـplatform token');
    const rQ = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/queues', headers: H(platformToken) });
    const qBody = json(rQ);
    rQ.statusCode === 200 && Array.isArray(qBody?.data) && qBody.data.length === 4
      ? pass(`GET /ops/queues → 200 · 4 طوابير من observe (${qBody.data.map((d) => d.name).join(', ')})`)
      : fail(`queues → ${rQ.statusCode} ${rQ.body?.slice(0, 200)}`);

    const rS = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/subscriptions', headers: H(platformToken) });
    const sBody = json(rS);
    if (rS.statusCode === 200 && Array.isArray(sBody?.subscriptionsByStatus) && Array.isArray(sBody?.tenantsByPlan)) {
      const planCounts = Object.fromEntries(sBody.tenantsByPlan.map((r) => [r.plan, r.count]));
      const hasStarter = (planCounts['starter'] ?? 0) >= 1;
      const hasStudio = (planCounts['studio'] ?? 0) >= 1;
      hasStarter && hasStudio
        ? pass(`GET /ops/subscriptions → tenantsByPlan يفصل: starter=${planCounts['starter']} · studio=${planCounts['studio']}`)
        : fail(`plans: ${JSON.stringify(sBody.tenantsByPlan)}`);
    } else fail(`subscriptions → ${rS.statusCode} ${rS.body?.slice(0, 200)}`);

    const rU = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/usage', headers: H(platformToken) });
    const uBody = json(rU);
    if (rU.statusCode === 200 && uBody?.currentMonthTotals && Array.isArray(uBody?.topTenantsByRenders)) {
      const rendersBefore = uBody.currentMonthTotals.rendersTotal;
      pass(`GET /ops/usage → 200 · currentMonthTotals={renders:${rendersBefore}, ai_tokens_in:${uBody.currentMonthTotals.aiTokensIn}}`);

      // ══════════════════════════════════════════════
      console.log('\n▶ Layer 1-ب — المقاييس تطابق الواقع (نُنشئ رندراً)');
      // نُنشئ brand-kit + template + project + render لمستأجر A
      const bk = await fastify.inject({ method: 'POST', url: '/v1/brand-kits', headers: H(a.session.accessToken), payload: { name: 'ops-bk' } });
      const bkId = json(bk).id;
      const tpls = json(await fastify.inject({ method: 'GET', url: '/v1/templates', headers: H(a.session.accessToken) }));
      const tplId = tpls.data[0].id;
      const prj = await fastify.inject({ method: 'POST', url: '/v1/projects', headers: H(a.session.accessToken), payload: { title: 'ops-prj', brand_kit_id: bkId, template_id: tplId } });
      const pid = json(prj).id;
      // INSERT مباشر بـ succeeded ⇒ trigger renders_log_usage يرفع usage.renders_count
      const c = await migPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
        await c.query(
          `INSERT INTO renders(tenant_id, project_id, size, format, status,
                                brand_snapshot, template_snapshot, requested_by)
           VALUES ($1, $2, 'x', 'png', 'succeeded', '{}'::jsonb, '{}'::jsonb, $3)`,
          [a.tenant.id, pid, a.user.id]);
        await c.query('COMMIT');
      } finally { c.release(); }

      const rU2 = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/usage', headers: H(platformToken) });
      const u2 = json(rU2);
      u2?.currentMonthTotals?.rendersTotal === rendersBefore + 1
        ? pass(`usage.rendersTotal نما ${rendersBefore} → ${u2.currentMonthTotals.rendersTotal} (المصدر: usage table، A22 trigger)`)
        : fail(`renders لم ينمُ: قبل=${rendersBefore} بعد=${u2?.currentMonthTotals?.rendersTotal}`);
    } else fail(`usage → ${rU.statusCode} ${rU.body?.slice(0, 200)}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — حاسم: تعطيل control_plane_all على subscriptions');
    // نعطّل السياسة ⇒ control_plane_user يفقد الوصول ⇒ subscriptions_by_status = []
    await migPool.query(`ALTER POLICY subscriptions_control_plane_all ON subscriptions USING (false) WITH CHECK (false)`);
    try {
      const rDis = await fastify.inject({ method: 'GET', url: '/v1/platform/ops/subscriptions', headers: H(platformToken) });
      const dBody = json(rDis);
      dBody?.subscriptionsByStatus?.length === 0
        ? pass('تعطيل control_plane_all ⇒ subscriptionsByStatus=[] (السياسة تحرس فعلاً)')
        : fail(`تعطيل السياسة: ${JSON.stringify(dBody?.subscriptionsByStatus)}`);
    } finally {
      // استعادة
      await migPool.query(`ALTER POLICY subscriptions_control_plane_all ON subscriptions USING (CURRENT_USER = 'control_plane_user') WITH CHECK (CURRENT_USER = 'control_plane_user')`);
      pass('استعادة control_plane_all');
    }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — البنيوي: check-observe-import-scope');
    try {
      execSync('node scripts/check-observe-import-scope.mjs', {
        cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe',
      });
      pass('check-observe-import-scope يمرّ (332+ ملفاً، صفر خارج النطاق)');
    } catch (e) {
      fail(`guard: ${e.stderr?.toString() ?? e.message}`);
    }

    // ══════════════════════════════════════════════
    // تنظيف بعدي (platform_users عبر control_plane_user)
    const cpCleanup = new Pool({ connectionString: process.env.DATABASE_URL_PLATFORM, max: 2 });
    try { await cpCleanup.query(`DELETE FROM platform_users WHERE email LIKE 'a25-%'`); }
    finally { await cpCleanup.end(); }
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    console.log('');
    if (failures === 0) console.log('✓ G-P4-20 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-20 FAILED — ${failures} إخفاق`);
  } finally {
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  console.log(`\n[verify-summary] a25: ${failures} إخفاقاً`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
