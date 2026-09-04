/**
 * smoke-auth — يتحقّق من auth/session.ts بلا Fastify.
 *
 * يستهلك DATABASE_URL_APP من .env، يصفّر مستأجراً اختبارياً، ويشغّل
 * كل مسار: signup · login · verifyToken · refresh · revoke · reset.
 * G-P4-2 (A8) سيوسّع هذه الاختبارات إلى HTTP-level.
 */
import 'dotenv/config';
import pg from 'pg';
import {
  hashPassword, verifyPassword,
  signup, login, verifyAccessToken, refreshSession,
  getActiveSession, revokeSession,
  requestPasswordReset, completePasswordReset,
  getJwtSchema,
} from '../src/auth/session.js';
import { ApiError } from '../src/errors.js';

const { Pool } = pg;

const DATABASE_URL_APP = process.env.DATABASE_URL_APP;
const DATABASE_URL_MIGRATION = process.env.DATABASE_URL ||
  DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');

if (!DATABASE_URL_APP || !DATABASE_URL_MIGRATION) {
  console.error('✗ Missing DATABASE_URL_APP or DATABASE_URL in env');
  process.exit(1);
}

const appPool = new Pool({ connectionString: DATABASE_URL_APP, max: 5 });
const migPool = new Pool({ connectionString: DATABASE_URL_MIGRATION, max: 2 });

let failed = 0;
function pass(msg: string): void { console.log(`  ✓ ${msg}`); }
function fail(msg: string): void { failed++; console.error(`  ✗ ${msg}`); }

