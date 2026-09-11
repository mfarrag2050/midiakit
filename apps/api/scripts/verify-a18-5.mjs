#!/usr/bin/env node
/**
 * G-P4-14 — A18.5: ربط العامل بالتخزين.
 *
 * الشرط الفريد (docs/17 §A18.5 + التذكرة): **عامل حقيقي في عملية
 * منفصلة** — لا عامل داخلي كما في G-P4-10 السابق.
 *
 * التسلسل الكامل:
 *   1. signup → tenant + token
 *   2. رفع خط IBM Plex Sans Arabic (فعلي، assets/fonts/) عبر
 *      upload-url + PUT + finalize (curl حقيقي على MinIO)
 *   3. brand kit عبر PATCH بـfonts.primary.assetId
 *   4. project + POST /v1/renders (queued في Redis)
 *   5. **spawn api-worker كعملية منفصلة**
 *   6. poll GET /renders/:id حتى succeeded (≤30s)
 *   7. GET /output + fetch → bytes حقيقية PNG
 *   8. تحقّق ظهور الخط في المخرَج (log line: [api-worker] font loaded)
 *   9. L-46: حذف الأصل من MinIO → renders ثانية → status=failed مع
 *      error_code=FONT_ASSET_FETCH_FAILED (أو FONT_ASSET_MISSING)
 */
import 'dotenv/config';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { getStorage } from '../src/storage/index.js';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }
function json(res) { try { return JSON.parse(res.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

async function queryAs(tenantId, sql, params = []) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A185Gate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'a185gate-%'`);

  const suffix = String(Date.now());
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `a185gate-${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A185Gate-${suffix}` },
  });
  if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
  return { ...json(r), suffix };
}

// ── رفع خط حقيقي (IBM Plex) ─────────────────────
async function uploadRealFont(fastify, ctx) {
  console.log('\n▶ Setup: رفع خط IBM Plex عبر API + PUT حقيقي على MinIO');

  const fontPath = join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf');
  const fontBytes = readFileSync(fontPath);
  console.log(`  · font file: ${fontPath} (${fontBytes.length} bytes)`);

  // upload-url
  const rUp = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url', headers: H(ctx.session.accessToken),
    payload: { kind: 'font', filename: 'IBMPlexSansArabic-Bold.ttf', sizeBytes: fontBytes.length, contentType: 'font/ttf' },
  });
  if (rUp.statusCode !== 200) throw new Error(`upload-url: ${rUp.body}`);
  const { assetId, uploadUrl } = json(rUp);

  // PUT حقيقي بـfetch على MinIO
  const putRes = await fetch(uploadUrl, {
    method: 'PUT', body: fontBytes, headers: { 'Content-Type': 'font/ttf' },
  });
  if (putRes.status !== 200) throw new Error(`PUT to MinIO: HTTP ${putRes.status}`);
  pass(`PUT حقيقي على MinIO: HTTP 200 (${fontBytes.length} bytes)`);

  // finalize (font يحتاج licenseAck=true + acknowledgedBy)
  const rFin = await fastify.inject({
    method: 'POST', url: `/v1/assets/${assetId}/finalize`, headers: H(ctx.session.accessToken),
    payload: { licenseAck: true, acknowledgedBy: ctx.user.id, meta: { label: 'IBM Plex Sans Arabic (Bold)' } },
  });
  if (rFin.statusCode !== 200) throw new Error(`finalize: ${rFin.body}`);
  pass(`finalize → 200 (assetId=${assetId.slice(0, 8)}...)`);

  return assetId;
}

// ── إنشاء brand kit بـassetId ──────────────────
async function setupBrandKitAndProject(fastify, ctx, fontAssetId) {
  console.log('\n▶ Setup: brand kit + project (font.assetId مرتبط)');

  const rBk = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(ctx.session.accessToken),
    payload: { name: 'a185-bk' },
  });
  if (rBk.statusCode !== 201) throw new Error(`bk: ${rBk.body}`);
  const bkId = json(rBk).id;

  // PATCH لإضافة assetId في fonts.primary
  // RFC 7396: patch shape = shape of config (لا wrap بـ`config`)
  const rPatch = await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${bkId}`, headers: H(ctx.session.accessToken),
    payload: { fonts: { primary: {
      family: 'IBMPlexSansArabicTest',   // اسم مميّز
      source: 'custom',
      assetId: fontAssetId,
    }}},
  });
  if (rPatch.statusCode !== 200) throw new Error(`patch bk: ${rPatch.body}`);
  const bk = json(rPatch);
  if (bk.config?.fonts?.primary?.assetId !== fontAssetId) {
    fail(`assetId لم يحفظ في config! got: ${bk.config?.fonts?.primary?.assetId}`);
  } else {
    pass(`brand kit config.fonts.primary.assetId مطابق (${fontAssetId.slice(0, 8)}...)`);
  }

  // template بسيط + project
  const rTpl = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.session.accessToken),
    payload: { name: 'a185-tpl', kind: 'static',
      definition: { id: 't', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] } },
  });
  const tplId = json(rTpl).id;

  const rPrj = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.session.accessToken),
    payload: { title: 'a185-prj', brand_kit_id: bkId, template_id: tplId },
  });
  const pid = json(rPrj).id;
  return { bkId, tplId, pid };
}

