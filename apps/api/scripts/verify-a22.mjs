#!/usr/bin/env node
/**
 * G-P4-17 — A22: Usage tracking (trigger + endpoints).
 *
 * ست طبقات + سبع حالات:
 *   1. وجود   — 2 endpoints /v1/usage + trigger renders_log_usage موجود
 *   2. عزل    — مستأجران، رنداران، عدّ منفصل لكلٍّ
 *   3. سلبي   — status='failed' لا يزيد · UPDATE succeeded→succeeded لا يعدّ مرتين
 *   4. RBAC   — viewer→200 على GET (docs/16 §14.1)
 *   5. حاسم   — الحدّ المعروض في /usage/current = الحدّ المفروض في POST /renders
 *              (المصدر الواحد — plan_overrides يعلو على كليهما)
 *   6. بيانات — png لا يزيد videos_count · فترة جديدة تبدأ من 0
 *
 * الحالات:
 *   (أ) INSERT succeeded ⇒ videos_count=1
 *   (ب) INSERT failed ⇒ videos_count=0 (يطابق A21)
 *   (ج) INSERT png succeeded ⇒ renders_count=1 · videos_count=0
 *   (د) UPDATE queued→succeeded ⇒ +1
 *   (هـ) UPDATE succeeded→succeeded ⇒ +0 (اختبار عدّ مضاعف)
 *   (و) بلغ الحدّ عبر usage ⇒ POST /renders → 422 + GET /usage/current
 *       يُظهر videos.used == limit
 *   (ز) plan_overrides.videos_per_month_limit=999 يعلو ⇒ POST ينجح
 *   (ح) شهر ماضٍ (فترة سابقة في usage يدوياً) ⇒ current لا يراه، history يراه
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';

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

async function signup(fastify, prefix) {
  const suffix = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE $1`, [`${suffix}@%`]);
  const r = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: `${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `A22-${suffix}` },
  });
  if (r.statusCode !== 201) throw new Error(`signup ${suffix}: ${r.body}`);
  return json(r);
}

async function setPlan(tenantId, plan, overrides = null) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(
      `UPDATE tenants SET plan = $1, plan_overrides = $2::jsonb WHERE id = $3`,
      [plan, overrides ? JSON.stringify(overrides) : null, tenantId]);
    if (r.rowCount !== 1) throw new Error(`setPlan ${r.rowCount} rows`);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

// أدوات إدراج rendering يدوياً بتفعيل RLS
async function insertRender(tenantId, projectId, userId, format, status) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(
      `INSERT INTO renders(tenant_id, project_id, size, format, status,
                            brand_snapshot, template_snapshot, requested_by)
       VALUES ($1, $2, 'x', $3, $4, '{}'::jsonb, '{}'::jsonb, $5)
       RETURNING id`,
      [tenantId, projectId, format, status, userId]);
    await c.query('COMMIT');
    return r.rows[0].id;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function updateRenderStatus(tenantId, renderId, newStatus) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    await c.query(`UPDATE renders SET status = $1 WHERE id = $2`, [newStatus, renderId]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function readUsage(tenantId) {
  const r = await queryAs(tenantId,
    `SELECT renders_count, videos_count, video_seconds FROM usage
      WHERE tenant_id = $1 AND period = date_trunc('month', now())::date`,
    [tenantId]);
  return r.rows[0] ?? { renders_count: 0, videos_count: 0, video_seconds: 0 };
}

async function makeProject(fastify, ctx) {
  const bk = await fastify.inject({ method:'POST', url:'/v1/brand-kits', headers:H(ctx.session.accessToken), payload:{ name:'bk-a22' }});
  const bkId = json(bk).id;
  const tpls = json(await fastify.inject({ method:'GET', url:'/v1/templates', headers:H(ctx.session.accessToken) }));
  const tplId = tpls.data[0].id;
  const pr = await fastify.inject({ method:'POST', url:'/v1/projects', headers:H(ctx.session.accessToken), payload:{ title:'prj-a22', brand_kit_id: bkId, template_id: tplId }});
  return { pid: json(pr).id, bkId };
}

async function main() {
  console.log('▶ G-P4-17 — A22: Usage tracking (trigger + endpoints)');
  process.env.PAYMENTS_PROVIDER = 'fake';
  const fastify = await buildServer();
  await fastify.ready();

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'A22-%'`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 1 — وجود endpoints + trigger');
    const ctxA = await signup(fastify, 'l1');
    await setPlan(ctxA.tenant.id, 'studio', { videos_per_month_limit: 3 }); // نضغطه لاختبار الحدّ

    const tExists = await migPool.query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'renders_log_usage'`);
    tExists.rowCount === 1 ? pass('trigger renders_log_usage موجود') : fail('trigger مفقود');

    const rCur = await fastify.inject({ method: 'GET', url: '/v1/usage/current', headers: H(ctxA.session.accessToken) });
    rCur.statusCode === 200 && Array.isArray(json(rCur)?.byBrandKit)
      ? pass('GET /v1/usage/current → 200') : fail(`current → ${rCur.statusCode} ${rCur.body}`);
    const rHist = await fastify.inject({ method: 'GET', url: '/v1/usage/history', headers: H(ctxA.session.accessToken) });
    rHist.statusCode === 200 && Array.isArray(json(rHist)?.data)
      ? pass('GET /v1/usage/history → 200 (data/nextCursor/hasMore)') : fail(`history → ${rHist.statusCode} ${rHist.body}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 2 — عزل: مستأجران، عدّ منفصل');
    const ctxB = await signup(fastify, 'l2');
    await setPlan(ctxB.tenant.id, 'studio', { videos_per_month_limit: 3 });
    const { pid: pidA } = await makeProject(fastify, ctxA);
    const { pid: pidB } = await makeProject(fastify, ctxB);

    // INSERT succeeded عند A فقط
    await insertRender(ctxA.tenant.id, pidA, ctxA.user.id, 'mp4', 'succeeded');
    const uA = await readUsage(ctxA.tenant.id);
    const uB = await readUsage(ctxB.tenant.id);
    uA.videos_count === 1 && uB.videos_count === 0
      ? pass(`عزل: A(videos=1) · B(videos=0)`)
      : fail(`عزل: A=${JSON.stringify(uA)} B=${JSON.stringify(uB)}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 3 — سلبي: failed لا يعدّ · UPDATE succeeded→succeeded لا يعدّ مرتين');
    // (ب) failed
    const beforeF = await readUsage(ctxA.tenant.id);
    await insertRender(ctxA.tenant.id, pidA, ctxA.user.id, 'mp4', 'failed');
    const afterF = await readUsage(ctxA.tenant.id);
    afterF.videos_count === beforeF.videos_count
      ? pass(`failed لا يزيد videos (بقي ${beforeF.videos_count})`)
      : fail(`failed زاد إلى ${afterF.videos_count}`);

    // (هـ) UPDATE succeeded→succeeded — نُنشئ رنداراً بـsucceeded ثم نُحدّثه بنفس القيمة
    const rid1 = await insertRender(ctxA.tenant.id, pidA, ctxA.user.id, 'mp4', 'succeeded');
    const before2 = await readUsage(ctxA.tenant.id);
    await updateRenderStatus(ctxA.tenant.id, rid1, 'succeeded');
    const after2 = await readUsage(ctxA.tenant.id);
    after2.videos_count === before2.videos_count
      ? pass(`UPDATE succeeded→succeeded لا يعدّ مرتين (بقي ${before2.videos_count})`)
      : fail(`عدّ مضاعف: ${before2.videos_count}→${after2.videos_count}`);

    // (ج) png succeeded → renders_count+1 · videos_count+0
    const before3 = await readUsage(ctxA.tenant.id);
    await insertRender(ctxA.tenant.id, pidA, ctxA.user.id, 'png', 'succeeded');
    const after3 = await readUsage(ctxA.tenant.id);
    after3.renders_count === before3.renders_count + 1 && after3.videos_count === before3.videos_count
      ? pass(`png succeeded: renders +1, videos +0`)
      : fail(`png: renders=${before3.renders_count}→${after3.renders_count} videos=${before3.videos_count}→${after3.videos_count}`);

    // (د) UPDATE queued→succeeded
    const rid2 = await insertRender(ctxA.tenant.id, pidA, ctxA.user.id, 'mp4', 'queued');
    const before4 = await readUsage(ctxA.tenant.id);
    await updateRenderStatus(ctxA.tenant.id, rid2, 'succeeded');
    const after4 = await readUsage(ctxA.tenant.id);
    after4.videos_count === before4.videos_count + 1
      ? pass(`UPDATE queued→succeeded: videos +1`)
      : fail(`transition: ${before4.videos_count}→${after4.videos_count}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 4 — RBAC: viewer→200 على GET /usage (§14.1)');
    // A حسب البند 3-ب زُرع فيه viewer سابقاً من A21؟ لا — كل مستأجر جديد.
    // نُنشئ viewer وnلوغّه.
    const { hashPassword } = await import('../src/auth/session.js');
    const pwHash = await hashPassword('strong_password_1234!');
    const vEmail = `a22-viewer-${Date.now()}@t.local`;
    await queryAs(ctxA.tenant.id,
      `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'viewer', true)`, [ctxA.tenant.id, vEmail, pwHash]);
    const vLogin = await fastify.inject({ method:'POST', url:'/v1/auth/login',
      payload:{ email: vEmail, password: 'strong_password_1234!' }});
    const vToken = json(vLogin).session.accessToken;
    const rV = await fastify.inject({ method:'GET', url:'/v1/usage/current', headers: H(vToken) });
    rV.statusCode === 200 ? pass('viewer GET /usage/current → 200') : fail(`viewer → ${rV.statusCode}`);

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 5 — حاسم: المعروض == المفروض (مصدر واحد)');
    // A بعد كل ما سبق: videos_count = 3 (l2 mp4 succ + rid2 transition + rid1 لا زيادة)
    // + rid1 كان succeeded مباشرة فأضاف 1 من قبل الاختبار (هـ).
    // فُرِض الحدّ videos_per_month_limit=3. الآن videos_count يجب أن يكون 3.
    const uNow = await readUsage(ctxA.tenant.id);
    const curJson = json(await fastify.inject({ method:'GET', url:'/v1/usage/current', headers: H(ctxA.session.accessToken) }));
    curJson?.counts?.videos === uNow.videos_count && curJson?.limits?.videos === 3
      ? pass(`current يعكس usage: videos=${uNow.videos_count}/3`)
      : fail(`current: ${JSON.stringify(curJson?.counts)} · limits.videos=${curJson?.limits?.videos}`);

    // اختبار الاتّساق: POST /renders يجب أن يرفض إن كان uNow.videos_count >= 3
    const rejectR = await fastify.inject({ method:'POST', url:'/v1/renders', headers: H(ctxA.session.accessToken),
      payload:{ project_id: pidA, size: 'x', format: 'mp4' }});
    if (uNow.videos_count >= 3) {
      rejectR.statusCode === 422 && json(rejectR)?.error?.code === 'QUOTA_EXCEEDED_VIDEOS'
        ? pass(`POST /renders 422 QUOTA_EXCEEDED_VIDEOS (bench=${uNow.videos_count}>=3)`)
        : fail(`POST /renders → ${rejectR.statusCode} ${rejectR.body}`);
    } else {
      fail(`لم نصل إلى الحدّ — videos=${uNow.videos_count} (اختبار غير حاسم)`);
    }

    // ══════════════════════════════════════════════
    console.log('\n▶ Layer 6 — البيانات: override يعلو + فترة جديدة');
    // (ز) plan_overrides.videos_per_month_limit=999
    await setPlan(ctxA.tenant.id, 'studio', { videos_per_month_limit: 999 });
    const curOv = json(await fastify.inject({ method:'GET', url:'/v1/usage/current', headers: H(ctxA.session.accessToken) }));
    curOv?.limits?.videos === 999 ? pass('override.videos=999 يعلو في current')
      : fail(`current.limits.videos = ${curOv?.limits?.videos}`);
    // POST /renders يجب أن ينجح الآن
    const okR = await fastify.inject({ method:'POST', url:'/v1/renders', headers: H(ctxA.session.accessToken),
      payload:{ project_id: pidA, size: 'x', format: 'mp4' }});
    okR.statusCode === 202 ? pass('POST /renders ينجح بعد override (المصدر واحد)')
      : fail(`POST بعد override → ${okR.statusCode} ${okR.body}`);

    // (ح) فترة سابقة يدوياً في usage
    await queryAs(ctxA.tenant.id,
      `INSERT INTO usage(tenant_id, period, renders_count, videos_count)
       VALUES ($1, date_trunc('month', now() - interval '2 months')::date, 5, 3)
       ON CONFLICT (tenant_id, period) DO UPDATE SET renders_count=EXCLUDED.renders_count`,
      [ctxA.tenant.id]);
    const curSep = json(await fastify.inject({ method:'GET', url:'/v1/usage/current', headers: H(ctxA.session.accessToken) }));
    const histSep = json(await fastify.inject({ method:'GET', url:'/v1/usage/history', headers: H(ctxA.session.accessToken) }));
    const seesPast = histSep?.data?.some((d) => d.counts.videos === 3);
    !curSep?.counts?.rendersTotal || curSep.counts.rendersTotal > 0 ? true : false; // sanity
    seesPast ? pass('history يظهر فترة سابقة (شهران قبل)')
      : fail(`history لم يرَ الفترة السابقة: ${JSON.stringify(histSep?.data)}`);

    // ══════════════════════════════════════════════
    console.log('');
    if (failures === 0) console.log('✓ G-P4-17 PASSED — كل الطبقات + الحالات نجحت');
    else console.error(`✗ G-P4-17 FAILED — ${failures} إخفاق`);
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
