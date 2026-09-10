#!/usr/bin/env node
/**
 * G-P4-6 — بوابة Assets (docs/17 §A11، docs/16 §9).
 *
 * سبع طبقات + حالات خاصّة:
 *   1. وجود   — 8 endpoints (docs/16 §9.1–§9.8) عبر fastify.inject
 *   2. عزل    — كل method من مستأجر آخر → 404
 *   3. سلبي   — 9 أكواد أخطاء (§9)
 *   4. RBAC   — editor/viewer على مسارات writer+/admin+ → 403
 *   5. L-58   — grants app_user على assets (SEC-1 القائمة)
 *   6. حاسم   — DISABLE RLS على assets → تسريب → ENABLE+FORCE
 *   7. الحدّ   — PUT/GET حقيقيان خارج العملية على presigned URLs:
 *              (أ) رفع → finalize → قراءة publicUrl → تطابق بايتات
 *              (ب) رابط منتهي الصلاحية ⇒ يُرفض (S3 signature)
 *              (ج) رابط لمفتاح مُعدَّل ⇒ يُرفض (signature bound to key)
 *              يتخطّى بحرص إن كان STORAGE_DRIVER=memory (لا شبكة).
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool } from '../src/db.js';
import { getStorage } from '../src/storage/index.js';
import { config } from '../src/config.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }
function json(res) { try { return JSON.parse(res.body); } catch { return null; } }
const H = (token) => ({ authorization: `Bearer ${token}` });

/** استعلام migration_user مع SET LOCAL app.tenant_id (RLS مفعَّل + FORCE). */
async function queryAs(tenantId, sql, params = []) {
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'AsstGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'asstgate-%'`);

  const suffix = String(Date.now());
  const pwHash = await hashPassword('strong_password_1234!');

  const signup = async (label) => {
    const email = `asstgate-${label}-${suffix}@test.local`;
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email, password: 'strong_password_1234!', tenantName: `AsstGate-${label}-${suffix}` },
    });
    if (r.statusCode !== 201) throw new Error(`signup ${label} failed: ${r.body}`);
    return { ...json(r), email };
  };
  const a = await signup('A');
  const b = await signup('B');

  // إضافة writer + editor في مستأجر A (اختبار RBAC)
  const roleUsers = {};
  const client = await migPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [a.tenant.id]);
    for (const role of ['writer', 'editor']) {
      const email = `asstgate-${role}-${suffix}@test.local`;
      const r = await client.query(
        `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [a.tenant.id, email, pwHash, role],
      );
      roleUsers[role] = { userId: r.rows[0].id, email };
    }
    await client.query('COMMIT');
  } finally { client.release(); }

  for (const role of Object.keys(roleUsers)) {
    const r = await fastify.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { email: roleUsers[role].email, password: 'strong_password_1234!' },
    });
    if (r.statusCode !== 200) throw new Error(`login ${role} failed: ${r.body}`);
    roleUsers[role].token = json(r).session.accessToken;
  }

  return { a, b, roleUsers };
}

// ── Layer 1 ─────────────────────────────────────────────────────
async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (8 endpoints كالعقد)');

  // 1. upload-url (kind=image)
  const rUp = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'image', filename: 'photo.png', sizeBytes: 1024, contentType: 'image/png' },
  });
  const upBody = json(rUp);
  if (rUp.statusCode === 200 && upBody?.assetId && upBody?.uploadUrl && upBody?.expiresAt && upBody?.maxSizeBytes) {
    pass(`POST /v1/assets/upload-url → 200 {assetId, uploadUrl, expiresAt, maxSizeBytes}`);
  } else fail(`upload-url → ${rUp.statusCode}: ${rUp.body}`);
  ctx.imageAssetId = upBody?.assetId;
  ctx.imageStorageKey = null;

  // نستخرج storage_key من DB (memory driver لا يعرضه في الرابط)
  const kRow = await queryAs(ctx.a.tenant.id, `SELECT storage_key FROM assets WHERE id = $1`, [ctx.imageAssetId]);
  ctx.imageStorageKey = kRow.rows[0]?.storage_key;
  if (!ctx.imageStorageKey) throw new Error('L1: storage_key not found for imageAssetId');

  // نُحاكي رفع العميل (memory driver — putObjectRaw مباشرة)
  await getStorage().putObjectRaw(ctx.imageStorageKey, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');

  // 2. finalize
  const rFin = await fastify.inject({
    method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/finalize`,
    headers: H(ctx.a.session.accessToken),
    payload: { meta: { label: 'photo alpha' } },
  });
  const finBody = json(rFin);
  if (rFin.statusCode === 200 && finBody?.id === ctx.imageAssetId && finBody?.publicUrl && finBody?.finalizedAt) {
    pass(`POST /v1/assets/:id/finalize → 200 مع publicUrl + finalizedAt`);
  } else fail(`finalize → ${rFin.statusCode}: ${rFin.body}`);

  // 3. list
  const rL = await fastify.inject({ method: 'GET', url: '/v1/assets', headers: H(ctx.a.session.accessToken) });
  const lB = json(rL);
  if (rL.statusCode === 200 && Array.isArray(lB?.data) && lB.data.length >= 1) {
    pass(`GET /v1/assets → 200 (${lB.data.length} أصل)`);
  } else fail(`list → ${rL.statusCode}: ${rL.body}`);

  // بلا publicUrl في القائمة (§9.3)
  const noUrlInList = lB?.data?.every(it => !('publicUrl' in it));
  if (noUrlInList) pass(`القائمة بلا publicUrl (§9.3 صراحةً)`);
  else fail(`القائمة تحتوي publicUrl — يخالف §9.3`);

  // 4. GET :id (مع publicUrl)
  const rG = await fastify.inject({
    method: 'GET', url: `/v1/assets/${ctx.imageAssetId}`, headers: H(ctx.a.session.accessToken),
  });
  const gB = json(rG);
  if (rG.statusCode === 200 && gB?.publicUrl) pass(`GET /v1/assets/:id → 200 مع publicUrl`);
  else fail(`get :id → ${rG.statusCode}`);

  // 5. refresh-url
  const rR = await fastify.inject({
    method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/refresh-url`, headers: H(ctx.a.session.accessToken),
  });
  const rB = json(rR);
  if (rR.statusCode === 200 && rB?.publicUrl && rB?.expiresAt) pass(`POST /v1/assets/:id/refresh-url → 200`);
  else fail(`refresh → ${rR.statusCode}`);

  // 6. detect-faces (بند مؤجَّل — يعيد faces:[])
  const rDF = await fastify.inject({
    method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/detect-faces`, headers: H(ctx.a.session.accessToken),
  });
  const dfB = json(rDF);
  if (rDF.statusCode === 200 && Array.isArray(dfB?.faces)) pass(`POST /v1/assets/:id/detect-faces → 200 (بند مؤجَّل — faces:[])`);
  else fail(`detect-faces → ${rDF.statusCode}`);

  // 7. patch-faces
  const rPF = await fastify.inject({
    method: 'PATCH', url: `/v1/assets/${ctx.imageAssetId}/faces`,
    headers: H(ctx.a.session.accessToken),
    payload: { faces: [{ x: 0.3, y: 0.4, w: 0.2, h: 0.25 }] },
  });
  const pfB = json(rPF);
  // A11-SHAPE: faces صار داخل meta (§9.2). كان top-level.
  if (rPF.statusCode === 200 && Array.isArray(pfB?.meta?.faces) && pfB.meta.faces.length === 1) {
    pass(`PATCH /v1/assets/:id/faces → 200 مع meta.faces مُخزَّنة (§9.2)`);
  } else fail(`patch-faces → ${rPF.statusCode}: ${rPF.body}`);

  // 8. DELETE (سنستعمل أصلاً منفصلاً لأن imageAssetId قد نحتاجه لاحقاً)
  const rUp2 = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'image', filename: 'todelete.png', sizeBytes: 100, contentType: 'image/png' },
  });
  const del2Id = json(rUp2)?.assetId;
  const rD = await fastify.inject({
    method: 'DELETE', url: `/v1/assets/${del2Id}`, headers: H(ctx.a.session.accessToken),
  });
  if (rD.statusCode === 204) pass(`DELETE /v1/assets/:id → 204`);
  else fail(`delete → ${rD.statusCode}: ${rD.body}`);
}

