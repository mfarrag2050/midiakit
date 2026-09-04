#!/usr/bin/env node
/**
 * G-P4-2 — بوابة نقاء المصادقة (docs/17 §7).
 *
 * ثلاث طبقات:
 *   1. grep guard: لا ملف في apps/api/src/** (عدا auth/session.ts)
 *      يستورد jose أو @node-rs/argon2 أو jsonwebtoken أو argon2.
 *   2. HTTP integration (fastify.inject): signup/login/refresh/logout
 *      إيجابيّة + سلبيّة كاشفة.
 *   3. Constant-time + non-disclosure: بريد موجود وبريد مفقود يعطيان
 *      نفس ApiError ونفس نطاق التوقيت (تسامح 3×).
 *
 * الخروج: 0 نجاح · 1 فشل.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { SignJWT } from 'jose';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';

const { Pool } = pg;

const DATABASE_URL_MIGRATION = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!DATABASE_URL_MIGRATION) {
  console.error('✗ Missing DATABASE_URL in env');
  process.exit(1);
}

const migPool = new Pool({ connectionString: DATABASE_URL_MIGRATION, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }

// ══════════════════════════════════════════════════════════════════
//  Layer 1 — grep guard
// ══════════════════════════════════════════════════════════════════

function checkGrepGuard() {
  console.log('\n▶ Layer 1 — grep guard: crypto imports حصراً في auth/session.ts');
  const patterns = ['@node-rs/argon2', 'jose', 'jsonwebtoken', "'argon2'"];
  let anyLeaked = false;
  for (const pattern of patterns) {
    try {
      // grep exits 0 = match found. Ignore auth/session.ts (المكان الوحيد المسموح).
      const out = execSync(
        `grep -rn "from '${pattern.replace(/'/g, "'\"'\"'")}'" apps/api/src/ 2>/dev/null | grep -v 'auth/session.ts' || true`,
        { encoding: 'utf8', cwd: process.cwd() },
      ).trim();
      if (out) {
        fail(`grep guard — ${pattern} يُستورَد خارج auth/session.ts:\n${out}`);
        anyLeaked = true;
      } else {
        pass(`لا استخدام لـ${pattern} خارج auth/session.ts`);
      }
    } catch (err) {
      fail(`grep guard error for ${pattern}: ${err.message}`);
    }
  }
  return !anyLeaked;
}

// ══════════════════════════════════════════════════════════════════
//  Helpers للـHTTP tests
// ══════════════════════════════════════════════════════════════════

async function seedFreshEnv() {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'Gate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'gate-%@test.local' OR email = 'nobody-gate@nowhere.local'`);
}

function json(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 2 — HTTP integration
// ══════════════════════════════════════════════════════════════════

async function checkHttp(fastify) {
  console.log('\n▶ Layer 2 — HTTP integration (fastify.inject)');

  const testEmail = `gate-${Date.now()}@test.local`;
  const password = 'strong_gate_password_1234!';

  // ── signup ─────────────────────────────────────────
  const signupRes = await fastify.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email: testEmail, password, tenantName: `Gate-${Date.now()}`, locale: 'ar' },
  });
  if (signupRes.statusCode === 201) pass(`POST /v1/auth/signup → 201`);
  else { fail(`signup → ${signupRes.statusCode}: ${signupRes.body}`); return null; }

  const signupBody = json(signupRes);
  const accessToken = signupBody?.session?.accessToken;
  const refreshToken = signupBody?.session?.refreshToken;
  const userId = signupBody?.user?.id;
  const tenantId = signupBody?.tenant?.id;
  if (accessToken && refreshToken && userId && tenantId) pass(`signup response كامل`);
  else { fail(`signup response ناقص: ${signupRes.body}`); return null; }

  // ── login (correct) ────────────────────────────────
  const loginRes = await fastify.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: testEmail, password },
  });
  if (loginRes.statusCode === 200) pass(`POST /v1/auth/login (correct) → 200`);
  else fail(`login correct → ${loginRes.statusCode}: ${loginRes.body}`);

  const loginBody = json(loginRes);
  const loginToken = loginBody?.session?.accessToken;
  const loginRefresh = loginBody?.session?.refreshToken;

  // ── refresh ────────────────────────────────────────
  const refreshRes = await fastify.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: loginRefresh },
  });
  if (refreshRes.statusCode === 200) pass(`POST /v1/auth/refresh → 200`);
  else fail(`refresh → ${refreshRes.statusCode}: ${refreshRes.body}`);

  const refreshBody = json(refreshRes);
  const rotatedAccess = refreshBody?.session?.accessToken;

  // ── refresh with old token → 401 ───────────────────
  const refreshAgain = await fastify.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: loginRefresh },
  });
  const refreshAgainBody = json(refreshAgain);
  if (refreshAgain.statusCode === 401 && refreshAgainBody?.error?.code === 'REFRESH_TOKEN_INVALID') {
    pass(`refresh بالرمز المُبطل → 401 REFRESH_TOKEN_INVALID`);
  } else fail(`refresh old → ${refreshAgain.statusCode} ${refreshAgain.body}`);

  // ── logout (revoke session) ────────────────────────
  const logoutRes = await fastify.inject({
    method: 'DELETE',
    url: '/v1/auth/logout',
    headers: { authorization: `Bearer ${rotatedAccess}` },
  });
  if (logoutRes.statusCode === 204) pass(`DELETE /v1/auth/logout → 204`);
  else fail(`logout → ${logoutRes.statusCode}: ${logoutRes.body}`);

  // ── logout again with revoked session → 401 SESSION_REVOKED
  const logout2 = await fastify.inject({
    method: 'DELETE',
    url: '/v1/auth/logout',
    headers: { authorization: `Bearer ${rotatedAccess}` },
  });
  const logout2Body = json(logout2);
  if (logout2.statusCode === 401 && logout2Body?.error?.code === 'SESSION_REVOKED') {
    pass(`logout بجلسة مُبطلة → 401 SESSION_REVOKED (لا JWT بلا حالة)`);
  } else fail(`logout revoked → ${logout2.statusCode} ${logout2.body}`);

  // ── missing Authorization → 401 UNAUTHORIZED
  const missing = await fastify.inject({ method: 'DELETE', url: '/v1/auth/logout' });
  if (missing.statusCode === 401 && json(missing)?.error?.code === 'UNAUTHORIZED') {
    pass(`logout بلا Bearer → 401 UNAUTHORIZED`);
  } else fail(`missing bearer → ${missing.statusCode} ${missing.body}`);

  // ── bad JWT signature → 401 TOKEN_INVALID
  const badSig = await fastify.inject({
    method: 'DELETE',
    url: '/v1/auth/logout',
    headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.badsignature' },
  });
  if (badSig.statusCode === 401 && json(badSig)?.error?.code === 'TOKEN_INVALID') {
    pass(`logout بتوقيع مُلفَّق → 401 TOKEN_INVALID`);
  } else fail(`bad sig → ${badSig.statusCode} ${badSig.body}`);

  // ── expired JWT → 401 TOKEN_EXPIRED
  const secret = new TextEncoder().encode(process.env.SESSION_JWT_SECRET);
  const expiredToken = await new SignJWT({
    tenant_id: tenantId,
    role: 'owner',
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('pf-mediakit-api')
    .setAudience('pf-mediakit-studio')
    .setSubject(userId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secret);

  const expiredRes = await fastify.inject({
    method: 'DELETE',
    url: '/v1/auth/logout',
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  if (expiredRes.statusCode === 401 && json(expiredRes)?.error?.code === 'TOKEN_EXPIRED') {
    pass(`logout بـtoken منتهٍ → 401 TOKEN_EXPIRED`);
  } else fail(`expired → ${expiredRes.statusCode} ${expiredRes.body}`);

  return { testEmail, password };
}

// ══════════════════════════════════════════════════════════════════
//  Layer 3 — Non-disclosure + constant-time
// ══════════════════════════════════════════════════════════════════

async function checkNonDisclosure(fastify, testEmail) {
  console.log('\n▶ Layer 3 — non-disclosure: بريد موجود/مفقود = نفس الاستجابة');

  const wrongPw = 'wrong_wrong_1234_wrong';

  // نظّف rate limit (10 محاولات فقط لكل بريد قبل الضرب).
  await migPool.query(`DELETE FROM login_attempts WHERE email IN ($1, $2)`, [testEmail, 'nobody-gate@nowhere.local']);

  // Warm up (يجنّب أوّل استدعاء بطيء)
  await fastify.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'warm@warm.warm', password: 'x' } });

  // نطاقان: بريد موجود بكلمة خاطئة، بريد مفقود
  const N = 3;
  const knownTimes = [], unknownTimes = [];
  let knownCode = null, unknownCode = null;
  for (let i = 0; i < N; i++) {
    const tk = Date.now();
    const r = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: testEmail, password: wrongPw },
    });
    knownTimes.push(Date.now() - tk);
    knownCode ??= r.statusCode;
    if (r.statusCode !== 401 || json(r)?.error?.code !== 'INVALID_CREDENTIALS') {
      fail(`known email wrong pw #${i} → ${r.statusCode} ${r.body}`);
    }
  }
  for (let i = 0; i < N; i++) {
    const tk = Date.now();
    const r = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'nobody-gate@nowhere.local', password: wrongPw },
    });
    unknownTimes.push(Date.now() - tk);
    unknownCode ??= r.statusCode;
    if (r.statusCode !== 401 || json(r)?.error?.code !== 'INVALID_CREDENTIALS') {
      fail(`unknown email #${i} → ${r.statusCode} ${r.body}`);
    }
  }

  if (knownCode === unknownCode && knownCode === 401) {
    pass(`same status code (401) + same error code (INVALID_CREDENTIALS) لكلا الحالتين`);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const kAvg = avg(knownTimes), uAvg = avg(unknownTimes);
  const ratio = Math.max(kAvg, uAvg) / Math.min(kAvg, uAvg);
  // تسامح 3× — argon2 هو المسيطر على الزمن. النسبة يجب أن تكون قريبة من 1.
  if (ratio < 3) {
    pass(`timing متقارب (known ${kAvg.toFixed(1)}ms · unknown ${uAvg.toFixed(1)}ms · نسبة ${ratio.toFixed(2)}×)`);
  } else {
    fail(`timing متباعد (known ${kAvg.toFixed(1)}ms · unknown ${uAvg.toFixed(1)}ms · نسبة ${ratio.toFixed(2)}× — >3× قد يكشف الحساب)`);
  }

  // forgot-password: بريد موجود ومفقود → 204 كلاهما
  const fpKnown = await fastify.inject({
    method: 'POST', url: '/v1/auth/forgot-password',
    payload: { email: testEmail },
  });
  const fpUnknown = await fastify.inject({
    method: 'POST', url: '/v1/auth/forgot-password',
    payload: { email: 'ghost-gate@nowhere.local' },
  });
  if (fpKnown.statusCode === 204 && fpUnknown.statusCode === 204) {
    pass(`forgot-password → 204 لكلا (بريد موجود ومفقود)`);
  } else {
    fail(`forgot-password mismatch: known=${fpKnown.statusCode} unknown=${fpUnknown.statusCode}`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 4 — Rate limit
// ══════════════════════════════════════════════════════════════════

async function checkRateLimit(fastify, testEmail) {
  console.log('\n▶ Layer 4 — rate limit: 10 محاولات فاشلة → 429');

  await migPool.query(`DELETE FROM login_attempts WHERE email = $1`, [testEmail]);

  let hit = false;
  for (let i = 0; i < 12; i++) {
    const r = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: testEmail, password: `wrong-${i}-XXX` },
    });
    const body = json(r);
    if (body?.error?.code === 'TOO_MANY_ATTEMPTS') {
      pass(`rate limit ضرب في المحاولة ${i + 1} → TOO_MANY_ATTEMPTS`);
      hit = true;
      break;
    }
    if (r.statusCode !== 401) {
      fail(`unexpected status ${r.statusCode} at attempt ${i + 1}: ${r.body}`);
    }
  }
  if (!hit) fail(`rate limit لم يُفعَّل بعد 12 محاولة`);
}

// ══════════════════════════════════════════════════════════════════
//  main
// ══════════════════════════════════════════════════════════════════

async function main() {
  console.log('▶ G-P4-2 — بوابة نقاء المصادقة');

  // Layer 1 قبل بناء server (سريع)
  checkGrepGuard();

  await seedFreshEnv();
  const fastify = await buildServer();
  await fastify.ready();

  try {
    const httpCtx = await checkHttp(fastify);
    if (httpCtx) {
      await checkNonDisclosure(fastify, httpCtx.testEmail);
      await checkRateLimit(fastify, httpCtx.testEmail);
    }
  } finally {
    await fastify.close();
    await closePool();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'Gate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'gate-%@test.local' OR email IN ('nobody-gate@nowhere.local', 'ghost-gate@nowhere.local', 'warm@warm.warm')`);
    await migPool.end();
  }

  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) {
    console.log(`✓ G-P4-2 PASSED`);
    process.exit(0);
  } else {
    console.error(`✗ G-P4-2 FAILED — ${failures} إخفاق`);
    for (const line of failLog) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Unexpected exception:', err);
  process.exit(1);
});