// ── تشغيل api-worker في عملية منفصلة ─────────────
function spawnWorker(env) {
  return new Promise((resolve, reject) => {
    const worker = spawn('node', ['--import', 'tsx', 'apps/renderer/src/api-worker.ts'], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const stdoutChunks = [];
    worker.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdoutChunks.push(s);
      if (!ready && s.includes('[api-worker] started')) {
        ready = true;
        resolve({ worker, stdoutChunks });
      }
    });
    worker.stderr.on('data', (chunk) => stdoutChunks.push(chunk.toString()));
    worker.on('error', reject);
    setTimeout(() => { if (!ready) reject(new Error('worker start timeout')); }, 10000);
  });
}

// ── التحقّق الرئيسي: end-to-end رندر حقيقي ───────
async function checkE2E(fastify, ctx) {
  console.log('\n▶ Layer 7 — E2E عبر عامل منفصل (لا داخلي)');

  const fontAssetId = await uploadRealFont(fastify, ctx);
  const { pid } = await setupBrandKitAndProject(fastify, ctx, fontAssetId);

  // POST /renders
  const rC = await fastify.inject({
    method: 'POST', url: '/v1/renders', headers: H(ctx.session.accessToken),
    payload: { project_id: pid, size: 'x', format: 'png' },
  });
  if (rC.statusCode !== 202) { fail(`create render: ${rC.statusCode}`); return; }
  const renderId = json(rC).id;
  pass(`POST /v1/renders → 202 (renderId=${renderId.slice(0, 8)}...)`);

  // spawn worker
  const { worker, stdoutChunks } = await spawnWorker({
    DATABASE_URL_APP: process.env.DATABASE_URL_APP,
    REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3',
    S3_ENDPOINT: 'http://127.0.0.1:19043',
    S3_BUCKET: 'mk-assets-dev',
    S3_ACCESS_KEY_ID: 'minioadmin',
    S3_SECRET_ACCESS_KEY: 'minioadmin',
  });
  pass(`api-worker spawned في عملية منفصلة (PID ${worker.pid})`);

  try {
    // poll for succeeded
    let status = 'queued';
    let attempts = 0;
    while (status !== 'succeeded' && status !== 'failed' && attempts < 30) {
      await sleep(1000);
      const r = await fastify.inject({
        method: 'GET', url: `/v1/renders/${renderId}`, headers: H(ctx.session.accessToken),
      });
      status = json(r)?.status;
      attempts++;
    }
    if (status === 'succeeded') {
      pass(`(أ) رندر حقيقي: status='succeeded' بعد ${attempts}s (عامل منفصل)`);
    } else {
      fail(`رندر لم ينجح: status=${status} بعد ${attempts}s. Worker stdout:\n${stdoutChunks.join('').slice(-1500)}`);
      return;
    }

    // تحقّق (ب) — log line يُثبت أن الخط تُحمِّل من التخزين
    const stdout = stdoutChunks.join('');
    if (stdout.includes(`[api-worker] font loaded: family=IBMPlexSansArabicTest`) &&
        stdout.includes(`.font`)) {
      pass(`(ب) log line "[api-worker] font loaded" يُثبت تحميل من التخزين (لا fallback)`);
    } else {
      fail(`لا log line للـfont load. stdout:\n${stdout.slice(-800)}`);
    }

    // (ج) GET /output + fetch حقيقي
    const rOut = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId}/output`, headers: H(ctx.session.accessToken),
    });
    if (rOut.statusCode !== 200) { fail(`output: ${rOut.statusCode}`); return; }
    const outputUrl = json(rOut).url;
    const dl = await fetch(outputUrl);
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 1000) {
      pass(`(ج) GET output → fetch حقيقي → PNG (${buf.length} بايت، header صحيح)`);
    } else fail(`output bytes bad: len=${buf.length}, first=${buf.slice(0, 4).toString('hex')}`);

    // (د) L-46: حذف الأصل من MinIO ⇒ رندر ثانية يفشل صراحةً
    console.log('\n  ─── (د) L-46: حذف الأصل من MinIO، رندر ثانية يجب أن يفشل ───');
    // storage_key
    const skRow = await queryAs(ctx.tenant.id,
      `SELECT storage_key FROM assets WHERE id = $1`, [fontAssetId]);
    const storageKey = skRow.rows[0].storage_key;
    await getStorage().deleteObject(storageKey);
    console.log(`  · deleted ${storageKey} from MinIO`);

    // رندر ثانية
    const rC2 = await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(ctx.session.accessToken),
      payload: { project_id: pid, size: 'x', format: 'png' },
    });
    const renderId2 = json(rC2).id;

    let status2 = 'queued', attempts2 = 0;
    while (status2 !== 'succeeded' && status2 !== 'failed' && attempts2 < 15) {
      await sleep(1000);
      const r = await fastify.inject({
        method: 'GET', url: `/v1/renders/${renderId2}`, headers: H(ctx.session.accessToken),
      });
      status2 = json(r)?.status;
      attempts2++;
    }
    // نجلب الـerror
    const rFinal = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId2}`, headers: H(ctx.session.accessToken),
    });
    const finalBody = json(rFinal);
    if (status2 === 'failed' && finalBody?.error?.code?.startsWith('FONT_')) {
      pass(`(د) L-46: رندر مع أصل محذوف → status=failed error.code=${finalBody.error.code}`);
    } else {
      fail(`L-46 didn't fire: status=${status2} error=${JSON.stringify(finalBody?.error)}`);
    }
  } finally {
    worker.kill('SIGTERM');
    await sleep(500);
  }
}

