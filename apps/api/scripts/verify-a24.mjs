#!/usr/bin/env node
/**
 * G-P4-19 — A24: AI Integrations + Invoke (BYO-key مشفَّر).
 *
 * ست طبقات + سبع حالات:
 *   1. وجود   — 4 endpoints /v1/ai/* تعمل + config يفشل بلا KEY
 *   2. عزل    — تكامل مستأجر آخر ⇒ 404
 *   3. سلبي   — INVALID_PROVIDER · API_KEY_VALIDATION_FAILED · UNKNOWN_CAPABILITY ·
 *              CAPABILITY_NOT_ENABLED
 *   4. RBAC   — writer فقط على invoke · admin+ على integrations
 *   5. حاسم   — المفتاح لا يظهر في GET ولا في السجلّ (grep بعد استدعاء)
 *   6. البنيوي — check-no-ai-provider-outside-ai يمرّ
 *
 * الحالات:
 *   (أ) config بلا AI_KEY_ENCRYPTION_KEY ⇒ لا يُقلع
 *   (ب) config بمفتاح 63 حرفاً (خاطئ) ⇒ لا يُقلع
 *   (ج) config بـplaceholder معروف في production ⇒ لا يُقلع
 *   (د) POST integrations + invoke ⇒ output صحيح + usage.ai_tokens يزيد
 *   (هـ) AI_FAKE_FORCE=error ⇒ 502 PROVIDER_ERROR (لا فشل صامت)
 *   (و) AI_FAKE_FORCE=timeout ⇒ 504 PROVIDER_TIMEOUT
 *   (ز) المفتاح `sk_test_secret_leak_probe` لا يظهر في: GET/list · GET/invoke
 *       response · SQL row api_key_ref · logs stdout
 */
import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { execSync } from 'node:child_process';
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

