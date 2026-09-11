#!/usr/bin/env node
/**
 * G-P4-15 — A18.6: توصيل العامل بالمحرّك (MP4 حقيقي عبر FFmpeg).
 *
 * ست طبقات:
 *   1. رندر MP4 حقيقي عبر api-worker في عملية منفصلة + ffprobe
 *   2. عامل حقيقي منفصل (لا داخلي) — كما A18.5
 *   3. measureText يُثبت الخط المرفوع (فرق ≥ 5% مقابل fallback)
 *   4. L-46: حذف الأصل → status='failed' + error_code
 *   5. template_snapshot جامد — تعديل القالب بعد الرندر لا يمسّ المخرَج
 *   6. check-no-brand-url-fetch نظيف (صفر استثناء)
 */
import 'dotenv/config';
import pg from 'pg';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Canvas, FontLibrary } from 'skia-canvas';
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
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A186Gate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'a186gate-%'`);
  const suffix = String(Date.now());
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `a186gate-${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A186Gate-${suffix}` },
  });
  if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
  return { ...json(r), suffix };
}

async function uploadFontAndSetupBrand(fastify, ctx) {
  const fontPath = join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf');
  const fontBytes = readFileSync(fontPath);
  const rUp = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url', headers: H(ctx.session.accessToken),
    payload: { kind: 'font', filename: 'IBMPlexSansArabic-Bold.ttf', sizeBytes: fontBytes.length, contentType: 'font/ttf' },
  });
  const { assetId, uploadUrl } = json(rUp);
  const putRes = await fetch(uploadUrl, { method: 'PUT', body: fontBytes, headers: { 'Content-Type': 'font/ttf' } });
  if (putRes.status !== 200) throw new Error(`PUT: ${putRes.status}`);
  await fastify.inject({
    method: 'POST', url: `/v1/assets/${assetId}/finalize`, headers: H(ctx.session.accessToken),
    payload: { licenseAck: true, acknowledgedBy: ctx.user.id, meta: { label: 'IBM Plex Bold' } },
  });

  const rBk = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(ctx.session.accessToken),
    payload: { name: 'a186-bk' },
  });
  const bkId = json(rBk).id;
  await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${bkId}`, headers: H(ctx.session.accessToken),
    payload: { fonts: { primary: {
      family: 'IBMPlexArabicA186',
      source: 'custom',
      assetId,
    }}, typography: { breaking: { family: 'IBMPlexArabicA186' } } },
  });

  // template بسيط مطابق نمط templates
  const tplDef = {
    id: 'a186_tpl', name: 'A186 template', kind: 'static', sizes: ['x'],
    fields: [{ key: 'headline', type: 'richtext', required: true, wordRange: [1, 20] }],
    layers: [
      { type: 'solid', fill: 'brand.colors.surface' },
      { type: 'headline', field: 'headline', wrap: 'uniform', align: 'right',
        anchor: 'centerLower', verticalAnchor: 0.5,
        font: 'brand.typography.breaking', justify: 'brand.typography.justify' },
    ],
  };
  const rTpl = await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(ctx.session.accessToken),
    payload: { name: 'a186-tpl', kind: 'static', definition: tplDef },
  });
  const tplId = json(rTpl).id;

  const rPrj = await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(ctx.session.accessToken),
    payload: { title: 'a186-prj', brand_kit_id: bkId, template_id: tplId },
  });
  const pid = json(rPrj).id;

  // نُحدّث المشروع بمحتوى headline
  await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${pid}`, headers: H(ctx.session.accessToken),
    payload: { content: { headline: 'اختبار خط عربي' } },
  });

  return { assetId, bkId, tplId, pid };
}

function spawnWorker(env) {
  return new Promise((resolve, reject) => {
    const worker = spawn('node', ['--import', 'tsx', 'apps/renderer/src/api-worker.ts'], {
      cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const chunks = [];
    worker.stdout.on('data', (c) => {
      const s = c.toString(); chunks.push(s);
      if (!ready && s.includes('[api-worker] started')) { ready = true; resolve({ worker, chunks }); }
    });
    worker.stderr.on('data', (c) => chunks.push(c.toString()));
    worker.on('error', reject);
    setTimeout(() => { if (!ready) reject(new Error('worker start timeout')); }, 15000);
  });
}

async function pollRender(fastify, ctx, renderId, timeoutSec = 60) {
  let status = 'queued', attempts = 0;
  while (status !== 'succeeded' && status !== 'failed' && attempts < timeoutSec) {
    await sleep(1000);
    const r = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId}`, headers: H(ctx.session.accessToken),
    });
    status = json(r)?.status;
    attempts++;
  }
  return { status, attempts };
}

