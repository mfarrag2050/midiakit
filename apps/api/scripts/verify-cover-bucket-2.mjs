#!/usr/bin/env node
/**
 * COVER-BUCKET-2 (docs 80-SYNC-AND-COVER + 60-UNCOVERED-RISK السلّة الثانية).
 *
 * يغلق «قبل الإطلاق العامّ» — 10 نقاط غير مغطّاة:
 *
 *   Platform control (2):
 *     1. DELETE /v1/platform/users/:id       — LAST_OWNER + RBAC + 204 نظيف
 *     2. POST   /v1/platform/auth/logout      — session تُبطَل فعلاً (401 بعد)
 *
 *   Revisions read paths (8 · مغطّى بـ4 اختبارات · كل واحد list+detail):
 *     3-4. GET /v1/users/:id/revisions      + /:revId
 *     5-6. GET /v1/projects/:id/revisions   + /:revId
 *     7-8. GET /v1/templates/:id/revisions  + /:revId
 *     9-10. GET /v1/assets/:id/revisions    + /:revId
 *
 * سلوك لا وجود:
 *   - GET list: §1.5 غلاف {data, nextCursor, hasMore} + عدد ≥ 2 (create+update)
 *   - GET detail: reconstructedState موجود + snapshot يحمل الحقول المتوقّعة
 *   - العزل: B → 404 على كليهما
 *   - REVISION_NOT_FOUND على revId عشوائيّ
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;
const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
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

async function setup(fastify) {
  const suffix = String(Date.now());
  const password = 'strong_password_1234!';

  // ── تنظيف ──
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'CB2-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'cb2-%'`);
  await migPool.query(`DELETE FROM platform_users WHERE email LIKE 'cb2-%'`);

  // ── tenant setup ──
  const signup = async (label) => {
    const email = `cb2-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password, tenantName: `CB2-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label}: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // موارد A + PATCH لخلق revisions
  const bkA = json(await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(a.session.accessToken),
    payload: { name: 'cb2-bk', config: {} },
  })).id;
  const tplA = json(await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(a.session.accessToken),
    payload: {
      name: 'cb2-tpl', kind: 'static',
      definition: { id: 't', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] },
    },
  })).id;
  const projA = json(await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(a.session.accessToken),
    payload: { title: 'cb2-prj', brand_kit_id: bkA, template_id: tplA },
  })).id;

  // user إضافيّ + PATCH لعمل revision
  const pwHash = await hashPassword(password);
  const userA2 = (await queryAs(a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'writer', true) RETURNING id`,
    [a.tenant.id, `cb2-w-${suffix}@t.local`, pwHash])).rows[0].id;
  await fastify.inject({
    method: 'PATCH', url: `/v1/users/${userA2}`, headers: H(a.session.accessToken),
    payload: { role: 'viewer' },
  });

  // PATCH bkA, tplA, projA لعمل revisions إضافيّة
  await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${bkA}`, headers: H(a.session.accessToken),
    payload: { name: 'cb2-bk-CHANGED' },
  });
  await fastify.inject({
    method: 'PATCH', url: `/v1/templates/${tplA}`, headers: H(a.session.accessToken),
    payload: { name: 'cb2-tpl-CHANGED' },
  });
  await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${projA}`, headers: H(a.session.accessToken),
    payload: { title: 'cb2-prj-CHANGED' },
  });

  // asset مباشرةً عبر migPool + PATCH faces لعمل revision
  const assetA = (await queryAs(a.tenant.id,
    `INSERT INTO assets(tenant_id, kind, storage_key, content_type, size_bytes,
                        filename, faces, finalized_at)
     VALUES ($1, 'image', 'cb2/test.jpg', 'image/jpeg', 1024, 'test.jpg',
             '[]'::jsonb, now()) RETURNING id`, [a.tenant.id])).rows[0].id;
  await fastify.inject({
    method: 'PATCH', url: `/v1/assets/${assetA}/faces`, headers: H(a.session.accessToken),
    payload: { faces: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] },
  });

  // ── platform setup — نستعمل getPlatformPool (control_plane_user)
  // لأنّ platform_users تحمل RLS على INSERT ──
  const platformPwHash = await hashPassword(password);
  const platformPool = getPlatformPool();
  const pc = await platformPool.connect();
  let owner1Id, owner2Id, viewerId;
  try {
    const o1 = await pc.query(
      `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
       VALUES ($1, $2, 'owner', true) RETURNING id`,
      [`cb2-owner1-${suffix}@t.local`, platformPwHash]);
    const o2 = await pc.query(
      `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
       VALUES ($1, $2, 'owner', true) RETURNING id`,
      [`cb2-owner2-${suffix}@t.local`, platformPwHash]);
    const v1 = await pc.query(
      `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
       VALUES ($1, $2, 'viewer', true) RETURNING id`,
      [`cb2-viewer-${suffix}@t.local`, platformPwHash]);
    owner1Id = o1.rows[0].id;
    owner2Id = o2.rows[0].id;
    viewerId = v1.rows[0].id;
  } finally { pc.release(); }

  const platformLogin = async (email) => {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/platform/auth/login', payload: { email, password },
    });
    if (r.statusCode !== 200) throw new Error(`platform login ${email}: ${r.body}`);
    return json(r).session.accessToken;
  };
  const owner1Token = await platformLogin(`cb2-owner1-${suffix}@t.local`);
  const owner2Token = await platformLogin(`cb2-owner2-${suffix}@t.local`);
  const viewerToken = await platformLogin(`cb2-viewer-${suffix}@t.local`);

  return {
    a, b, bkA, tplA, projA, userA2, assetA,
    owner1Id, owner2Id, viewerId,
    owner1Token, owner2Token, viewerToken,
    suffix,
  };
}

// ── 1) DELETE /v1/platform/users/:id ────────────────
async function test1_platformDelete(fastify, ctx) {
  console.log('\n▶ (١) DELETE /v1/platform/users/:id');

  // RBAC: viewer → 403
  const rRbac = await fastify.inject({
    method: 'DELETE', url: `/v1/platform/users/${ctx.viewerId}`,
    headers: H(ctx.viewerToken),
  });
  if (rRbac.statusCode === 403) pass(`(١) viewer → DELETE → 403`);
  else fail(`(١) RBAC: ${rRbac.statusCode} (متوقّع 403)`);

  // 204 نظيف: owner1 يحذف viewer
  const rOk = await fastify.inject({
    method: 'DELETE', url: `/v1/platform/users/${ctx.viewerId}`,
    headers: H(ctx.owner1Token),
  });
  if (rOk.statusCode === 204) pass(`(١) owner → DELETE viewer → 204`);
  else fail(`(١) delete viewer: ${rOk.statusCode}`);

  // تحقّق: viewer اختفى من DB
  const gone = (await migPool.query(
    `SELECT count(*)::int AS n FROM platform_users WHERE id = $1`, [ctx.viewerId])).rows[0].n;
  if (gone === 0) pass(`(١) viewer اختفى من platform_users`);
  else fail(`(١) viewer لا يزال موجوداً (count=${gone})`);

  // LAST_OWNER: عزل حسّاب — قد يوجد owners من اختبارات سابقة (verify-control-plane
  // مثلاً). نعطّلهم مؤقّتاً ليبقى owner1+owner2 وحدهما نشطَين. نستعيد في finally.
  const platformPool3 = getPlatformPool();
  const pc3 = await platformPool3.connect();
  let reactivateIds = [];
  try {
    // اجمع owners نشطَين ليسوا owners مِلْكيا
    const others = await pc3.query(
      `SELECT id FROM platform_users
       WHERE platform_role='owner' AND is_active=true AND id NOT IN ($1, $2)`,
      [ctx.owner1Id, ctx.owner2Id]);
    reactivateIds = others.rows.map((r) => r.id);
    if (reactivateIds.length > 0) {
      await pc3.query(
        `UPDATE platform_users SET is_active=false WHERE id = ANY($1::uuid[])`,
        [reactivateIds]);
      pass(`(١) عزل حسّاب: عطّلتُ ${reactivateIds.length} owner آخر مؤقّتاً`);
    } else {
      pass(`(١) عزل حسّاب: لا owners آخرين نشطَين (البيئة نظيفة)`);
    }

    // احذف owner2 — يبقى owner1 وحده
    const rDel2 = await fastify.inject({
      method: 'DELETE', url: `/v1/platform/users/${ctx.owner2Id}`,
      headers: H(ctx.owner1Token),
    });
    if (rDel2.statusCode !== 204) { fail(`(١) DELETE owner2: ${rDel2.statusCode}`); return; }

    // owner1 هو الأخير الآن — محاولة حذفه → 409 LAST_OWNER
    const rLast = await fastify.inject({
      method: 'DELETE', url: `/v1/platform/users/${ctx.owner1Id}`,
      headers: H(ctx.owner1Token),
    });
    if (rLast.statusCode === 409 && json(rLast)?.error?.code === 'LAST_OWNER') {
      pass(`(١) حذف آخر owner → 409 LAST_OWNER`);
    } else fail(`(١) LAST_OWNER: ${rLast.statusCode} ${json(rLast)?.error?.code}`);
  } finally {
    // استرجاع غير مشروط للـowners المعطَّلين
    if (reactivateIds.length > 0) {
      await pc3.query(
        `UPDATE platform_users SET is_active=true WHERE id = ANY($1::uuid[])`,
        [reactivateIds]);
    }
    pc3.release();
  }
}

// ── 2) POST /v1/platform/auth/logout ────────────────
async function test2_platformLogout(fastify, ctx) {
  console.log('\n▶ (٢) POST /v1/platform/auth/logout');

  // إعادة إنشاء owner للاختبار (السابق حُذف في §1)
  const password = 'strong_password_1234!';
  const suffix = ctx.suffix;
  const pwHash = await hashPassword(password);
  const platformPool2 = getPlatformPool();
  const pc2 = await platformPool2.connect();
  try {
    await pc2.query(
      `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
       VALUES ($1, $2, 'owner', true)`,
      [`cb2-logout-${suffix}@t.local`, pwHash]);
  } finally { pc2.release(); }
  const loginR = json(await fastify.inject({
    method: 'POST', url: '/v1/platform/auth/login',
    payload: { email: `cb2-logout-${suffix}@t.local`, password },
  }));
  const token = loginR.session.accessToken;

  // probe1: token يعمل
  const probe1 = await fastify.inject({
    method: 'GET', url: '/v1/platform/users', headers: H(token),
  });
  if (probe1.statusCode !== 200) { fail(`(٢) probe1 قبل logout: ${probe1.statusCode}`); return; }
  pass(`(٢) setup: session نشطة قبل logout`);

  // logout → 204
  const rLo = await fastify.inject({
    method: 'POST', url: '/v1/platform/auth/logout', headers: H(token),
  });
  if (rLo.statusCode === 204) pass(`(٢) logout → 204`);
  else { fail(`(٢) logout: ${rLo.statusCode}`); return; }

  // probe2: نفس token → 401 (session أُبطلت)
  const probe2 = await fastify.inject({
    method: 'GET', url: '/v1/platform/users', headers: H(token),
  });
  if (probe2.statusCode === 401) pass(`(٢) session أُبطلت → GET /platform/users بـtoken قديم = 401`);
  else fail(`(٢) session لا تزال نشطة: probe2=${probe2.statusCode} (متوقّع 401)`);
}

// ── دالة موحّدة لاختبار revisions GET (list + detail) ──
async function checkRevisionsFor(fastify, ctx, label, resource, resourceId) {
  console.log(`\n▶ (${label}) GET /v1/${resource}/:id/revisions + /:revId`);

  // GET list — §1.5 envelope
  const rList = await fastify.inject({
    method: 'GET', url: `/v1/${resource}/${resourceId}/revisions`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rList.statusCode !== 200) { fail(`(${label}) list: ${rList.statusCode}`); return; }
  const list = json(rList);
  // §1.5: {data, nextCursor, hasMore}
  const shapeOk = Array.isArray(list?.data)
    && 'nextCursor' in list && 'hasMore' in list
    && typeof list.hasMore === 'boolean';
  if (shapeOk) pass(`(${label}) list غلاف §1.5 صحيح + data.length=${list.data.length}`);
  else fail(`(${label}) list shape: ${JSON.stringify(Object.keys(list ?? {}))}`);

  // data.length ≥ 2 (create + update من setup)
  if ((list?.data?.length ?? 0) >= 2) pass(`(${label}) revisions ≥ 2 (create + update)`);
  else fail(`(${label}) توقّعنا ≥ 2 revisions، وجدنا ${list?.data?.length}`);

  // GET detail — reconstructedState + snapshot
  const revId = list.data[0].id;
  const rDetail = await fastify.inject({
    method: 'GET', url: `/v1/${resource}/${resourceId}/revisions/${revId}`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rDetail.statusCode !== 200) { fail(`(${label}) detail: ${rDetail.statusCode}`); return; }
  const detail = json(rDetail);
  if (detail?.reconstructedState && typeof detail.reconstructedState === 'object'
      && detail?.snapshot && detail?.id === revId) {
    pass(`(${label}) detail: reconstructedState + snapshot + id مطابق`);
  } else fail(`(${label}) detail shape: keys=${JSON.stringify(Object.keys(detail ?? {}))}`);

  // العزل: B → list → 404
  const rIsoList = await fastify.inject({
    method: 'GET', url: `/v1/${resource}/${resourceId}/revisions`,
    headers: H(ctx.b.session.accessToken),
  });
  if (rIsoList.statusCode === 404) pass(`(${label}) عزل: B → list → 404`);
  else fail(`(${label}) عزل list: ${rIsoList.statusCode}`);

  // العزل: B → detail → 404
  const rIsoDetail = await fastify.inject({
    method: 'GET', url: `/v1/${resource}/${resourceId}/revisions/${revId}`,
    headers: H(ctx.b.session.accessToken),
  });
  if (rIsoDetail.statusCode === 404) pass(`(${label}) عزل: B → detail → 404`);
  else fail(`(${label}) عزل detail: ${rIsoDetail.statusCode}`);

  // REVISION_NOT_FOUND
  const fakeRev = '00000000-0000-0000-0000-000000000000';
  const rNF = await fastify.inject({
    method: 'GET', url: `/v1/${resource}/${resourceId}/revisions/${fakeRev}`,
    headers: H(ctx.a.session.accessToken),
  });
  if (rNF.statusCode === 404 && json(rNF)?.error?.code === 'REVISION_NOT_FOUND') {
    pass(`(${label}) revId عشوائيّ → 404 REVISION_NOT_FOUND`);
  } else fail(`(${label}) revNF: ${rNF.statusCode} ${json(rNF)?.error?.code}`);
}

async function main() {
  console.log('▶ COVER-BUCKET-2 — 10 نقاط (platform + revisions read)');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await setup(fastify);
    await test1_platformDelete(fastify, ctx);
    await test2_platformLogout(fastify, ctx);
    await checkRevisionsFor(fastify, ctx, '٣-٤', 'users',     ctx.userA2);
    await checkRevisionsFor(fastify, ctx, '٥-٦', 'projects',  ctx.projA);
    await checkRevisionsFor(fastify, ctx, '٧-٨', 'templates', ctx.tplA);
    await checkRevisionsFor(fastify, ctx, '٩-١٠', 'assets',    ctx.assetA);
  } catch (e) {
    console.error('\n✗ Unexpected:', e);
    failures++;
  } finally {
    await fastify.close();
    await closeQueues();
    await closePool();
    await closePlatformPool();
    await migPool.end();
  }
  console.log(`\n[verify-summary] cover-bucket-2: ${failures} إخفاقاً`);
  if (failures === 0) console.log(`✓ COVER-BUCKET-2 PASSED`);
  else console.error(`✗ COVER-BUCKET-2 FAILED — ${failures} إخفاق`);
  process.exit(failures);
}
main();
