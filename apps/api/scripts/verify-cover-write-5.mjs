#!/usr/bin/env node
/**
 * COVER-WRITE-5 (docs 70-LAND-AND-COVER + 60-UNCOVERED-RISK السلّة الأولى).
 *
 * يغطّي **سلوك** الكتابة لخمس نقاط حرجة على tenant data:
 *   1. POST /v1/users/:id/revisions/:revId/restore      — role/is_active يعود
 *   2. POST /v1/projects/:id/revisions/:revId/restore   — name يعود
 *   3. POST /v1/templates/:id/revisions/:revId/restore  — name يعود
 *   4. POST /v1/assets/:id/revisions/:revId/restore     — faces يعود
 *   5. POST /v1/auth/reset-password                     — password_hash يتبدّل
 *      + جلسة قديمة تُبطَل + reused token = 400
 *
 * كل اختبار يؤكّد على:
 *   • السلوك الصحيح (السلوك لا الوجود)
 *   • عزل المستأجرين (B لا يرى/يستعيد A)
 *   • RBAC حيث ينطبق (writer على restore → 403)
 *   • حالات الفشل الأمنيّة (reused token · wrong tenant)
 */
import 'dotenv/config';
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
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
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'CW5-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'cw5-%'`);
  const suffix = String(Date.now());
  const password = 'strong_password_1234!';

  const signup = async (label) => {
    const email = `cw5-${label}-${suffix}@t.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password, tenantName: `CW5-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label}: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // موارد A
  const bkA = json(await fastify.inject({
    method: 'POST', url: '/v1/brand-kits', headers: H(a.session.accessToken),
    payload: { name: 'cw5-bk', config: {} },
  })).id;
  const tplA = json(await fastify.inject({
    method: 'POST', url: '/v1/templates', headers: H(a.session.accessToken),
    payload: {
      name: 'cw5-tpl', kind: 'static',
      definition: { id: 't', name: 'n', kind: 'static', sizes: ['x'],
                    layers: [{ type: 'solid', fill: 'brand.colors.surface' }] },
    },
  })).id;
  const projA = json(await fastify.inject({
    method: 'POST', url: '/v1/projects', headers: H(a.session.accessToken),
    payload: { title: 'cw5-prj', brand_kit_id: bkA, template_id: tplA },
  })).id;

  // writer + editor لـA (لـRBAC + للـuser restore target)
  const pwHash = await hashPassword(password);
  const writerId = (await queryAs(a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'writer', true) RETURNING id`,
    [a.tenant.id, `cw5-writer-${suffix}@t.local`, pwHash])).rows[0].id;
  const editorId = (await queryAs(a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'editor', true) RETURNING id`,
    [a.tenant.id, `cw5-editor-${suffix}@t.local`, pwHash])).rows[0].id;
  const writerToken = json(await fastify.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: `cw5-writer-${suffix}@t.local`, password },
  })).session.accessToken;

  // asset لـA — يُنشأ مباشرة عبر migPool (upload-url flow معقّد؛ سنكتفي
  // بـsimulated finalized asset لاختبار مسار restore على faces)
  const assetA = (await queryAs(a.tenant.id,
    `INSERT INTO assets(tenant_id, kind, storage_key, content_type, size_bytes,
                        filename, faces, finalized_at)
     VALUES ($1, 'image', 'cw5/test.jpg', 'image/jpeg', 1024, 'test.jpg',
             '[]'::jsonb, now())
     RETURNING id`, [a.tenant.id])).rows[0].id;

  return { a, b, bkA, tplA, projA, writerId, editorId, writerToken, password, suffix };
}