// ── Layer 2 ─────────────────────────────────────────────────────
async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل (كل method من مستأجر B على أصل A → 404)');

  const cases = [
    { method: 'GET', url: `/v1/assets/${ctx.imageAssetId}` },
    { method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/finalize`, payload: {} },
    { method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/refresh-url` },
    { method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/detect-faces` },
    { method: 'PATCH', url: `/v1/assets/${ctx.imageAssetId}/faces`, payload: { faces: [] } },
    { method: 'DELETE', url: `/v1/assets/${ctx.imageAssetId}` },
  ];

  for (const c of cases) {
    const r = await fastify.inject({ ...c, headers: H(ctx.b.session.accessToken) });
    if (r.statusCode === 404 && json(r)?.error?.code === 'NOT_FOUND') {
      pass(`${c.method} /v1/assets/<A-id> من B → 404 NOT_FOUND`);
    } else fail(`${c.method} isolation: expected 404، got ${r.statusCode} ${r.body?.slice(0, 120)}`);
  }
}

// ── Layer 3 ─────────────────────────────────────────────────────
async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي + حالات خاصّة');

  // UNSUPPORTED_KIND
  const rBK = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'invalid_kind', filename: 'x.png', sizeBytes: 10, contentType: 'image/png' },
  });
  if (rBK.statusCode === 400 && json(rBK)?.error?.code === 'UNSUPPORTED_KIND') pass(`UNSUPPORTED_KIND → 400`);
  else fail(`UNSUPPORTED_KIND: ${rBK.statusCode} ${json(rBK)?.error?.code}`);

  // UNSUPPORTED_CONTENT_TYPE_FOR_KIND (image kind بـpdf)
  const rCT = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'image', filename: 'x.pdf', sizeBytes: 10, contentType: 'application/pdf' },
  });
  if (rCT.statusCode === 400 && json(rCT)?.error?.code === 'UNSUPPORTED_CONTENT_TYPE_FOR_KIND') pass(`UNSUPPORTED_CONTENT_TYPE_FOR_KIND → 400`);
  else fail(`UNSUPPORTED_CT: ${rCT.statusCode} ${json(rCT)?.error?.code}`);

  // SIZE_TOO_LARGE (> 500 MB)
  const rSize = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'video', filename: 'huge.mp4', sizeBytes: 600 * 1024 * 1024, contentType: 'video/mp4' },
  });
  if (rSize.statusCode === 413 && json(rSize)?.error?.code === 'SIZE_TOO_LARGE') pass(`SIZE_TOO_LARGE → 413`);
  else fail(`SIZE_TOO_LARGE: ${rSize.statusCode} ${json(rSize)?.error?.code}`);

  // UPLOAD_NOT_COMPLETED (finalize بدون رفع)
  const rDraft = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'image', filename: 'not-yet.png', sizeBytes: 10, contentType: 'image/png' },
  });
  const draftId = json(rDraft)?.assetId;
  const rUC = await fastify.inject({
    method: 'POST', url: `/v1/assets/${draftId}/finalize`, headers: H(ctx.a.session.accessToken), payload: {},
  });
  if (rUC.statusCode === 404 && json(rUC)?.error?.code === 'UPLOAD_NOT_COMPLETED') pass(`UPLOAD_NOT_COMPLETED → 404`);
  else fail(`UPLOAD_NOT_COMPLETED: ${rUC.statusCode} ${json(rUC)?.error?.code}`);

  // LICENSE_ACK_MUST_BE_TRUE (font بلا licenseAck)
  const rFont = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'font', filename: 'arabic.ttf', sizeBytes: 50000, contentType: 'font/ttf' },
  });
  const fontId = json(rFont)?.assetId;
  const fontKey = (await queryAs(ctx.a.tenant.id, `SELECT storage_key FROM assets WHERE id = $1`, [fontId])).rows[0].storage_key;
  await getStorage().putObjectRaw(fontKey, Buffer.from('fake-font-data'), 'font/ttf');
  const rLA = await fastify.inject({
    method: 'POST', url: `/v1/assets/${fontId}/finalize`, headers: H(ctx.a.session.accessToken), payload: {},
  });
  if (rLA.statusCode === 422 && json(rLA)?.error?.code === 'LICENSE_ACK_MUST_BE_TRUE') pass(`font بلا licenseAck → 422 LICENSE_ACK_MUST_BE_TRUE`);
  else fail(`LICENSE_ACK: ${rLA.statusCode} ${json(rLA)?.error?.code}`);

  // INVALID_SVG_WITH_TEXT_WARNING
  const rSvg = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'svg', filename: 'logo.svg', sizeBytes: 200, contentType: 'image/svg+xml' },
  });
  const svgId = json(rSvg)?.assetId;
  const svgKey = (await queryAs(ctx.a.tenant.id, `SELECT storage_key FROM assets WHERE id = $1`, [svgId])).rows[0].storage_key;
  await getStorage().putObjectRaw(svgKey, '<svg><text>عنوان غير محوَّل</text></svg>', 'image/svg+xml');
  const rSW = await fastify.inject({
    method: 'POST', url: `/v1/assets/${svgId}/finalize`, headers: H(ctx.a.session.accessToken), payload: {},
  });
  if (rSW.statusCode === 400 && json(rSW)?.error?.code === 'INVALID_SVG_WITH_TEXT_WARNING') pass(`SVG بنصّ غير مقرَّاً → 400 INVALID_SVG_WITH_TEXT_WARNING`);
  else fail(`SVG_TEXT: ${rSW.statusCode} ${json(rSW)?.error?.code}`);

  // نفس الأصل مع acknowledgedWarnings ⇒ يمرّ
  const rSW2 = await fastify.inject({
    method: 'POST', url: `/v1/assets/${svgId}/finalize`,
    headers: H(ctx.a.session.accessToken),
    payload: { acknowledgedWarnings: ['SVG_HAS_TEXT'] },
  });
  if (rSW2.statusCode === 200 && Array.isArray(json(rSW2)?.warnings)) pass(`إعادة finalize مع acknowledgedWarnings ⇒ 200 مع warnings مُخزَّنة`);
  else fail(`SVG ack: ${rSW2.statusCode} ${rSW2.body}`);

  // INVALID_FILTER_FIELD
  const rIF = await fastify.inject({
    method: 'GET', url: '/v1/assets?filter[nonexistent]=x', headers: H(ctx.a.session.accessToken),
  });
  if (rIF.statusCode === 400 && json(rIF)?.error?.code === 'INVALID_FILTER_FIELD') pass(`INVALID_FILTER_FIELD → 400`);
  else fail(`INVALID_FILTER_FIELD: ${rIF.statusCode} ${json(rIF)?.error?.code}`);

  // INVALID_KIND_VALUE (filter[kind]=xyz)
  const rIK = await fastify.inject({
    method: 'GET', url: '/v1/assets?filter[kind]=xyz', headers: H(ctx.a.session.accessToken),
  });
  if (rIK.statusCode === 400 && json(rIK)?.error?.code === 'INVALID_KIND_VALUE') pass(`INVALID_KIND_VALUE → 400`);
  else fail(`INVALID_KIND_VALUE: ${rIK.statusCode} ${json(rIK)?.error?.code}`);

  // ASSET_IN_USE_BY_BRAND_KIT — نُنشئ brand_kit في A يشير إلى imageAssetId عبر assetId
  const bkId = (await queryAs(ctx.a.tenant.id,
    `INSERT INTO brand_kits(tenant_id, name, config)
     VALUES ($1, 'gate-bk', jsonb_build_object('logo', jsonb_build_object('assetId', $2::text, 'url', 'x', 'size', 1, 'margin', 1, 'position', 'top-right', 'watermark', jsonb_build_object())))
     RETURNING id`,
    [ctx.a.tenant.id, ctx.imageAssetId],
  )).rows[0].id;
  const rInUse = await fastify.inject({
    method: 'DELETE', url: `/v1/assets/${ctx.imageAssetId}`, headers: H(ctx.a.session.accessToken),
  });
  if (rInUse.statusCode === 409 && json(rInUse)?.error?.code === 'ASSET_IN_USE_BY_BRAND_KIT') pass(`DELETE أصل مُشار إليه → 409 ASSET_IN_USE_BY_BRAND_KIT`);
  else fail(`IN_USE: ${rInUse.statusCode} ${json(rInUse)?.error?.code}`);

  // filter[inUse]=true — يجب أن يرى imageAssetId
  const rInList = await fastify.inject({
    method: 'GET', url: '/v1/assets?filter[inUse]=true', headers: H(ctx.a.session.accessToken),
  });
  const inList = json(rInList)?.data ?? [];
  if (rInList.statusCode === 200 && inList.some(it => it.id === ctx.imageAssetId)) {
    pass(`filter[inUse]=true → يظهر imageAssetId (assetId مطابق في brand_kits.config)`);
  } else fail(`filter[inUse]=true: got ${inList.length} items`);

  // تنظيف
  await queryAs(ctx.a.tenant.id, `DELETE FROM brand_kits WHERE id = $1`, [bkId]);
}

// ── Layer 4 ─────────────────────────────────────────────────────
async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC (editor على writer+ = 403؛ writer على admin+ delete = 403)');

  const writerToken = ctx.roleUsers.writer.token;
  const editorToken = ctx.roleUsers.editor.token;

  // editor على writer+ (upload-url + finalize + detect + patch)
  const writerPlusCases = [
    { method: 'POST', url: '/v1/assets/upload-url', payload: { kind: 'image', filename: 'x.png', sizeBytes: 10, contentType: 'image/png' } },
    { method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/finalize`, payload: {} },
    { method: 'POST', url: `/v1/assets/${ctx.imageAssetId}/detect-faces` },
    { method: 'PATCH', url: `/v1/assets/${ctx.imageAssetId}/faces`, payload: { faces: [] } },
  ];
  for (const c of writerPlusCases) {
    const r = await fastify.inject({ ...c, headers: H(editorToken) });
    if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
      pass(`editor ${c.method} ${c.url.split('/')[3]} → 403 INSUFFICIENT_ROLE`);
    } else fail(`editor ${c.method}: expected 403, got ${r.statusCode} ${json(r)?.error?.code}`);
  }

  // writer على admin+ (delete)
  const rWD = await fastify.inject({
    method: 'DELETE', url: `/v1/assets/${ctx.imageAssetId}`, headers: H(writerToken),
  });
  if (rWD.statusCode === 403 && json(rWD)?.error?.code === 'INSUFFICIENT_ROLE') {
    pass(`writer DELETE → 403 INSUFFICIENT_ROLE`);
  } else fail(`writer DELETE: expected 403, got ${rWD.statusCode}`);

  // editor على viewer+ (list + get) → 200 (كل مصادَق يقرأ)
  const rEL = await fastify.inject({ method: 'GET', url: '/v1/assets', headers: H(editorToken) });
  if (rEL.statusCode === 200) pass(`editor GET /v1/assets → 200 (viewer+ لكل مصادَق)`);
  else fail(`editor GET list → ${rEL.statusCode}`);
}

