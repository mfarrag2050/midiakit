#!/usr/bin/env node
/**
 * G-P4-16 — A21: Subscriptions + Paddle + فرض الحصص.
 *
 * ست طبقات + سبع حالات:
 *   1. وجود   — 5 endpoints /v1/subscription + webhook مسجَّلة
 *   2. عزل    — GET /v1/subscription لمستأجرَين يعطي حدوداً مختلفة
 *   3. سلبي   — RBAC (viewer→403 على checkout · reason<10→400)
 *   4. RBAC   — owner فقط على checkout/cancel/resume
 *   5. حاسم   — الحارس check-no-paddle-outside-payments نظيف
 *   6. بيانات — مستأجر بلا اشتراك يقرأ حدوده من plans + الفرض يعمل
 *
 * الحالات الحاسمة:
 *   (أ) بلا اشتراك ⇒ GET /v1/subscription يعود plan من tenants + الحدود من plans
 *   (ب) plan_overrides يعلو على الحدّ المفروض (لا القراءة وحدها)
 *   (ج) بلوغ حدّ المقاعد ⇒ SEATS_EXHAUSTED عند invite
 *   (د) بلوغ حدّ Brand Kits ⇒ PLAN_LIMIT_REACHED
 *   (هـ) بلوغ حدّ الفيديو الشهري ⇒ QUOTA_EXCEEDED_VIDEOS
 *   (و) webhook بتوقيع مزيَّف ⇒ 400 VALIDATION_FAILED (X-Signature)
 *   (ز) webhook بتوقيع صحيح ⇒ 200 + subscriptions يُحدَّث
 */
import 'dotenv/config';
import pg from 'pg';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { resetPaymentsProvider } from '../src/payments/index.js';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ DATABASE_URL missing'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 3 });

const WEBHOOK_SECRET = process.env.PAYMENTS_WEBHOOK_SECRET ?? 'dev-webhook-secret-do-not-use-in-prod';