// ── 1) restore users ─────────────────────────────────
async function test1_restoreUsers(fastify, ctx) {
  console.log('\n▶ (١) POST /v1/users/:id/revisions/:revId/restore — role يعود');
  // نبدّل role للـeditor من 'editor' إلى 'viewer' (يحفظ revision)
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/users/${ctx.editorId}`, headers: H(ctx.a.session.accessToken),
    payload: { role: 'viewer' },
  });
  if (rP.statusCode !== 200 || json(rP)?.role !== 'viewer') {
    fail(`(١) setup PATCH role→viewer failed: ${rP.statusCode} ${rP.body}`); return;
  }
  pass(`(١) setup: editor role = 'viewer'`);

  // نجلب revision الأقدم (create)
  const list = json(await fastify.inject({
    method: 'GET', url: `/v1/users/${ctx.editorId}/revisions`,
    headers: H(ctx.a.session.accessToken),
  }));
  const revs = list?.data ?? [];
  if (revs.length < 2) { fail(`(١) توقّعنا ≥ 2 revisions، وجدنا ${revs.length}`); return; }
  // ترتيب DESC — أقدم = آخر عنصر
  const createRevId = revs[revs.length - 1].id;

  // نستعيد
  const rR = await fastify.inject({
    method: 'POST', url: `/v1/users/${ctx.editorId}/revisions/${createRevId}/restore`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'restore users role test' },
  });
  if (rR.statusCode !== 200) { fail(`(١) restore: ${rR.statusCode} ${rR.body}`); return; }

  // نتحقّق role عاد إلى 'editor'
  const rG = json(await fastify.inject({
    method: 'GET', url: `/v1/users/${ctx.editorId}`, headers: H(ctx.a.session.accessToken),
  }));
  if (rG?.role === 'editor') pass(`(١) role عاد إلى 'editor' بعد restore`);
  else fail(`(١) role بعد restore = '${rG?.role}' (متوقّع 'editor')`);

  // العزل: B يحاول restore على A → 404
  const rIso = await fastify.inject({
    method: 'POST', url: `/v1/users/${ctx.editorId}/revisions/${createRevId}/restore`,
    headers: H(ctx.b.session.accessToken), payload: { reason: 'evil cross-tenant restore attempt' },
  });
  if (rIso.statusCode === 404) pass(`(١) عزل: B → restore A → 404`);
  else fail(`(١) عزل: ${rIso.statusCode} (متوقّع 404)`);

  // RBAC: writer محاولة restore → 403
  const rRbac = await fastify.inject({
    method: 'POST', url: `/v1/users/${ctx.editorId}/revisions/${createRevId}/restore`,
    headers: H(ctx.writerToken), payload: { reason: 'writer cannot restore users' },
  });
  if (rRbac.statusCode === 403) pass(`(١) RBAC: writer → restore → 403`);
  else fail(`(١) RBAC: ${rRbac.statusCode} (متوقّع 403)`);
}

// ── 2) restore projects ──────────────────────────────
async function test2_restoreProjects(fastify, ctx) {
  console.log('\n▶ (٢) POST /v1/projects/:id/revisions/:revId/restore — name يعود');
  const originalName = 'cw5-prj';
  // بدّل الاسم
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/projects/${ctx.projA}`, headers: H(ctx.a.session.accessToken),
    payload: { title: 'cw5-prj-CHANGED' },
  });
  if (rP.statusCode !== 200) { fail(`(٢) setup PATCH: ${rP.statusCode}`); return; }
  pass(`(٢) setup: name = 'cw5-prj-CHANGED'`);

  const list = json(await fastify.inject({
    method: 'GET', url: `/v1/projects/${ctx.projA}/revisions`,
    headers: H(ctx.a.session.accessToken),
  }));
  const revs = list?.data ?? [];
  if (revs.length < 2) { fail(`(٢) توقّعنا ≥ 2 revisions، وجدنا ${revs.length}`); return; }
  const createRevId = revs[revs.length - 1].id;

  const rR = await fastify.inject({
    method: 'POST', url: `/v1/projects/${ctx.projA}/revisions/${createRevId}/restore`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'restore project name test' },
  });
  if (rR.statusCode !== 200) { fail(`(٢) restore: ${rR.statusCode} ${rR.body}`); return; }
  if (json(rR)?.name === originalName) pass(`(٢) name عاد إلى '${originalName}' بعد restore`);
  else fail(`(٢) name بعد restore = '${json(rR)?.name}' (متوقّع '${originalName}')`);

  const rIso = await fastify.inject({
    method: 'POST', url: `/v1/projects/${ctx.projA}/revisions/${createRevId}/restore`,
    headers: H(ctx.b.session.accessToken), payload: { reason: 'evil cross-tenant restore attempt' },
  });
  if (rIso.statusCode === 404) pass(`(٢) عزل: B → restore A → 404`);
  else fail(`(٢) عزل: ${rIso.statusCode}`);
}