// ── Layer 5 ─────────────────────────────────────────────────────
async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58 (grants app_user على assets)');
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee='app_user' AND table_schema='public' AND table_name='assets'
     ORDER BY privilege_type`,
  );
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`assets: [${perms.join(', ')}] — يطابق SEC-1 القائمة`);
  } else fail(`assets grants: expected [${expected.join(',')}], got [${perms.join(', ')}]`);
}

// ── Layer 6 ─────────────────────────────────────────────────────
async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — تعطيل RLS على assets (الحاسم)');

  // baseline: A لا يرى شيئاً من B
  const rBase = await fastify.inject({
    method: 'GET', url: '/v1/assets', headers: H(ctx.b.session.accessToken),
  });
  const baseB = json(rBase)?.data ?? [];
  const bSees = baseB.length;
  pass(`baseline: B يرى ${bSees} أصل (كلها لـB)`);

  // نُدخل صفّاً في A من migPool ثم نعطّل RLS ونطلب من B
  const APP_URL = process.env.DATABASE_URL_APP;
  await migPool.query(`ALTER TABLE assets DISABLE ROW LEVEL SECURITY`);
  try {
    const appPool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      const c = await appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT app_set_tenant($1::uuid)', [ctx.b.tenant.id]);
        const r = await c.query(`SELECT count(*)::int AS n FROM assets WHERE tenant_id != $1`, [ctx.b.tenant.id]);
        await c.query('COMMIT');
        if ((r.rows[0]?.n ?? 0) >= 1) {
          pass(`بلا RLS على assets: B يرى ≥1 صف من A (تسريب — الحاجز مفتوح)`);
        } else fail(`بلا RLS assets: got ${r.rows[0]?.n} صفوف لغير-B، متوقع ≥1`);
      } finally { c.release(); }
    } finally { await appPool.end(); }
  } finally {
    await migPool.query(`ALTER TABLE assets ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE assets FORCE ROW LEVEL SECURITY`);
  }

  // استعادة
  const rAfter = await fastify.inject({
    method: 'GET', url: '/v1/assets', headers: H(ctx.b.session.accessToken),
  });
  const afterB = json(rAfter)?.data ?? [];
  if (afterB.length === bSees) pass(`بعد ENABLE+FORCE: B يرى ${afterB.length} أصل مرة أخرى (تطابق baseline)`);
  else fail(`استعادة فاشلة — قبل ${bSees}، بعد ${afterB.length}`);
}

// ── Layer 7 — الحدّ الخارجي (PUT/GET حقيقيان) ─────────────────────
async function checkExternalHTTP(fastify, ctx) {
  console.log('\n▶ Layer 7 — PUT/GET حقيقيان خارج العملية (STORAGE_DRIVER=' + config.STORAGE_DRIVER + ')');

  if (config.STORAGE_DRIVER !== 's3') {
    fail(`Layer 7 تحتاج STORAGE_DRIVER=s3 (MinIO في dev). الحالي: memory — الطبقة لا تُختبَر.`);
    return;
  }

  // (أ) الرفع الحقيقي — presign → PUT → finalize → GET publicUrl → تطابق
  const rUp = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url',
    headers: H(ctx.a.session.accessToken),
    payload: { kind: 'image', filename: 'l7-http.png', sizeBytes: 8, contentType: 'image/png' },
  });
  const upBody = json(rUp);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const putRes = await fetch(upBody.uploadUrl, {
    method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' },
  });
  if (putRes.status === 200) pass(`(أ.1) PUT حقيقي على uploadUrl → 200 (${bytes.length} بايت)`);
  else fail(`(أ.1) PUT فشل: HTTP ${putRes.status}`);

  const rFin = await fastify.inject({
    method: 'POST', url: `/v1/assets/${upBody.assetId}/finalize`,
    headers: H(ctx.a.session.accessToken), payload: { meta: { label: 'L7' } },
  });
  if (rFin.statusCode === 200 && json(rFin)?.publicUrl) pass(`(أ.2) finalize → 200 مع publicUrl`);
  else fail(`(أ.2) finalize: ${rFin.statusCode}`);

  const rGet = await fastify.inject({
    method: 'GET', url: `/v1/assets/${upBody.assetId}`, headers: H(ctx.a.session.accessToken),
  });
  const pubUrl = json(rGet)?.publicUrl;
  const dl = await fetch(pubUrl);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  if (dl.status === 200 && dlBuf.equals(bytes)) {
    pass(`(أ.3) GET publicUrl بـfetch → 200، البايتات متطابقة (${dlBuf.length})`);
  } else fail(`(أ.3) GET publicUrl: status=${dl.status}, len=${dlBuf.length}, match=${dlBuf.equals(bytes)}`);

  // (ب) رابط منتهي الصلاحية — نُنشئ presign بـTTL=1s ثم ننام 3s ثم PUT
  const expiredKey = `${ctx.a.tenant.id}/${randomUUID()}/expired.png`;
  const shortP = await getStorage().presignUpload(expiredKey, 'image/png', 100, 1);
  await sleep(3000);
  const expiredPut = await fetch(shortP.uploadUrl, {
    method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' },
  });
  if (expiredPut.status === 403) pass(`(ب) PUT على رابط منتهي الصلاحية → 403 (S3 expired signature)`);
  else fail(`(ب) expired URL: expected 403, got ${expiredPut.status}`);

  // (ج) رابط لمفتاح مُعدَّل — نأخذ presign لمفتاح صحيح ثم نبدّل المفتاح في المسار
  const legitKey = `${ctx.a.tenant.id}/${randomUUID()}/legit.png`;
  const legitP = await getStorage().presignUpload(legitKey, 'image/png', 100, 900);
  // نستبدل tenant_id في المسار بـtenant B — نفس صيغة URL لكن key مختلف
  const tamperedUrl = legitP.uploadUrl.replace(ctx.a.tenant.id, ctx.b.tenant.id);
  const tamperedPut = await fetch(tamperedUrl, {
    method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' },
  });
  // S3 signature ملزوم بـKey. تعديل tenant_id في المسار يفشل بـ403.
  if (tamperedPut.status === 403) pass(`(ج) PUT على مفتاح مُعدَّل (tenant A → tenant B path) → 403 (signature bound to key)`);
  else fail(`(ج) tampered key: expected 403, got ${tamperedPut.status}`);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('▶ G-P4-6 — بوابة Assets');
  const fastify = await buildServer();
  await fastify.ready();
  try {
    const ctx = await cleanupAndSeed(fastify);
    await checkExistence(fastify, ctx);
    await checkIsolation(fastify, ctx);
    await checkNegative(fastify, ctx);
    await checkRbac(fastify, ctx);
    await checkPrivileges();
    await checkPolicyDisableFails(fastify, ctx);
    await checkExternalHTTP(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'AsstGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'asstgate-%'`);
    await migPool.end();
  }
  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) { console.log(`✓ G-P4-6 PASSED`); process.exit(0); }
  else { console.error(`✗ G-P4-6 FAILED — ${failures} إخفاق`); for (const l of failLog) console.error(`  ✗ ${l}`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