let failures = 0;
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; console.error(`  ✗ ${msg}`); }
function json(r) { try { return JSON.parse(r.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

async function query(sql, params = []) {
  const c = await migPool.connect();
  try { return await c.query(sql, params); }
  finally { c.release(); }
}

async function signup(fastify, prefix) {
  const suffix = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await query(`DELETE FROM login_attempts WHERE email LIKE $1`, [`${suffix}@%`]);
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A21-${suffix}` },
  });
  if (r.statusCode !== 201) throw new Error(`signup ${suffix}: ${r.body}`);
  return json(r);
}

async function setPlan(tenantId, plan, overrides = null) {
  // tenants يحمل RLS بشرط app.tenant_id — migration_user لا يعبره
  // بلا set_config. نضبطه قبل UPDATE.
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(
      `UPDATE tenants SET plan = $1, plan_overrides = $2::jsonb WHERE id = $3`,
      [plan, overrides ? JSON.stringify(overrides) : null, tenantId]);
    if (r.rowCount !== 1) throw new Error(`setPlan updated ${r.rowCount} rows for ${tenantId}`);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

function sign(rawBody) {
  return createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function main() {
  console.log('▶ G-P4-16 — A21: Subscriptions + فرض الحصص + Webhook');
  process.env.PAYMENTS_PROVIDER = 'fake';
  resetPaymentsProvider();
  const fastify = await buildServer();
  await fastify.ready();

  try {
    // نظّف بقايا سابقة
    await query(`DELETE FROM tenants WHERE name LIKE 'A21-%'`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1 — وجود 5 endpoints /v1/subscription + webhook');
    const ctxA = await signup(fastify, 'la1');
    await setPlan(ctxA.tenant.id, 'trial');

    const rGet = await fastify.inject({ method: 'GET', url: '/v1/subscription', headers: H(ctxA.session.accessToken) });
    rGet.statusCode === 200 ? pass('GET /v1/subscription → 200') : fail(`GET → ${rGet.statusCode} ${rGet.body}`);

    const rCk = await fastify.inject({
      method: 'POST', url: '/v1/subscription/checkout', headers: H(ctxA.session.accessToken),
      payload: { targetPlan: 'studio', billingCycle: 'monthly' },
    });
    if (rCk.statusCode === 200 && json(rCk)?.checkoutUrl) pass('POST /checkout → 200 مع checkoutUrl');
    else fail(`checkout → ${rCk.statusCode} ${rCk.body}`);

    const rCn = await fastify.inject({
      method: 'POST', url: '/v1/subscription/cancel', headers: H(ctxA.session.accessToken),
      payload: { reason: 'قصير' },
    });
    rCn.statusCode === 400 && json(rCn)?.error?.code === 'REASON_TOO_SHORT'
      ? pass('POST /cancel reason<10 → 400 REASON_TOO_SHORT')
      : fail(`cancel short → ${rCn.statusCode} ${rCn.body}`);

    const rRe = await fastify.inject({
      method: 'POST', url: '/v1/subscription/resume', headers: H(ctxA.session.accessToken),
    });
    // بلا subscription صفّ ⇒ 404
    rRe.statusCode === 404 ? pass('POST /resume بلا اشتراك → 404') : fail(`resume → ${rRe.statusCode} ${rRe.body}`);

    const rInv = await fastify.inject({ method: 'GET', url: '/v1/subscription/invoices', headers: H(ctxA.session.accessToken) });
    rInv.statusCode === 200 && Array.isArray(json(rInv)?.invoices) ? pass('GET /invoices بلا اشتراك → []') : fail(`invoices → ${rInv.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 2 — عزل: مستأجران بحدود مختلفة');
    const ctxB = await signup(fastify, 'la2');
    await setPlan(ctxA.tenant.id, 'starter'); // brand=1, seats=2, videos=20
    await setPlan(ctxB.tenant.id, 'studio');  // brand=5, seats=5, videos=100

    const gA = json(await fastify.inject({ method: 'GET', url: '/v1/subscription', headers: H(ctxA.session.accessToken) }));
    const gB = json(await fastify.inject({ method: 'GET', url: '/v1/subscription', headers: H(ctxB.session.accessToken) }));
    (gA?.quotas?.brandKits?.limit === 1 && gB?.quotas?.brandKits?.limit === 5)
      ? pass(`عزل: A(starter)=1 · B(studio)=5 brand kits`)
      : fail(`عزل: A=${JSON.stringify(gA?.quotas?.brandKits)} B=${JSON.stringify(gB?.quotas?.brandKits)}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3+4 — RBAC: viewer/admin على checkout');
    const pwHash = await hashPassword('strong_password_1234!');
    const viewerEmail = `a21-viewer-${Date.now()}@t.local`;
    const adminEmail  = `a21-admin-${Date.now()}@t.local`;
    const c = await migPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [ctxA.tenant.id]);
      await c.query(`INSERT INTO users(tenant_id, email, password_hash, role, is_active)
                     VALUES ($1, $2, $3, 'viewer', true)`, [ctxA.tenant.id, viewerEmail, pwHash]);
      await c.query(`INSERT INTO users(tenant_id, email, password_hash, role, is_active)
                     VALUES ($1, $2, $3, 'admin', true)`, [ctxA.tenant.id, adminEmail, pwHash]);
      await c.query('COMMIT');
    } finally { c.release(); }

    const login = async (email) => {
      const r = await fastify.inject({ method: 'POST', url: '/v1/auth/login',
        payload: { email, password: 'strong_password_1234!' } });
      return json(r)?.session?.accessToken;
    };
    const viewerToken = await login(viewerEmail);
    const adminToken  = await login(adminEmail);
    if (!viewerToken || !adminToken) { fail('login viewer/admin failed'); return; }

    const rViewer = await fastify.inject({
      method: 'POST', url: '/v1/subscription/checkout', headers: H(viewerToken),
      payload: { targetPlan: 'studio', billingCycle: 'monthly' },
    });
    rViewer.statusCode === 403 ? pass('viewer POST /checkout → 403') : fail(`viewer checkout → ${rViewer.statusCode}`);

    const rAdminCk = await fastify.inject({
      method: 'POST', url: '/v1/subscription/checkout', headers: H(adminToken),
      payload: { targetPlan: 'studio', billingCycle: 'monthly' },
    });
    rAdminCk.statusCode === 403 ? pass('admin POST /checkout → 403 (owner-only)') : fail(`admin checkout → ${rAdminCk.statusCode}`);

    const rAdminGet = await fastify.inject({ method: 'GET', url: '/v1/subscription', headers: H(adminToken) });
    rAdminGet.statusCode === 200 ? pass('admin GET /subscription → 200') : fail(`admin GET → ${rAdminGet.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — حاسم: check-no-paddle-outside-payments نظيف');
    try {
      execSync('node scripts/check-no-paddle-outside-payments.mjs', { cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe' });
      pass('check-no-paddle-outside-payments: صفر ذكر خارج payments/');
    } catch (e) {
      fail(`check-no-paddle-outside-payments فشل: ${e.stderr?.toString() ?? e.message}`);
    }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — البيانات المرجعية: بلا اشتراك ⇒ الحدود من plans + الفرض');
    // ctxA على starter. لا subscriptions صفّ (لم يمرّ webhook).
    const gA2 = json(await fastify.inject({ method: 'GET', url: '/v1/subscription', headers: H(ctxA.session.accessToken) }));
    gA2?.plan === 'starter' && gA2?.status === 'active' && gA2?.quotas?.brandKits?.limit === 1
      ? pass('بلا اشتراك: plan=starter status=active limits من plans')
      : fail(`بلا اشتراك: ${JSON.stringify(gA2)}`);

    // (أ) و (ج) SEATS_EXHAUSTED: starter=2 seats. المؤلّف owner=1، الـviewer المُنشأ سابقاً في A + adminR ⇒ 3 users
    // إذاً حدّ 2 وصلنا 3 فعلاً — invite يجب أن يرفض SEATS_EXHAUSTED
    const rInv1 = await fastify.inject({
      method: 'POST', url: '/v1/users/invite', headers: H(ctxA.session.accessToken),
      payload: { email: `inv-${Date.now()}@t.local`, role: 'writer' },
    });
    rInv1.statusCode === 422 && json(rInv1)?.error?.code === 'SEATS_EXHAUSTED'
      ? pass('SEATS_EXHAUSTED: users≥2 على starter → 422')
      : fail(`invite → ${rInv1.statusCode} ${rInv1.body}`);

    // (ب) plan_overrides يعلو: نرفع seats إلى 20
    await setPlan(ctxA.tenant.id, 'starter', { seats_limit: 20 });
    const rInv2 = await fastify.inject({
      method: 'POST', url: '/v1/users/invite', headers: H(ctxA.session.accessToken),
      payload: { email: `inv2-${Date.now()}@t.local`, role: 'writer' },
    });
    rInv2.statusCode === 201
      ? pass('plan_overrides.seats_limit=20 يعلو ⇒ invite ينجح')
      : fail(`invite after override → ${rInv2.statusCode} ${rInv2.body}`);
    await setPlan(ctxA.tenant.id, 'starter'); // نستعيد

    // (د) PLAN_LIMIT_REACHED: starter=1 brand kit. الأول موجود من signup؟
    // signup ليس ينشئ brand kit. نُنشئ واحداً ثم الثاني يفشل.
    const bkOk = await fastify.inject({
      method: 'POST', url: '/v1/brand-kits', headers: H(ctxA.session.accessToken),
      payload: { name: 'bk1' },
    });
    if (bkOk.statusCode !== 201) fail(`bk1 → ${bkOk.statusCode} ${bkOk.body}`);
    const bkFail = await fastify.inject({
      method: 'POST', url: '/v1/brand-kits', headers: H(ctxA.session.accessToken),
      payload: { name: 'bk2' },
    });
    bkFail.statusCode === 422 && json(bkFail)?.error?.code === 'PLAN_LIMIT_REACHED'
      ? pass('PLAN_LIMIT_REACHED: brand_kits≥1 على starter → 422')
      : fail(`bk2 → ${bkFail.statusCode} ${bkFail.body}`);

    // (هـ) QUOTA_EXCEEDED_VIDEOS: نُدرج 20 صفوف renders format=mp4 حالياً ونحاول 21
    // trial=5 أقصر. نُبدّل المستأجر إلى trial.
    await setPlan(ctxA.tenant.id, 'trial');
    // نحتاج مشروعاً حقيقياً. نستعمل bkOk id + template عام + PROJECT جديد
    const bkId = json(bkOk).id;
    const tplList = json(await fastify.inject({ method: 'GET', url: '/v1/templates', headers: H(ctxA.session.accessToken) }));
    const tplId = tplList?.data?.[0]?.id;
    if (!tplId) throw new Error('لا قوالب متاحة');
    const rPrj = await fastify.inject({
      method: 'POST', url: '/v1/projects', headers: H(ctxA.session.accessToken),
      payload: { title: 'prj-quota', brand_kit_id: bkId, template_id: tplId },
    });
    const pid = json(rPrj)?.id;
    if (!pid) throw new Error(`project: ${rPrj.body}`);

    // نُدرج 5 renders mp4 مباشرة في DB (لا نمرّ عبر API لتفادي الطابور)
    const cRenders = await migPool.connect();
    try {
      await cRenders.query('BEGIN');
      await cRenders.query('SELECT app_set_tenant($1::uuid)', [ctxA.tenant.id]);
      for (let i = 0; i < 5; i++) {
        await cRenders.query(
          `INSERT INTO renders(tenant_id, project_id, size, format, status,
                                brand_snapshot, template_snapshot, requested_by)
           VALUES ($1, $2, 'x', 'mp4', 'succeeded', '{}'::jsonb, '{}'::jsonb, $3)`,
          [ctxA.tenant.id, pid, ctxA.user.id]);
      }
      await cRenders.query('COMMIT');
    } catch (e) { await cRenders.query('ROLLBACK').catch(() => {}); throw e; }
    finally { cRenders.release(); }
    const rRender = await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(ctxA.session.accessToken),
      payload: { project_id: pid, size: 'x', format: 'mp4' },
    });
    rRender.statusCode === 422 && json(rRender)?.error?.code === 'QUOTA_EXCEEDED_VIDEOS'
      ? pass('QUOTA_EXCEEDED_VIDEOS: mp4≥5 على trial → 422')
      : fail(`render → ${rRender.statusCode} ${rRender.body}`);

    // (و) webhook توقيع مزيَّف
    const evt = {
      kind: 'subscription.created', tenantId: ctxA.tenant.id, plan: 'studio',
      externalSubscriptionId: 'sub_test_001', externalCustomerId: 'cus_test_001',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30*24*3600*1000).toISOString(),
    };
    const bodyStr = JSON.stringify(evt);
    const rBadSig = await fastify.inject({
      method: 'POST', url: '/v1/webhooks/subscription',
      headers: { 'content-type': 'application/json', 'x-signature': 'deadbeef'.repeat(8) },
      payload: bodyStr,
    });
    rBadSig.statusCode === 400 && json(rBadSig)?.error?.code === 'VALIDATION_FAILED'
      ? pass('webhook توقيع مزيَّف → 400 VALIDATION_FAILED (X-Signature)')
      : fail(`bad sig → ${rBadSig.statusCode} ${rBadSig.body}`);

    // (ز) webhook توقيع صحيح
    const goodSig = sign(bodyStr);
    const rGoodSig = await fastify.inject({
      method: 'POST', url: '/v1/webhooks/subscription',
      headers: { 'content-type': 'application/json', 'x-signature': goodSig },
      payload: bodyStr,
    });
    if (rGoodSig.statusCode === 200 && json(rGoodSig)?.received === true) {
      pass('webhook توقيع صحيح → 200 {received:true}');
      // تحقّق التأثير على DB (RLS يفرض app.tenant_id)
      const cDb = await migPool.connect();
      try {
        await cDb.query('BEGIN');
        await cDb.query('SELECT app_set_tenant($1::uuid)', [ctxA.tenant.id]);
        const subRow = await cDb.query(
          `SELECT plan, status, external_subscription_id FROM subscriptions WHERE tenant_id = $1`,
          [ctxA.tenant.id]);
        subRow.rows[0]?.plan === 'studio' && subRow.rows[0]?.status === 'active' && subRow.rows[0]?.external_subscription_id === 'sub_test_001'
          ? pass('webhook أثّر: subscriptions.plan=studio · status=active')
          : fail(`sub row: ${JSON.stringify(subRow.rows[0])}`);
        const tenantRow = await cDb.query(`SELECT plan FROM tenants WHERE id = $1`, [ctxA.tenant.id]);
        tenantRow.rows[0]?.plan === 'studio' ? pass('tenants.plan تحدَّث إلى studio') : fail(`tenant plan: ${tenantRow.rows[0]?.plan}`);
        await cDb.query('COMMIT');
      } finally { cDb.release(); }
    } else {
      fail(`good sig → ${rGoodSig.statusCode} ${rGoodSig.body}`);
    }

    console.log('');
    if (failures === 0) console.log('✓ G-P4-16 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-16 FAILED — ${failures} إخفاق`);
  } finally {
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