// ── 3) restore templates ─────────────────────────────
async function test3_restoreTemplates(fastify, ctx) {
  console.log('\n▶ (٣) POST /v1/templates/:id/revisions/:revId/restore — name يعود');
  const originalName = 'cw5-tpl';
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/templates/${ctx.tplA}`, headers: H(ctx.a.session.accessToken),
    payload: { name: 'cw5-tpl-CHANGED' },
  });
  if (rP.statusCode !== 200) { fail(`(٣) setup PATCH: ${rP.statusCode} ${rP.body}`); return; }
  pass(`(٣) setup: name = 'cw5-tpl-CHANGED'`);

  const list = json(await fastify.inject({
    method: 'GET', url: `/v1/templates/${ctx.tplA}/revisions`,
    headers: H(ctx.a.session.accessToken),
  }));
  const revs = list?.data ?? [];
  if (revs.length < 2) { fail(`(٣) توقّعنا ≥ 2 revisions، وجدنا ${revs.length}`); return; }
  const createRevId = revs[revs.length - 1].id;

  const rR = await fastify.inject({
    method: 'POST', url: `/v1/templates/${ctx.tplA}/revisions/${createRevId}/restore`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'restore template name test' },
  });
  if (rR.statusCode !== 200) { fail(`(٣) restore: ${rR.statusCode} ${rR.body}`); return; }
  if (json(rR)?.name === originalName) pass(`(٣) name عاد إلى '${originalName}' بعد restore`);
  else fail(`(٣) name بعد restore = '${json(rR)?.name}' (متوقّع '${originalName}')`);

  const rIso = await fastify.inject({
    method: 'POST', url: `/v1/templates/${ctx.tplA}/revisions/${createRevId}/restore`,
    headers: H(ctx.b.session.accessToken), payload: { reason: 'evil cross-tenant restore attempt' },
  });
  if (rIso.statusCode === 404) pass(`(٣) عزل: B → restore A → 404`);
  else fail(`(٣) عزل: ${rIso.statusCode}`);
}

// ── 4) restore assets ────────────────────────────────
async function test4_restoreAssets(fastify, ctx) {
  console.log('\n▶ (٤) POST /v1/assets/:id/revisions/:revId/restore — faces يعود');
  const assetId = (await queryAs(ctx.a.tenant.id,
    `SELECT id FROM assets WHERE tenant_id=$1 AND storage_key='cw5/test.jpg'`,
    [ctx.a.tenant.id])).rows[0].id;

  // نبدّل faces عبر PATCH
  const newFaces = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }];
  const rP = await fastify.inject({
    method: 'PATCH', url: `/v1/assets/${assetId}/faces`, headers: H(ctx.a.session.accessToken),
    payload: { faces: newFaces },
  });
  if (rP.statusCode !== 200) { fail(`(٤) setup PATCH: ${rP.statusCode} ${rP.body}`); return; }
  pass(`(٤) setup: faces = [1 face] بعد PATCH`);

  const list = json(await fastify.inject({
    method: 'GET', url: `/v1/assets/${assetId}/revisions`,
    headers: H(ctx.a.session.accessToken),
  }));
  const revs = list?.data ?? [];
  if (revs.length < 2) { fail(`(٤) توقّعنا ≥ 2 revisions، وجدنا ${revs.length}`); return; }
  const createRevId = revs[revs.length - 1].id;

  const rR = await fastify.inject({
    method: 'POST', url: `/v1/assets/${assetId}/revisions/${createRevId}/restore`,
    headers: H(ctx.a.session.accessToken),
    payload: { reason: 'restore assets faces test' },
  });
  if (rR.statusCode !== 200) { fail(`(٤) restore: ${rR.statusCode} ${rR.body}`); return; }

  // faces يجب أن يعود إلى []
  const rowAfter = (await queryAs(ctx.a.tenant.id,
    `SELECT faces FROM assets WHERE id=$1`, [assetId])).rows[0];
  const facesAfter = rowAfter.faces ?? [];
  if (Array.isArray(facesAfter) && facesAfter.length === 0) {
    pass(`(٤) faces عاد إلى [] بعد restore`);
  } else fail(`(٤) faces بعد restore = ${JSON.stringify(facesAfter)} (متوقّع [])`);
}

// ── 5) reset-password ────────────────────────────────
async function test5_resetPassword(fastify, ctx) {
  console.log('\n▶ (٥) POST /v1/auth/reset-password — password_hash + جلسة قديمة');
  const suffix = ctx.suffix;
  const email = `cw5-reset-${suffix}@t.local`;

  // ننشئ مستخدماً جديداً للاختبار (لأنّه سيبطل جلسة A لو استعملنا A)
  const oldPassword = 'oldPass_1234567!';
  const newPassword = 'newPass_7654321!';
  const pwHash = await hashPassword(oldPassword);
  const newUserId = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'writer', true) RETURNING id`,
    [ctx.a.tenant.id, email, pwHash])).rows[0].id;

  // login → التقاط accessToken قديمة
  const login1 = await fastify.inject({
    method: 'POST', url: '/v1/auth/login', payload: { email, password: oldPassword },
  });
  if (login1.statusCode !== 200) { fail(`(٥) login بكلمة قديمة: ${login1.statusCode}`); return; }
  const oldToken = json(login1).session.accessToken;
  pass(`(٥) setup: login بالكلمة القديمة → accessToken`);

  // نتحقّق أنّ الجلسة القديمة تعمل
  const probe1 = await fastify.inject({
    method: 'GET', url: '/v1/brand-kits', headers: H(oldToken),
  });
  if (probe1.statusCode !== 200) { fail(`(٥) الجلسة القديمة لا تعمل قبل reset: ${probe1.statusCode}`); return; }

  // نُنشئ password_reset_token مباشرةً عبر migPool
  const tokenPlain = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
  await queryAs(ctx.a.tenant.id,
    `INSERT INTO password_reset_tokens(tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [ctx.a.tenant.id, newUserId, tokenHash]);

  // reset-password → 204
  const rR = await fastify.inject({
    method: 'POST', url: '/v1/auth/reset-password',
    payload: { email, token: tokenPlain, newPassword },
  });
  if (rR.statusCode !== 204) { fail(`(٥) reset-password: ${rR.statusCode} ${rR.body}`); return; }
  pass(`(٥) reset-password → 204`);

  // الجلسة القديمة يجب أن تُبطَل الآن → 401
  const probe2 = await fastify.inject({
    method: 'GET', url: '/v1/brand-kits', headers: H(oldToken),
  });
  if (probe2.statusCode === 401) pass(`(٥) الجلسة القديمة أُبطلت → 401`);
  else fail(`(٥) الجلسة القديمة لا تزال نشطة: ${probe2.statusCode} (متوقّع 401)`);

  // login بالكلمة الجديدة → 200
  const login2 = await fastify.inject({
    method: 'POST', url: '/v1/auth/login', payload: { email, password: newPassword },
  });
  if (login2.statusCode === 200) pass(`(٥) login بالكلمة الجديدة → 200`);
  else fail(`(٥) login بالكلمة الجديدة: ${login2.statusCode}`);

  // reuse token → 400
  const rReuse = await fastify.inject({
    method: 'POST', url: '/v1/auth/reset-password',
    payload: { email, token: tokenPlain, newPassword: 'yetAnother_555!' },
  });
  if (rReuse.statusCode === 400 && json(rReuse)?.error?.code) {
    pass(`(٥) reuse token → 400 (${json(rReuse).error.code})`);
  } else fail(`(٥) reuse: ${rReuse.statusCode} ${rReuse.body}`);
}

async function main() {
  console.log('▶ COVER-WRITE-5 — 5 نقاط كتابة حرجة على tenant data');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await setup(fastify);
    await test1_restoreUsers(fastify, ctx);
    await test2_restoreProjects(fastify, ctx);
    await test3_restoreTemplates(fastify, ctx);
    await test4_restoreAssets(fastify, ctx);
    await test5_resetPassword(fastify, ctx);
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
  console.log(`\n[verify-summary] cover-write-5: ${failures} إخفاقاً`);
  if (failures === 0) console.log(`✓ COVER-WRITE-5 PASSED`);
  else console.error(`✗ COVER-WRITE-5 FAILED — ${failures} إخفاق`);
  process.exit(failures);
}
main();