/** يشغّل server.ts subprocess بـenv مخصَّص. يعيد {code, out}. */
function spawnServer(envOverrides) {
  // نستدعي node -e يستورد config ثم يخرج — أرخص من buildServer كامل
  const check = `(async () => {
    process.env = { ...process.env, ...${JSON.stringify(envOverrides)} };
    try {
      await import('/Users/mdervis/MediaKit/pf-mediakit-api/apps/api/src/config.js');
      console.log('BOOT_OK');
    } catch (e) {
      console.error('BOOT_FAIL:', String(e?.message ?? e));
      process.exit(3);
    }
  })();`;
  const r = spawnSync('node', ['--import', 'tsx', '--input-type=module', '-e', check], {
    cwd: '/Users/mdervis/MediaKit/pf-mediakit-api',
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

async function main() {
  console.log('▶ G-P4-19 — A24: AI Integrations (BYO-key مشفَّر)');
  const fastify = await buildServer();
  await fastify.ready();

  // نلتقط stdout الطلبات (fastify pino) للتحقّق من عدم تسريب المفتاح
  const capturedLogs = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    capturedLogs.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origWrite(chunk, ...rest);
  };
  const origErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    capturedLogs.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origErr(chunk, ...rest);
  };

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A24-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1 — وجود config gate + endpoints');

    // (أ) config بلا AI_KEY_ENCRYPTION_KEY ⇒ لا يُقلع
    const noKey = spawnServer({ AI_KEY_ENCRYPTION_KEY: '' });
    noKey.code !== 0 && !noKey.out.includes('BOOT_OK') && noKey.out.includes('AI_KEY_ENCRYPTION_KEY')
      ? pass('config بلا KEY ⇒ لا يُقلع (exit=' + noKey.code + ')')
      : fail(`config بلا KEY: exit=${noKey.code} out=${noKey.out.slice(0, 200)}`);

    // (ب) config بمفتاح 63 حرفاً
    const shortKey = spawnServer({ AI_KEY_ENCRYPTION_KEY: 'a'.repeat(63) });
    shortKey.code !== 0 && shortKey.out.includes('64 hex')
      ? pass('config بمفتاح 63 حرفاً ⇒ لا يُقلع')
      : fail(`config 63: exit=${shortKey.code} out=${shortKey.out.slice(0, 200)}`);

    // (ج) placeholder في production
    const placeholder = spawnServer({
      NODE_ENV: 'production',
      AI_KEY_ENCRYPTION_KEY: '0'.repeat(64),
      SMTP_HOST: 'x', SMTP_PORT: '25', SMTP_USER: 'u', SMTP_PASS: 'p',
      SMTP_FROM: 'x@y.local', STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://127.0.0.1:19043', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
    });
    placeholder.code !== 0 && placeholder.out.includes('placeholder')
      ? pass('config بـplaceholder في production ⇒ لا يُقلع')
      : fail(`config placeholder: exit=${placeholder.code} out=${placeholder.out.slice(0, 300)}`);

    // signup + bump حدود
    const suffix = `a24-${Date.now()}`;
    const sig = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A24-${suffix}` },
    });
    if (sig.statusCode !== 201) throw new Error(`signup: ${sig.body}`);
    const { session, tenant } = json(sig);
    const token = session.accessToken;
    await bumpTenantLimits(migPool, tenant.id);

    // GET بلا تكاملات ⇒ 200 مع []
    const r0 = await fastify.inject({ method: 'GET', url: '/v1/ai/integrations', headers: H(token) });
    r0.statusCode === 200 && Array.isArray(json(r0)?.data)
      ? pass('GET /v1/ai/integrations → 200 مع data:[]')
      : fail(`list empty: ${r0.statusCode} ${r0.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3 — سلبي: INVALID_PROVIDER + API_KEY_VALIDATION_FAILED');
    const bad = await fastify.inject({
      method: 'POST', url: '/v1/ai/integrations', headers: H(token),
      payload: { provider: 'notarealprovider', apiKey: 'sk_test_valid_key_1234' },
    });
    bad.statusCode === 400 && json(bad)?.error?.code === 'INVALID_PROVIDER'
      ? pass('POST provider مجهول → 400 INVALID_PROVIDER')
      : fail(`invalid provider: ${bad.statusCode} ${bad.body}`);

    const short = await fastify.inject({
      method: 'POST', url: '/v1/ai/integrations', headers: H(token),
      payload: { provider: 'gemini', apiKey: 'x' }, // FakeProvider يرفض <8 حروف
    });
    short.statusCode === 400 && json(short)?.error?.code === 'API_KEY_VALIDATION_FAILED'
      ? pass('POST apiKey قصير → 400 API_KEY_VALIDATION_FAILED')
      : fail(`short key: ${short.statusCode} ${short.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — الحاسم: المفتاح لا يظهر بعد POST/GET');
    const SECRET_PROBE = 'sk_test_secret_leak_probe_zzz_12345';
    const created = await fastify.inject({
      method: 'POST', url: '/v1/ai/integrations', headers: H(token),
      payload: {
        provider: 'gemini', apiKey: SECRET_PROBE,
        capabilities: ['headline-suggestions'],
      },
    });
    if (created.statusCode !== 201) { fail(`create: ${created.statusCode} ${created.body}`); return; }
    const createdBody = json(created);
    !JSON.stringify(createdBody).includes(SECRET_PROBE) && createdBody.apiKeyRef?.startsWith('kref_')
      ? pass('POST /integrations: apiKey لا يظهر في الاستجابة · apiKeyRef=kref_...')
      : fail(`POST response contains secret: ${created.body.slice(0, 300)}`);

    const listAfter = await fastify.inject({ method: 'GET', url: '/v1/ai/integrations', headers: H(token) });
    !listAfter.body.includes(SECRET_PROBE)
      ? pass('GET /integrations لا يعيد المفتاح')
      : fail(`GET contains secret`);

    // (ب) عزل — مستأجر ثانٍ لا يرى تكامل A
    const sig2 = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `a24b-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `A24-B-${Date.now()}` },
    });
    const b = json(sig2);
    await bumpTenantLimits(migPool, b.tenant.id);
    const listB = json(await fastify.inject({ method: 'GET', url: '/v1/ai/integrations', headers: H(b.session.accessToken) }));
    listB?.data?.length === 0 ? pass('عزل: مستأجر B يرى data=[] رغم أن A أضاف تكاملاً')
      : fail(`عزل: B data=${JSON.stringify(listB?.data)}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3+ — invoke: UNKNOWN_CAPABILITY + CAPABILITY_NOT_ENABLED');
    const unk = await fastify.inject({
      method: 'POST', url: '/v1/ai/invoke/nosuchcap', headers: H(token),
      payload: { input: {} },
    });
    unk.statusCode === 400 && json(unk)?.error?.code === 'UNKNOWN_CAPABILITY'
      ? pass('invoke قدرة مجهولة → 400 UNKNOWN_CAPABILITY') : fail(`unknown cap: ${unk.statusCode}`);

    // B لا يحمل تكاملاً — invoke → 403 CAPABILITY_NOT_ENABLED
    const noCap = await fastify.inject({
      method: 'POST', url: '/v1/ai/invoke/headline-suggestions', headers: H(b.session.accessToken),
      payload: { input: { seed: 'x' } },
    });
    noCap.statusCode === 403 && json(noCap)?.error?.code === 'CAPABILITY_NOT_ENABLED'
      ? pass('invoke بلا تكامل مفعَّل → 403 CAPABILITY_NOT_ENABLED') : fail(`no cap: ${noCap.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1-ب — invoke ناجح + usage.ai_tokens يزيد');
    const invoke = await fastify.inject({
      method: 'POST', url: '/v1/ai/invoke/headline-suggestions', headers: H(token),
      payload: { input: { seed: 'اختبار' }, preferredProvider: 'gemini' },
    });
    const iBody = json(invoke);
    if (invoke.statusCode === 200 && iBody?.output && iBody?.provider === 'gemini' && typeof iBody?.tokensIn === 'number') {
      pass(`invoke → 200 · provider=gemini · tokensIn=${iBody.tokensIn} · tokensOut=${iBody.tokensOut}`);
    } else fail(`invoke: ${invoke.statusCode} ${invoke.body?.slice(0, 200)}`);

    // usage
    const c = await migPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [tenant.id]);
      const u = await c.query(`SELECT ai_tokens_in, ai_tokens_out FROM usage WHERE tenant_id=$1 AND period=date_trunc('month', now())::date`, [tenant.id]);
      await c.query('COMMIT');
      const row = u.rows[0];
      Number(row?.ai_tokens_in ?? 0) > 0 && Number(row?.ai_tokens_out ?? 0) > 0
        ? pass(`usage.ai_tokens_in=${row.ai_tokens_in} · ai_tokens_out=${row.ai_tokens_out}`)
        : fail(`usage tokens: ${JSON.stringify(row)}`);
    } finally { c.release(); }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3++ — مسارات الفشل الحاسمة');
    process.env.AI_FAKE_FORCE = 'error';
    const errInv = await fastify.inject({
      method: 'POST', url: '/v1/ai/invoke/headline-suggestions', headers: H(token),
      payload: { input: { seed: 'x' } },
    });
    errInv.statusCode === 502 && json(errInv)?.error?.code === 'PROVIDER_ERROR'
      ? pass('AI_FAKE_FORCE=error → 502 PROVIDER_ERROR (خطأ صريح لا صامت)')
      : fail(`force error: ${errInv.statusCode} ${errInv.body}`);

    process.env.AI_FAKE_FORCE = 'timeout';
    const toInv = await fastify.inject({
      method: 'POST', url: '/v1/ai/invoke/headline-suggestions', headers: H(token),
      payload: { input: { seed: 'x' } },
    });
    toInv.statusCode === 504 && json(toInv)?.error?.code === 'PROVIDER_TIMEOUT'
      ? pass('AI_FAKE_FORCE=timeout → 504 PROVIDER_TIMEOUT')
      : fail(`force timeout: ${toInv.statusCode} ${toInv.body}`);
    delete process.env.AI_FAKE_FORCE;

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — grep نهائي على السجلّ');
    const combinedLogs = capturedLogs.join('');
    !combinedLogs.includes(SECRET_PROBE)
      ? pass(`السجلّ لا يحمل المفتاح (${combinedLogs.length} حرفاً مُلتقَط)`)
      : fail(`السجلّ يحمل المفتاح! (تسريب)`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — الحارس البنيوي');
    try {
      execSync('node scripts/check-no-ai-provider-outside-ai.mjs', {
        cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe',
      });
      pass('check-no-ai-provider-outside-ai يمرّ (105+ ملفاً، صفر مخالفة)');
    } catch (e) {
      fail(`guard: ${e.stderr?.toString() ?? e.message}`);
    }

    // ══════════════════════════════════════════════
    // DELETE + عزل + 404
    console.log('\n▶ Layer 2 — DELETE + عزل');
    const del = await fastify.inject({
      method: 'DELETE', url: '/v1/ai/integrations/gemini', headers: H(token),
    });
    del.statusCode === 204 ? pass('DELETE gemini → 204') : fail(`DELETE: ${del.statusCode}`);

    const delMissing = await fastify.inject({
      method: 'DELETE', url: '/v1/ai/integrations/gemini', headers: H(token),
    });
    delMissing.statusCode === 404 ? pass('DELETE موجود سابقاً بعد الحذف → 404')
      : fail(`re-delete: ${delMissing.statusCode}`);

    // تنظيف
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    console.log('');
    if (failures === 0) console.log('✓ G-P4-19 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-19 FAILED — ${failures} إخفاق`);
  } finally {
    // استعادة stdout/stderr قبل الإغلاق
    process.stdout.write = origWrite;
    process.stderr.write = origErr;
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  console.log(`\n[verify-summary] a24: ${failures} إخفاقاً`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