// ── البند 4: revisions على tenants (platform actor) ──
async function checkPlatformRevisions(fastify) {
  console.log('\n▶ البند 4 — PATCH /v1/platform/tenants/:id ⇒ revision بفاعل غير فارغ');

  const suffix = String(Date.now());
  // ننشئ platform user (owner) عبر control_plane_user pool
  const { hashPassword } = await import('../src/auth/session.js');
  const { getPlatformPool } = await import('../src/db.js');
  const pwHash = await hashPassword('strong_password_1234!');
  const ppool = getPlatformPool();
  const pc = await ppool.connect();
  let platformUserId;
  try {
    const pu = await pc.query(
      `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
       VALUES ($1, $2, 'owner', true) RETURNING id`,
      [`a185-plat-${suffix}@t.local`, pwHash]);
    platformUserId = pu.rows[0].id;
  } finally { pc.release(); }

  // login
  const rLogin = await fastify.inject({
    method: 'POST', url: '/v1/platform/auth/login',
    payload: { email: `a185-plat-${suffix}@t.local`, password: 'strong_password_1234!' },
  });
  if (rLogin.statusCode !== 200) { fail(`platform login: ${rLogin.body}`); return; }
  const platToken = json(rLogin).session.accessToken;

  // ننشئ tenant للتعديل عليه
  const rSignup = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `a185-target-${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A185Gate-Target-${suffix}` },
  });
  const targetTid = json(rSignup).tenant.id;

  // نعدّ revisions قبل
  const before = await queryAs(targetTid,
    `SELECT count(*)::int AS n FROM revisions WHERE resource_type='tenant' AND resource_id=$1`,
    [targetTid]);

  // PATCH via platform
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/platform/tenants/${targetTid}`, headers: H(platToken),
    payload: { plan: 'studio' },
  });
  if (rP.statusCode !== 200) { fail(`platform patch: ${rP.body}`); return; }

  // نعدّ revisions بعد
  const after = await queryAs(targetTid,
    `SELECT actor_id, action FROM revisions WHERE resource_type='tenant' AND resource_id=$1 ORDER BY created_at DESC LIMIT 3`,
    [targetTid]);
  const patchRev = after.rows.find((r) => r.action === 'update');
  if (patchRev && patchRev.actor_id === platformUserId) {
    pass(`revisions.action='update' مضاف بـactor_id=platform_user (${platformUserId.slice(0, 8)}...)`);
  } else fail(`platform revision: found=${JSON.stringify(after.rows)}`);

  // تنظيف
  await migPool.query(`DELETE FROM platform_users WHERE id = $1`, [platformUserId]);
}

async function main() {
  console.log('▶ G-P4-14 — A18.5: ربط العامل بالتخزين');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await cleanupAndSeed(fastify);
    await checkE2E(fastify, ctx);
    await checkPlatformRevisions(fastify);
  } finally {
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.query(`UPDATE tenants SET plan = 'trial' WHERE name LIKE 'A185Gate-%'`);
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A185Gate-%'`);
    await migPool.query(`DELETE FROM platform_users WHERE email LIKE 'a185-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'a185%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-14 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-14 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