async function main(): Promise<void> {
  console.log('▶ smoke-auth — auth/session.ts');
  console.log(`  JWT schema: ${JSON.stringify(getJwtSchema())}`);

  // نظّف قاعدة العمل (مستأجرات smoke + محاولات دخول قديمة).
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'Smoke-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'smoke-%@test.local' OR email = 'nobody@nowhere.local'`);

  const testEmail = `smoke-${Date.now()}@test.local`;
  const wrongPassword = 'wrong_password_xxx';
  const correctPassword = 'strong_password_1234!';

  // ── 1. hash + verify ────────────────────────────────
  console.log('\n▶ hash + verify (argon2id PHC)');
  const h = await hashPassword(correctPassword);
  if (h.startsWith('$argon2id$v=19$m=')) pass(`PHC format: ${h.slice(0, 60)}...`);
  else fail(`PHC format wrong: ${h.slice(0, 60)}`);
  if (await verifyPassword(correctPassword, h)) pass('verifyPassword correct → true');
  else fail('verifyPassword correct → false');
  if (!(await verifyPassword(wrongPassword, h))) pass('verifyPassword wrong → false');
  else fail('verifyPassword wrong → true');

  // ── 2. signup ─────────────────────────────────────────
  console.log('\n▶ signup');
  const signupRes = await signup(appPool, {
    email: testEmail,
    password: correctPassword,
    tenantName: `Smoke-${Date.now()}`,
    locale: 'ar',
  });
  if (signupRes.tokens.accessToken) pass(`signup → tokens (access ${signupRes.tokens.accessToken.length} chars)`);
  else fail('signup no access token');
  if (signupRes.tenantId) pass(`tenantId: ${signupRes.tenantId.slice(0, 8)}...`);
  else fail('no tenantId');

  const { tenantId, userId, tokens: signupTokens } = signupRes;

  // ── 3. verifyAccessToken (positive) ─────────────────────
  console.log('\n▶ verifyAccessToken');
  const claims = await verifyAccessToken(signupTokens.accessToken);
  if (claims.sub === userId) pass(`sub === userId`);
  else fail(`sub ${claims.sub} !== userId ${userId}`);
  if (claims.tenant_id === tenantId) pass(`tenant_id === tenantId`);
  else fail(`tenant_id mismatch`);
  if (claims.role === 'owner') pass(`role === owner`);
  else fail(`role ${claims.role} !== owner`);
  if (claims.iss === 'pf-mediakit-api' && claims.aud === 'pf-mediakit-studio') pass(`iss/aud صحيح`);
  else fail(`iss/aud غير صحيح: ${claims.iss}/${claims.aud}`);

  // ── 4. verifyAccessToken (negative — token مبتور) ────
  try {
    await verifyAccessToken('not.a.jwt');
    fail('bad token accepted');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'TOKEN_INVALID') pass('bad token → TOKEN_INVALID');
    else fail(`bad token unexpected: ${(err as Error).message}`);
  }

  // ── 5. login بكلمة سر صحيحة ───────────────────────────
  console.log('\n▶ login (correct)');
  const loginRes = await login(appPool, {
    email: testEmail, password: correctPassword, ip: '127.0.0.1',
  });
  if (loginRes.tokens.accessToken && loginRes.userId === userId) pass('login → tokens');
  else fail('login failed');

  // ── 6. login بكلمة سر خاطئة (بحساب موجود) ─────────
  console.log('\n▶ login (wrong password on known email)');
  const t1 = Date.now();
  try {
    await login(appPool, {
      email: testEmail, password: wrongPassword, ip: '127.0.0.2',
    });
    fail('wrong password accepted');
  } catch (err) {
    const dt = Date.now() - t1;
    if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
      pass(`wrong password → INVALID_CREDENTIALS (${dt}ms)`);
    } else {
      fail(`unexpected: ${(err as Error).message}`);
    }
  }

  // ── 7. login ببريد غير موجود (نفس الخطأ ونفس التوقيت تقريباً)
  console.log('\n▶ login (unknown email)');
  const t2 = Date.now();
  try {
    await login(appPool, {
      email: 'nobody@nowhere.local', password: wrongPassword, ip: '127.0.0.3',
    });
    fail('unknown email accepted');
  } catch (err) {
    const dt = Date.now() - t2;
    if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
      pass(`unknown email → INVALID_CREDENTIALS (${dt}ms) — نفس الخطأ`);
    } else {
      fail(`unexpected: ${(err as Error).message}`);
    }
  }

  // ── 8. refresh ────────────────────────────────────────
  console.log('\n▶ refresh');
  const refreshed = await refreshSession(appPool, loginRes.tokens.refreshToken);
  if (refreshed.accessToken !== loginRes.tokens.accessToken) pass('refresh → new access token');
  else fail('refresh returned same access token');

  // ── 9. refresh بالرمز القديم (مُبطل الآن) → يفشل
  try {
    await refreshSession(appPool, loginRes.tokens.refreshToken);
    fail('old refresh token accepted after rotation');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'REFRESH_TOKEN_INVALID') {
      pass('old refresh token → REFRESH_TOKEN_INVALID');
    } else {
      fail(`unexpected: ${(err as Error).message}`);
    }
  }

  // ── 10. revoke session ثم verify → SESSION_REVOKED
  console.log('\n▶ revoke session');
  const refreshedClaims = await verifyAccessToken(refreshed.accessToken);
  {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [refreshedClaims.tenant_id]);
      await revokeSession(c, refreshedClaims.session_id);
      await c.query('COMMIT');
    } finally { c.release(); }
  }

  try {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [refreshedClaims.tenant_id]);
      await getActiveSession(c, refreshedClaims.session_id);
      await c.query('COMMIT');
    } finally { c.release(); }
    fail('revoked session accepted');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SESSION_REVOKED') {
      pass('revoked session → SESSION_REVOKED');
    } else {
      fail(`unexpected: ${(err as Error).message}`);
    }
  }

  // ── 11. password reset ────────────────────────────────
  console.log('\n▶ password reset');
  const resetRes = await requestPasswordReset(appPool, { email: testEmail });
  if (resetRes.tokenPlain) pass('reset token issued (email موجود)');
  else fail('reset token null (email موجود)');

  const newPassword = 'new_strong_password_5678#';
  await completePasswordReset(appPool, {
    token: resetRes.tokenPlain!, email: testEmail, newPassword,
  });
  pass('completePasswordReset → OK');

  // login بكلمة السر الجديدة — لكن نظّف login_attempts أولاً لتجاوز
  // rate limit من الفحوص السابقة.
  await migPool.query(`DELETE FROM login_attempts WHERE email = $1`, [testEmail]);

  const loginNew = await login(appPool, {
    email: testEmail, password: newPassword, ip: '127.0.0.1',
  });
  if (loginNew.userId === userId) pass('login بكلمة السر الجديدة → نجاح');
  else fail('login بكلمة السر الجديدة → فشل');

  // إعادة استخدام الرمز → فشل
  try {
    await completePasswordReset(appPool, {
      token: resetRes.tokenPlain!, email: testEmail, newPassword: 'again_1234',
    });
    fail('reset token reused accepted');
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'RESET_TOKEN_USED' || err.code === 'RESET_TOKEN_INVALID')) {
      pass(`reset token reused → ${err.code}`);
    } else {
      fail(`unexpected: ${(err as Error).message}`);
    }
  }

  // ── 12. request reset لبريد غير موجود → tokenPlain null (لا كشف)
  const resetGhost = await requestPasswordReset(appPool, { email: 'ghost@nowhere.local' });
  if (resetGhost.tokenPlain === null) pass('reset لبريد غير موجود → null (لا كشف)');
  else fail('reset لبريد غير موجود → أُصدر رمز');

  // ── 13. rate limit ────────────────────────────────────
  console.log('\n▶ rate limit (11 محاولة فاشلة بنفس البريد)');
  await migPool.query(`DELETE FROM login_attempts WHERE email = $1`, [testEmail]);

  let hitLimit = false;
  for (let i = 0; i < 11; i++) {
    try {
      await login(appPool, {
        email: testEmail, password: wrongPassword, ip: `10.0.0.${i}`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_ATTEMPTS') {
        hitLimit = true;
        pass(`rate limit ضرب عند المحاولة ${i + 1}`);
        break;
      }
    }
  }
  if (!hitLimit) fail('rate limit لم يُفعَّل بعد 11 محاولة');

  // ── نظّف ─────────────────────────────────────────────
  await migPool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'smoke-%@test.local' OR email = 'nobody@nowhere.local'`);

  await appPool.end();
  await migPool.end();

  console.log(`\n${'═'.repeat(60)}`);
  if (failed === 0) {
    console.log(`✓ smoke-auth PASSED`);
    process.exit(0);
  } else {
    console.error(`✗ smoke-auth FAILED — ${failed} إخفاق`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Unexpected exception:', err);
  process.exit(1);
});