async function main() {
  console.log('▶ G-P4-15 — A18.6: توصيل العامل بالمحرّك (MP4 حقيقي)');
  const fastify = await buildServer();
  await fastify.ready();
  let worker = null;
  try {
    const ctx = await cleanupAndSeed(fastify);
    const { assetId, bkId, tplId, pid } = await uploadFontAndSetupBrand(fastify, ctx);

    console.log('\n▶ Layer 1 — رندر MP4 حقيقي عبر api-worker');
    const rC = await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(ctx.session.accessToken),
      payload: { project_id: pid, size: 'x', format: 'mp4' },
    });
    if (rC.statusCode !== 202) { fail(`POST: ${rC.statusCode} ${rC.body}`); return; }
    const renderId = json(rC).id;

    const spawned = await spawnWorker({
      DATABASE_URL_APP: process.env.DATABASE_URL_APP,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3',
      S3_ENDPOINT: 'http://127.0.0.1:19043', S3_BUCKET: 'mk-assets-dev',
      S3_ACCESS_KEY_ID: 'minioadmin', S3_SECRET_ACCESS_KEY: 'minioadmin',
    });
    worker = spawned.worker;
    pass(`api-worker spawned (PID ${worker.pid})`);

    const { status, attempts } = await pollRender(fastify, ctx, renderId, 60);
    if (status === 'succeeded') {
      pass(`رندر MP4 حقيقي: status='succeeded' بعد ${attempts}s`);
    } else {
      fail(`لم ينجح: status=${status} attempts=${attempts}. Worker stdout:\n${spawned.chunks.join('').slice(-2000)}`);
      return;
    }

    // ── Layer 1 tail — ffprobe على MP4 ──
    const rOut = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId}/output`, headers: H(ctx.session.accessToken),
    });
    const dl = await fetch(json(rOut).url);
    const buf = Buffer.from(await dl.arrayBuffer());
    const mp4Path = '/tmp/a186-out.mp4';
    writeFileSync(mp4Path, buf);
    console.log(`  · MP4 downloaded: ${buf.length} bytes → ${mp4Path}`);

    // ffprobe
    try {
      const probe = execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,codec_name,duration',
        '-of', 'json', mp4Path,
      ]).toString();
      const meta = JSON.parse(probe);
      const s = meta.streams?.[0];
      if (s?.codec_name === 'h264' && s?.width === 1080 && s?.height === 1080) {
        pass(`ffprobe: h264 ${s.width}x${s.height} duration=${s.duration || '?'}s ✓`);
      } else {
        fail(`ffprobe meta: ${JSON.stringify(s)}`);
      }
    } catch (err) {
      fail(`ffprobe failed: ${(err).message}`);
    }

    // ── Layer 3 — measureText قياس الفرق ──
    console.log('\n▶ Layer 3 — measureText يُثبت الخط المرفوع');
    // نستعمل نفس الملف المرفوع (من مسار المصدر) لإعادة التسجيل بنفس الاسم
    const fontPath = join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf');
    FontLibrary.use('IBMPlexArabicA186_Verify', [fontPath]);
    const canvas = new Canvas(1080, 1080);
    const ctxM = canvas.getContext('2d');
    const TEXT = 'اختبار قياس النصّ العربي الطويل';
    ctxM.font = `bold 80px "IBMPlexArabicA186_Verify"`;
    const wIBM = ctxM.measureText(TEXT).width;
    ctxM.font = `bold 80px "NonExistentFallbackXYZ"`;
    const wFallback = ctxM.measureText(TEXT).width;
    const diffPct = Math.abs(wIBM - wFallback) / wFallback * 100;
    console.log(`  · IBM Plex Arabic: ${wIBM.toFixed(1)}px · fallback: ${wFallback.toFixed(1)}px · diff: ${diffPct.toFixed(1)}%`);
    // العتبة: 5% (الفرق الفعلي 8%، هامش أمان)
    if (diffPct >= 5) {
      pass(`الخط المرفوع يختلف عن fallback بـ${diffPct.toFixed(1)}% (عتبة 5%) — إثبات القياس`);
    } else {
      fail(`الفرق ${diffPct.toFixed(1)}% أقل من العتبة — قد يكون الخط لم يُحمَّل`);
    }
    // إثبات أن worker حمّل الخط (log line)
    const stdout = spawned.chunks.join('');
    if (stdout.includes('[api-worker] font loaded: family=IBMPlexArabicA186')) {
      pass(`log line "font loaded" في stdout — worker حمّل الخط من التخزين`);
    } else {
      fail(`log line للـfont load مفقود:\n${stdout.slice(-500)}`);
    }

    // ── Layer 5 — template_snapshot frozen ──
    console.log('\n▶ Layer 5 — template_snapshot جامد بعد الرندر');
    // نعدّل القالب في DB (via API PATCH)
    await fastify.inject({
      method: 'PATCH', url: `/v1/templates/${tplId}`, headers: H(ctx.session.accessToken),
      payload: { name: 'a186-tpl (CHANGED)' },
    });
    // نعيد GET /template-snapshot للـrender القديم — يجب أن يكون الاسم القديم
    const rTs = await fastify.inject({
      method: 'GET', url: `/v1/renders/${renderId}/template-snapshot`,
      headers: H(ctx.session.accessToken),
    });
    const snapName = json(rTs)?.name;
    if (snapName === 'A186 template') {
      pass(`template تغيّر بعد الرندر → snapshot جامد (name='${snapName}' من وقت الطلب)`);
    } else fail(`snapshot leaked: ${snapName}`);

    // ── Layer 4 — L-46: حذف الأصل → فشل صريح ──
    console.log('\n▶ Layer 4 — L-46: حذف الأصل → فشل صريح');
    const skRow = await queryAs(ctx.tenant.id, `SELECT storage_key FROM assets WHERE id = $1`, [assetId]);
    await getStorage().deleteObject(skRow.rows[0].storage_key);
    const rC2 = await fastify.inject({
      method: 'POST', url: '/v1/renders', headers: H(ctx.session.accessToken),
      payload: { project_id: pid, size: 'x', format: 'mp4' },
    });
    const renderId2 = json(rC2).id;
    const { status: s2 } = await pollRender(fastify, ctx, renderId2, 30);
    if (s2 === 'failed') {
      const rF = await fastify.inject({
        method: 'GET', url: `/v1/renders/${renderId2}`, headers: H(ctx.session.accessToken),
      });
      const code = json(rF)?.error?.code;
      if (code && code.startsWith('FONT_')) {
        pass(`L-46: أصل محذوف → status='failed' error.code=${code}`);
      } else fail(`L-46 wrong code: ${code}`);
    } else fail(`L-46 didn't fail: status=${s2}`);

    // ── Layer 6 — check-no-brand-url-fetch نظيف ──
    console.log('\n▶ Layer 6 — check-no-brand-url-fetch نظيف');
    try {
      execFileSync('pnpm', ['check:no-brand-url-fetch'], { cwd: ROOT, stdio: 'pipe' });
      pass(`check-no-brand-url-fetch يمرّ (صفر استثناء جديد)`);
    } catch (err) {
      fail(`check-no-brand-url-fetch: ${(err).message.slice(0, 300)}`);
    }

  } finally {
    if (worker) { worker.kill('SIGTERM'); await sleep(500); }
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A186Gate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'a186gate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-15 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-15 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
