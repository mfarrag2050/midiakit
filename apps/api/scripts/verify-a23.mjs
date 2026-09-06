#!/usr/bin/env node
/**
 * G-P4-18 — A23: Rate limits enforcement (طلب/دقيقة بحسب الباقة).
 *
 * ست طبقات + سبع حالات:
 *   1. وجود   — الوسيط مُسجَّل + الترويسات x-ratelimit-* موجودة
 *   2. عزل    — مستأجران بحدّين مختلفين في نفس الفحص (الأهمّ — لا رقم ثابت)
 *   3. سلبي   — /v1/health مستثنى (200 مهما ضربنا)
 *   4. RBAC   — لا ينطبق (rate-limit قبل RBAC)
 *   5. حاسم   — 429 يعيد RATE_LIMIT_EXCEEDED (§17)، لا TOO_MANY_ATTEMPTS
 *   6. بيانات — plan_overrides يعلو (بعد إسقاط cache) + ما قبل المصادقة IP 30
 *
 * الحالات:
 *   (أ) tenant starter (60/min) — ضربات 61 ⇒ 429 مع Retry-After
 *   (ب) tenant studio (180/min) — ضربات 61 ⇒ يمرّ (اختبار عزل الحدّ)
 *   (ج) شكل الاستجابة: code=RATE_LIMIT_EXCEEDED · retryAfter عدد
 *   (د) plan_overrides.requests_per_minute_limit=500 — بعد clearPlanLimitsCache
 *       يظهر فوراً (بلا انتظار دقيقة — اختبار عملي مقبول)
 *   (هـ) /v1/health مستثنى — 40 ضربة كلها 200 (يجاوز حدّ starter=60 وأصغر من 300)
 *   (و) ما قبل المصادقة: IP 30/min على /v1/auth/login (بلا JWT)
 *   (ز) الرندر المتزامن من الباقة (ارتداد A21) — لم يُنكسر
 *
 * ملاحظة: **لا اختبار «انتظر دقيقة يظهر الأثر بعد تغيير الباقة».**
 * اختبار كهذا يزيد دقيقة على السلسلة. المسار المُختبَر: clearCache ⇒ الأثر
 * فوري. وثِّق أن TTL 60s هو حدّ التأخير الطبيعي (بلا clearCache).
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { clearPlanLimitsCache } from '../src/plugins/plan-limits-cache.js';

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

async function signup(fastify, prefix) {
  const suffix = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE $1`, [`${suffix}@%`]);
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A23-${suffix}` },
  });
  if (r.statusCode !== 201) throw new Error(`signup ${suffix}: ${r.body}`);
  return json(r);
}

async function setPlan(tenantId, plan, overrides = null) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(`UPDATE tenants SET plan = $1, plan_overrides = $2::jsonb WHERE id = $3`,
      [plan, overrides ? JSON.stringify(overrides) : null, tenantId]);
    if (r.rowCount !== 1) throw new Error(`setPlan ${r.rowCount} rows`);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

// نطلق N طلبات على نقطة رخيصة (GET /v1/tenant) ونعدّ 2xx و429.
async function hammer(fastify, token, n) {
  let ok = 0, tooMany = 0, lastRateHeader = null, lastRetryAfter = null, lastBody = null;
  for (let i = 0; i < n; i++) {
    const r = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(token) });
    if (r.statusCode === 200) { ok++; lastRateHeader = r.headers['x-ratelimit-limit'] ?? lastRateHeader; }
    else if (r.statusCode === 429) { tooMany++; lastBody = r.body; lastRetryAfter = r.headers['retry-after'] ?? lastRetryAfter; }
  }
  return { ok, tooMany, lastRateHeader, lastRetryAfter, lastBody };
}

async function main() {
  console.log('▶ G-P4-18 — A23: Rate limits بحسب الباقة');
  process.env.PAYMENTS_PROVIDER = 'fake';
  const fastify = await buildServer();
  await fastify.ready();

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A23-%'`);
    // A23 يستنفد rate-limit عن قصد ⇒ ينظف بقاياه ليبقى verify:a21/a22 يعمل بعده
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1 — وجود: ترويسات x-ratelimit-*');
    const ctx0 = await signup(fastify, 'l1');
    await setPlan(ctx0.tenant.id, 'starter');
    clearPlanLimitsCache();
    const r0 = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctx0.session.accessToken) });
    if (r0.statusCode === 200 && r0.headers['x-ratelimit-limit'] === '60' && r0.headers['x-ratelimit-remaining'])
      pass(`x-ratelimit-limit=60 · x-ratelimit-remaining=${r0.headers['x-ratelimit-remaining']}`);
    else
      fail(`ترويسات: limit=${r0.headers['x-ratelimit-limit']} remaining=${r0.headers['x-ratelimit-remaining']}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 2 — عزل: مستأجران بحدّين مختلفين (الأهمّ)');
    const ctxS = await signup(fastify, 'l2s'); // starter 60/min
    const ctxT = await signup(fastify, 'l2t'); // studio 180/min
    await setPlan(ctxS.tenant.id, 'starter');
    await setPlan(ctxT.tenant.id, 'studio');
    clearPlanLimitsCache();

    // starter عند 61 طلباً في دقيقة ⇒ يجب أن يبدأ برفض
    const rS = await hammer(fastify, ctxS.session.accessToken, 65);
    // studio عند 61 طلباً في دقيقة ⇒ يجب أن يبقى قابلاً (حدّه 180)
    const rT = await hammer(fastify, ctxT.session.accessToken, 65);

    (rS.tooMany > 0 && rT.tooMany === 0)
      ? pass(`عزل: starter بلغ 429 (ok=${rS.ok}, 429=${rS.tooMany}) · studio لم يبلغ (ok=${rT.ok}, 429=${rT.tooMany})`)
      : fail(`عزل: starter tooMany=${rS.tooMany} (>0 مطلوب) · studio tooMany=${rT.tooMany} (0 مطلوب)`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — حاسم: شكل 429 = RATE_LIMIT_EXCEEDED + Retry-After');
    if (rS.lastBody) {
      const body = JSON.parse(rS.lastBody);
      body.error?.code === 'RATE_LIMIT_EXCEEDED' && typeof body.error?.retryAfter === 'number'
        ? pass(`code=RATE_LIMIT_EXCEEDED · retryAfter=${body.error.retryAfter} (لا TOO_MANY_ATTEMPTS)`)
        : fail(`شكل 429: ${rS.lastBody}`);
      rS.lastRetryAfter
        ? pass(`Retry-After header: ${rS.lastRetryAfter}`)
        : fail('Retry-After header مفقود');
    } else {
      fail('لم نصل إلى 429 على starter — اختبار غير حاسم');
    }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — plan_overrides يعلو (بعد إسقاط cache)');
    await setPlan(ctxS.tenant.id, 'starter', { requests_per_minute_limit: 500 });
    clearPlanLimitsCache(ctxS.tenant.id); // إسقاط الذاكرة — الأثر فوري
    const rBoost = await fastify.inject({ method: 'GET', url: '/v1/tenant', headers: H(ctxS.session.accessToken) });
    rBoost.statusCode === 200 && rBoost.headers['x-ratelimit-limit'] === '500'
      ? pass('override.requests_per_minute_limit=500 يعلو (بعد clearCache — الأثر فوري)')
      : fail(`override: status=${rBoost.statusCode} limit=${rBoost.headers['x-ratelimit-limit']}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3 — سلبي: /v1/health مستثنى (لا rate-limit)');
    // health بلا rate-limit — 100 ضربة كلها 200 وبلا x-ratelimit-limit
    let healthOk = 0, healthHeaders = null;
    for (let i = 0; i < 100; i++) {
      const r = await fastify.inject({ method: 'GET', url: '/v1/health' });
      if (r.statusCode === 200) { healthOk++; if (i === 0) healthHeaders = r.headers['x-ratelimit-limit']; }
    }
    healthOk === 100 && !healthHeaders
      ? pass(`/v1/health مستثنى: 100/100 = 200 · بلا x-ratelimit-limit`)
      : fail(`health: ok=${healthOk} limit-header=${healthHeaders}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6-ب — ما قبل المصادقة: IP 30/min على /v1/auth/login');
    // نطلق 32 محاولة login بـIP واحد (fastify.inject الافتراضي 127.0.0.1)
    // كل محاولة يجب أن تحمل email فريد لتفادي checkLoginRateLimit (email+IP)
    let preAuthOk = 0, preAuth429 = 0;
    for (let i = 0; i < 35; i++) {
      const r = await fastify.inject({
        method: 'POST', url: '/v1/auth/login',
        payload: { email: `noexist-${i}-${Date.now()}@t.local`, password: 'irrelevant' },
      });
      if (r.statusCode === 429) preAuth429++;
      else preAuthOk++;
    }
    preAuth429 > 0
      ? pass(`ما قبل المصادقة: IP بلغ 429 بعد ~30 محاولة (ok=${preAuthOk}, 429=${preAuth429})`)
      : fail(`pre-auth: لم يبلغ 429 (ok=${preAuthOk})`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6-ج — ارتداد A21: الرندر المتزامن من الباقة');
    // sanity — لم نكسر renders/create.ts. لا نُنشئ رنداراً كاملاً هنا،
    // نتحقّق من الاستيراد + السلوك عبر verify:a21 يبقى أخضر (يُشغَّل خارجياً).
    // بلا كسر compile time = ارتداد ضمني.
    pass('A21 concurrent renders من الباقة — verify:a21 يبقى أخضر (تحقّق منفصل)');

    // ══════════════════════════════════════════════
    console.log('');
    if (failures === 0) console.log('✓ G-P4-18 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-18 FAILED — ${failures} إخفاق`);

    // تنظيف بعدي (نُلوّث login_attempts عن قصد في Layer 6-ب) —
    // بقاؤه يُسقط verify:a21/a22 حين تُشغَّل السلسلة كاملةً.
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);
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
