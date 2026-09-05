#!/usr/bin/env node
/**
 * G-P4-3 — بوابة Brand Kits (docs/17 §7، متطلّبات المالك 2026-09-05).
 *
 * ستّ طبقات:
 *   1. وجود   — كل endpoint يعمل كما يعده العقد
 *   2. عزل    — معرّف مخمَّن من مستأجر آخر → 404 (لا 403 — 403 يكشف الوجود)
 *   3. سلبي   — licenseAck=false → 422 · مسارات محظورة → 400 IMMUTABLE_FIELD ·
 *              acknowledgedDiff → 409 · إصدار خاطئ → 400 · إلخ
 *   4. صلاحيات — viewer لا يستطيع POST/PATCH/DELETE/ack
 *   5. L-58/L-59 — app_user يحمل SELECT/INSERT/UPDATE/DELETE فقط على
 *                   brand_kits (لا صلاحيات زائدة). templates أنماط RLS
 *                   تحرس globals من التعديل
 *   6. سلبي حاسم — تعطيل RLS+FORCE على brand_kits يُفشل عزل الطبقة 2
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/session.js';

const { Pool } = pg;

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) {
  console.error('✗ Missing DATABASE_URL in env');
  process.exit(1);
}
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
const failLog = [];
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures++; failLog.push(msg); console.error(`  ✗ ${msg}`); }
function json(res) { try { return JSON.parse(res.body); } catch { return null; } }

// ══════════════════════════════════════════════════════════════════
//  Setup: مستأجران + مستخدم viewer
// ══════════════════════════════════════════════════════════════════

async function cleanupAndSeed(fastify) {
  await migPool.query(`DELETE FROM tenants WHERE name LIKE 'BKGate-%'`);
  await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'bkgate-%'`);

  // مستأجر A + owner
  const suffix = String(Date.now());
  const emailA = `bkgate-a-${suffix}@test.local`;
  const emailB = `bkgate-b-${suffix}@test.local`;
  const emailViewer = `bkgate-viewer-${suffix}@test.local`;
  const password = 'strong_password_1234!';

  const rA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: emailA, password, tenantName: `BKGate-A-${suffix}` },
  });
  const bodyA = json(rA);
  if (rA.statusCode !== 201) throw new Error(`signup A failed: ${rA.body}`);

  const rB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: { email: emailB, password, tenantName: `BKGate-B-${suffix}` },
  });
  const bodyB = json(rB);
  if (rB.statusCode !== 201) throw new Error(`signup B failed: ${rB.body}`);

  // إنشاء مستخدم viewer داخل مستأجر A مباشرة عبر migration_user (invite
  // endpoint بند A10 — نتجاوز DB لتجنّب الاعتماد).
  const pwHash = await hashPassword(password);
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [bodyA.tenant.id]);
    await c.query(
      `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'viewer', true)`,
      [bodyA.tenant.id, emailViewer, pwHash],
    );
    await c.query('COMMIT');
  } finally {
    c.release();
  }

  // login viewer للحصول على token
  const rV = await fastify.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { email: emailViewer, password },
  });
  const bodyV = json(rV);
  if (rV.statusCode !== 200) throw new Error(`login viewer failed: ${rV.body}`);

  return {
    a: { tenantId: bodyA.tenant.id, userId: bodyA.user.id, token: bodyA.session.accessToken, email: emailA },
    b: { tenantId: bodyB.tenant.id, userId: bodyB.user.id, token: bodyB.session.accessToken, email: emailB },
    viewer: { userId: bodyV.user.id, token: bodyV.session.accessToken, email: emailViewer },
  };
}

const H = (token) => ({ authorization: `Bearer ${token}` });

// ══════════════════════════════════════════════════════════════════
//  Layer 1 — وجود
// ══════════════════════════════════════════════════════════════════

async function checkExistence(fastify, ctx) {
  console.log('\n▶ Layer 1 — وجود (كل endpoint يعمل كما في العقد)');

  // POST — 201
  const rPost = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token),
    payload: { name: 'A Kit One', direction: 'rtl', locale: 'ar' },
  });
  if (rPost.statusCode === 201) pass('POST /v1/brand-kits → 201');
  else fail(`POST → ${rPost.statusCode}: ${rPost.body}`);
  const kit1 = json(rPost);

  // POST ثانٍ (لتجنّب LAST_BRAND_KIT عند اختبار DELETE)
  const rPost2 = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token),
    payload: { name: 'A Kit Two' },
  });
  if (rPost2.statusCode !== 201) fail(`POST second → ${rPost2.statusCode}`);
  const kit2 = json(rPost2);

  // GET list — 200 + عناصر
  const rList = await fastify.inject({ method: 'GET', url: '/v1/brand-kits', headers: H(ctx.a.token) });
  const listBody = json(rList);
  if (rList.statusCode === 200 && listBody?.data?.length >= 2) {
    pass(`GET /v1/brand-kits → 200 مع ${listBody.data.length} عنصراً`);
  } else fail(`GET list → ${rList.statusCode} · ${JSON.stringify(listBody)?.slice(0, 100)}`);

  // GET :id — 200 مع config كامل
  const rGet = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${kit1.id}`, headers: H(ctx.a.token),
  });
  const getBody = json(rGet);
  if (rGet.statusCode === 200 && getBody?.config?.direction === 'rtl') {
    pass(`GET /v1/brand-kits/:id → 200 مع config.direction`);
  } else fail(`GET :id → ${rGet.statusCode}`);

  // PATCH name — 200
  const rPatch = await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${kit1.id}`,
    headers: H(ctx.a.token), payload: { name: 'A Kit One Renamed' },
  });
  if (rPatch.statusCode === 200 && json(rPatch)?.name === 'A Kit One Renamed') {
    pass('PATCH name → 200');
  } else fail(`PATCH → ${rPatch.statusCode}`);

  // assets-version → 200
  const rAssets = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${kit1.id}/assets-version`,
    headers: H(ctx.a.token), payload: { targetVersion: '2026.11', acknowledgedDiff: true },
  });
  if (rAssets.statusCode === 200) pass('POST /assets-version → 200');
  else fail(`assets-version → ${rAssets.statusCode}`);

  // logo-ack بعد PATCH logoMode='official' → 200
  await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${kit1.id}`,
    headers: H(ctx.a.token), payload: { attribution: { logoMode: 'official' } },
  });
  const rLogoAck = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${kit1.id}/attribution/logo-acks/tiktok`,
    headers: H(ctx.a.token), payload: { licenseAck: true, acknowledgedBy: ctx.a.userId },
  });
  if (rLogoAck.statusCode === 200) pass('POST /logo-acks/tiktok (بعد logoMode=official) → 200');
  else fail(`logo-ack → ${rLogoAck.statusCode}: ${rLogoAck.body}`);

  // font-ack — يحتاج source='custom'. نضبطه عبر PATCH ثم نطلب.
  await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${kit1.id}`,
    headers: H(ctx.a.token),
    payload: { fonts: { primary: { family: 'CustomFont', source: 'custom' } } },
  });
  const rFontAck = await fastify.inject({
    method: 'POST', url: `/v1/brand-kits/${kit1.id}/fonts/CustomFont/ack`,
    headers: H(ctx.a.token), payload: { licenseAck: true, acknowledgedBy: ctx.a.userId },
  });
  if (rFontAck.statusCode === 200) pass('POST /fonts/:family/ack (بعد source=custom) → 200');
  else fail(`font-ack → ${rFontAck.statusCode}: ${rFontAck.body}`);

  // DELETE — 204 (kit2 يمنع LAST_BRAND_KIT)
  const rDel = await fastify.inject({
    method: 'DELETE', url: `/v1/brand-kits/${kit1.id}`, headers: H(ctx.a.token),
  });
  if (rDel.statusCode === 204) pass('DELETE → 204');
  else fail(`DELETE → ${rDel.statusCode}: ${rDel.body}`);

  // DELETE الأخير → 409 LAST_BRAND_KIT
  const rDelLast = await fastify.inject({
    method: 'DELETE', url: `/v1/brand-kits/${kit2.id}`, headers: H(ctx.a.token),
  });
  if (rDelLast.statusCode === 409 && json(rDelLast)?.error?.code === 'LAST_BRAND_KIT') {
    pass('DELETE الأخير → 409 LAST_BRAND_KIT');
  } else fail(`DELETE last → ${rDelLast.statusCode}`);

  return { kit2Id: kit2.id };
}

// ══════════════════════════════════════════════════════════════════
//  Layer 2 — عزل (404 لا 403)
// ══════════════════════════════════════════════════════════════════

async function checkIsolation(fastify, ctx) {
  console.log('\n▶ Layer 2 — عزل: معرّف من مستأجر آخر → 404 (لا 403)');

  // مستأجر B ينشئ brand kit
  const rCreate = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.b.token), payload: { name: 'B Private Kit' },
  });
  if (rCreate.statusCode !== 201) { fail(`setup B kit failed: ${rCreate.body}`); return null; }
  const bKitId = json(rCreate).id;

  const cases = [
    { method: 'GET', url: `/v1/brand-kits/${bKitId}` },
    { method: 'PATCH', url: `/v1/brand-kits/${bKitId}`, payload: { name: 'evil rename' } },
    { method: 'DELETE', url: `/v1/brand-kits/${bKitId}` },
    { method: 'POST', url: `/v1/brand-kits/${bKitId}/fonts/x/ack`, payload: { licenseAck: true, acknowledgedBy: ctx.a.userId } },
    { method: 'POST', url: `/v1/brand-kits/${bKitId}/attribution/logo-acks/tiktok`, payload: { licenseAck: true, acknowledgedBy: ctx.a.userId } },
    { method: 'POST', url: `/v1/brand-kits/${bKitId}/assets-version`, payload: { targetVersion: '2026.11', acknowledgedDiff: true } },
  ];

  for (const c of cases) {
    const r = await fastify.inject({
      ...c, headers: H(ctx.a.token),
    });
    if (r.statusCode === 404 && json(r)?.error?.code === 'NOT_FOUND') {
      pass(`${c.method} ${c.url.replace(bKitId, '<B-ID>')} من A → 404 NOT_FOUND`);
    } else {
      fail(`${c.method} isolation: expected 404 NOT_FOUND، وجدنا ${r.statusCode} ${r.body?.slice(0, 100)}`);
    }
  }
  return { bKitId };
}

// ══════════════════════════════════════════════════════════════════
//  Layer 3 — سلبي
// ══════════════════════════════════════════════════════════════════

async function checkNegative(fastify, ctx) {
  console.log('\n▶ Layer 3 — سلبي (validation + policy)');

  // ننشئ kit جديد لـA لهذه الاختبارات
  const created = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token), payload: { name: 'Neg Kit' },
  });
  const kitId = json(created).id;

  const cases = [
    // IMMUTABLE_FIELD paths
    { desc: 'PATCH assets.version → 400 IMMUTABLE_FIELD',
      req: { method: 'PATCH', url: `/v1/brand-kits/${kitId}`, payload: { assets: { version: '2026.99' } } },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'assets.version' } },
    { desc: 'PATCH fonts.primary.licenseAck → 400 IMMUTABLE_FIELD',
      req: { method: 'PATCH', url: `/v1/brand-kits/${kitId}`, payload: { fonts: { primary: { licenseAck: true } } } },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'fonts.primary.licenseAck' } },
    { desc: 'PATCH attribution.logoAcks.tiktok.licenseAck → 400 IMMUTABLE_FIELD',
      req: { method: 'PATCH', url: `/v1/brand-kits/${kitId}`, payload: { attribution: { logoAcks: { tiktok: { licenseAck: true } } } } },
      expect: { status: 400, code: 'IMMUTABLE_FIELD', field: 'attribution.logoAcks.*.licenseAck' } },
    // licenseAck = false → 422
    { desc: 'font-ack licenseAck=false → 422',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/fonts/CustomFont/ack`, payload: { licenseAck: false, acknowledgedBy: ctx.a.userId } },
      expect: { status: 422, code: 'LICENSE_ACK_MUST_BE_TRUE' } },
    { desc: 'logo-ack licenseAck=false → 422',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/attribution/logo-acks/tiktok`, payload: { licenseAck: false, acknowledgedBy: ctx.a.userId } },
      expect: { status: 422, code: 'LICENSE_ACK_MUST_BE_TRUE' } },
    // assets-version
    { desc: 'assets-version invalid → 400',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/assets-version`, payload: { targetVersion: '99.99.99', acknowledgedDiff: true } },
      expect: { status: 400, code: 'INVALID_VERSION_FORMAT' } },
    { desc: 'assets-version بلا ack → 409',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/assets-version`, payload: { targetVersion: '2026.11', acknowledgedDiff: false } },
      expect: { status: 409, code: 'DIFF_NOT_ACKNOWLEDGED' } },
    // Unknown platform
    { desc: 'logo-ack منصة غير معروفة → 400',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/attribution/logo-acks/mystery`, payload: { licenseAck: true, acknowledgedBy: ctx.a.userId } },
      expect: { status: 400, code: 'UNKNOWN_PLATFORM' } },
    // logoMode not official
    { desc: 'logo-ack بلا logoMode=official → 409',
      req: { method: 'POST', url: `/v1/brand-kits/${kitId}/attribution/logo-acks/tiktok`, payload: { licenseAck: true, acknowledgedBy: ctx.a.userId } },
      expect: { status: 409, code: 'LOGO_MODE_NOT_OFFICIAL' } },
  ];

  for (const c of cases) {
    const r = await fastify.inject({ ...c.req, headers: H(ctx.a.token) });
    const body = json(r);
    const okStatus = r.statusCode === c.expect.status;
    const okCode = body?.error?.code === c.expect.code;
    const okField = c.expect.field === undefined || body?.error?.field === c.expect.field;
    if (okStatus && okCode && okField) pass(c.desc);
    else fail(`${c.desc} — got status=${r.statusCode} code=${body?.error?.code} field=${body?.error?.field}`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 3.5 — Merge Patch semantics (A9-V بند 8 و 9)
// ══════════════════════════════════════════════════════════════════

async function checkMergePatchSemantics(fastify, ctx) {
  console.log('\n▶ Layer 3.5 — RFC 7396 Merge Patch (null delete + array replace + read-time fill-in)');

  // brand kit جديد يحمل DEFAULT_BRAND كاملاً
  const created = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token), payload: { name: 'MergePatch Kit' },
  });
  const kitId = json(created).id;

  // ── 8a: null-delete — RFC 7396 §1 ──────────────────────────
  // PATCH بمفتاح قيمته null: يجب أن يحذف المفتاح، لا أن يخزّن null.
  // (DEFAULT_BRAND.logo.size = 63)
  const patch1 = await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${kitId}`,
    headers: H(ctx.a.token), payload: { logo: { size: null } },
  });
  if (patch1.statusCode !== 200) { fail(`8a PATCH null → ${patch1.statusCode}: ${patch1.body}`); return; }

  const cfgAfterDelete = json(patch1)?.config;
  const logoAfterDelete = cfgAfterDelete?.logo;

  // 8a.i: المفتاح غير موجود (لا size = null)
  if (logoAfterDelete && !('size' in logoAfterDelete)) {
    pass('8a-i: PATCH {logo:{size:null}} يحذف size من config (لا يعيّنه null)');
  } else if (logoAfterDelete && logoAfterDelete.size === null) {
    fail('8a-i: size = null بدل الحذف — يخالف RFC 7396 §1');
  } else {
    fail(`8a-i: config.logo unexpected shape: ${JSON.stringify(logoAfterDelete)}`);
  }

  // 8a.ii: بقية مفاتيح logo (margin, position…) لم تتأثّر
  if (logoAfterDelete && 'margin' in logoAfterDelete) {
    pass('8a-ii: مفاتيح logo الأخرى (margin, position, …) بقيت');
  } else {
    fail(`8a-ii: logo فقد مفاتيح أخرى: ${JSON.stringify(logoAfterDelete)}`);
  }

  // ── 8b: قراءة بعد الحذف — الاستبدال من DEFAULT_BRAND ─────
  // docs/03: مفتاح محذوف يُقرأ من DEFAULT_BRAND (fill-in عند القراءة)
  const rRead = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${kitId}`, headers: H(ctx.a.token),
  });
  if (rRead.statusCode !== 200) {
    fail(`8b GET بعد الحذف → ${rRead.statusCode}: ${rRead.body}`);
  } else {
    const cfgRead = json(rRead)?.config;
    // DEFAULT_BRAND.logo.size = 63
    if (cfgRead?.logo?.size === 63) {
      pass('8b: قراءة بعد null-delete → logo.size = 63 من DEFAULT_BRAND (fill-in عند القراءة موجود)');
    } else if (cfgRead?.logo?.size === undefined) {
      fail('8b: logo.size غائب في القراءة — لا fill-in من DEFAULT_BRAND (بند 10: fill-in عند الكتابة فقط)');
    } else {
      fail(`8b: logo.size unexpected value: ${cfgRead?.logo?.size}`);
    }
    // لا خطأ يُرمى (200 = read ناجح مهما كانت المفاتيح ناقصة)
    pass('8b: GET بعد الحذف لا يرمي خطأ (200)');
  }

  // ── 9: PATCH بمصفوفة → استبدال كامل (لا دمج عنصري) ────────
  // DEFAULT_BRAND.colors.placeholder = ['#3A3A3A', '#1A1A1A'] (طول 2)
  const kit2 = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token), payload: { name: 'Array Patch Kit' },
  });
  const kit2Id = json(kit2).id;

  const patch2 = await fastify.inject({
    method: 'PATCH', url: `/v1/brand-kits/${kit2Id}`,
    headers: H(ctx.a.token), payload: { colors: { placeholder: ['#FF0000'] } },
  });
  if (patch2.statusCode !== 200) { fail(`9 PATCH array → ${patch2.statusCode}: ${patch2.body}`); return; }

  const cfg2 = json(patch2)?.config;
  const placeholder = cfg2?.colors?.placeholder;
  if (Array.isArray(placeholder) && placeholder.length === 1 && placeholder[0] === '#FF0000') {
    pass('9: PATCH بمصفوفة → استبدال كامل (length=1, [\"#FF0000\"]) — لا دمج عنصري (RFC 7396)');
  } else {
    fail(`9: expected ['#FF0000'] (length 1)، وجدنا ${JSON.stringify(placeholder)} — احتمال دمج عنصري`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 4 — RBAC (viewer)
// ══════════════════════════════════════════════════════════════════

async function checkRbac(fastify, ctx) {
  console.log('\n▶ Layer 4 — RBAC: viewer يقرأ لكن لا يعدّل');

  // viewer يستطيع GET
  const rList = await fastify.inject({ method: 'GET', url: '/v1/brand-kits', headers: H(ctx.viewer.token) });
  if (rList.statusCode === 200) pass('viewer GET /v1/brand-kits → 200');
  else fail(`viewer GET → ${rList.statusCode}`);

  // POST/PATCH/DELETE/ack/assets-version — كلها 403 INSUFFICIENT_ROLE
  // أوّلاً ننشئ kit كـowner لنستهدفه
  const owned = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token), payload: { name: 'Rbac Target' },
  });
  const kitId = json(owned).id;

  const cases = [
    { method: 'POST', url: '/v1/brand-kits', payload: { name: 'viewer Kit' } },
    { method: 'PATCH', url: `/v1/brand-kits/${kitId}`, payload: { name: 'viewer rename' } },
    { method: 'DELETE', url: `/v1/brand-kits/${kitId}` },
    { method: 'POST', url: `/v1/brand-kits/${kitId}/fonts/x/ack`, payload: { licenseAck: true, acknowledgedBy: ctx.viewer.userId } },
    { method: 'POST', url: `/v1/brand-kits/${kitId}/attribution/logo-acks/tiktok`, payload: { licenseAck: true, acknowledgedBy: ctx.viewer.userId } },
    { method: 'POST', url: `/v1/brand-kits/${kitId}/assets-version`, payload: { targetVersion: '2026.11', acknowledgedDiff: true } },
  ];

  for (const c of cases) {
    const r = await fastify.inject({ ...c, headers: H(ctx.viewer.token) });
    if (r.statusCode === 403 && json(r)?.error?.code === 'INSUFFICIENT_ROLE') {
      pass(`viewer ${c.method} ${c.url.split('/').slice(-2).join('/')} → 403 INSUFFICIENT_ROLE`);
    } else fail(`viewer ${c.method}: expected 403 INSUFFICIENT_ROLE، got ${r.statusCode} ${r.body?.slice(0, 100)}`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 5 — L-58/L-59 min privileges
// ══════════════════════════════════════════════════════════════════

async function checkPrivileges() {
  console.log('\n▶ Layer 5 — L-58/L-59: أقلّ الصلاحيات الممكنة');

  // brand_kits: app_user يجب أن يحمل SELECT/INSERT/UPDATE/DELETE (كامل DML)
  // ولا شيء زائد (لا TRUNCATE، لا REFERENCES على مستأجر آخر…).
  const r = await migPool.query(
    `SELECT privilege_type FROM information_schema.table_privileges
     WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = 'brand_kits'
     ORDER BY privilege_type`,
  );
  const perms = r.rows.map((row) => row.privilege_type).sort();
  const expected = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  if (JSON.stringify(perms) === JSON.stringify(expected)) {
    pass(`app_user على brand_kits: [${perms.join(', ')}] — DML كامل، لا زوائد`);
  } else fail(`brand_kits grants: متوقع [DELETE, INSERT, SELECT, UPDATE]، وجدنا [${perms.join(', ')}]`);

  // templates: نتحقّق أن سياسة templates_insert (A13) تحرس globals من
  // التعديل من app_user. النمط الجديد يسمح لـmigration_user فقط
  // (للبذر) و tenant لكل مستأجر. app_user في هذا الاختبار = عميل
  // API حقيقي، فيجب أن يُرفَض بـ42501 (RLS).
  //
  // الاختبار السابق استعمل migPool (migration_user) وكان يمرّ صدفة
  // لأن السياسة الواحدة القديمة رفضت الجميع. النمط الجديد يميّز،
  // فالاختبار يجب أن يستعمل APP_URL الفعلي.
  const APP_URL = process.env.DATABASE_URL_APP;
  if (!APP_URL) { fail('DATABASE_URL_APP غائبة'); return; }
  const appPool = new Pool({ connectionString: APP_URL, max: 1 });
  try {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant('11111111-1111-1111-1111-111111111111'::uuid)`);
      try {
        // نُمرِّر source_ref+definition_hash لتجاوز CHECK templates_global_has_source،
        // ليصل الاختبار إلى سياسة RLS templates_insert نفسها.
        await c.query(
          `INSERT INTO templates(tenant_id, scope, kind, name, definition, source_ref, definition_hash)
           VALUES (NULL, 'global', 'card', 'Malicious Global', '{}', 'evil', 'evil-hash')`,
        );
        fail(`app_user استطاع INSERT template scope='global' — سياسة templates ضعيفة`);
      } catch (err) {
        if (err.code === '42501' || /row-level security/i.test(err.message)) {
          pass(`app_user لا يستطيع INSERT templates scope='global' (${err.code || 'msg'})`);
        } else fail(`unexpected: ${err.code} ${err.message}`);
      }
      await c.query('ROLLBACK');
    } finally { c.release(); }
  } finally { await appPool.end(); }
}

// ══════════════════════════════════════════════════════════════════
//  Layer 6 — سلبي حاسم: تعطيل RLS على brand_kits يُفشل العزل
// ══════════════════════════════════════════════════════════════════

async function checkPolicyDisableFails(fastify, ctx) {
  console.log('\n▶ Layer 6 — سلبي حاسم: تعطيل FORCE على brand_kits يُفشل العزل');

  // ننشئ kit لكل مستأجر
  const rA = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.a.token), payload: { name: 'Layer6 A' },
  });
  const rB = await fastify.inject({
    method: 'POST', url: '/v1/brand-kits',
    headers: H(ctx.b.token), payload: { name: 'Layer6 B' },
  });
  const bId = json(rB).id;

  // مع FORCE: A لا يرى B → 404
  const r1 = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${bId}`, headers: H(ctx.a.token),
  });
  if (r1.statusCode !== 404) { fail(`baseline: A يجب أن يرى 404 لـB، وجد ${r1.statusCode}`); return; }
  pass(`مع FORCE: A → GET(B) = 404 (baseline)`);

  // نعطّل FORCE مؤقتاً (كـmigration_user)
  await migPool.query(`ALTER TABLE brand_kits NO FORCE ROW LEVEL SECURITY`);
  try {
    // نُعيد نفس الطلب. app_user غير مالك → RLS ما زال يُطبَّق حتى بلا FORCE.
    // لكن الاختبار الحقيقي: هل الطبقة 2 كلها تنكسر لو أزلنا RLS نفسها؟
    // نجرب DISABLE RLS
    await migPool.query(`ALTER TABLE brand_kits DISABLE ROW LEVEL SECURITY`);
    const r2 = await fastify.inject({
      method: 'GET', url: `/v1/brand-kits/${bId}`, headers: H(ctx.a.token),
    });
    if (r2.statusCode === 200) {
      pass(`بلا RLS: A → GET(B) = 200 — يُثبت أن RLS هو الحاجز (تسرّب متعمَّد لإثبات الأهمية)`);
    } else {
      fail(`بلا RLS: expected 200 (تسرّب)، got ${r2.statusCode} — RLS ليس مصدر الحماية الوحيد؟`);
    }
  } finally {
    // إعادة RLS + FORCE فوراً
    await migPool.query(`ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY`);
    await migPool.query(`ALTER TABLE brand_kits FORCE ROW LEVEL SECURITY`);
  }

  // تحقّق أن العزل عاد
  const r3 = await fastify.inject({
    method: 'GET', url: `/v1/brand-kits/${bId}`, headers: H(ctx.a.token),
  });
  if (r3.statusCode === 404) pass(`بعد استعادة RLS+FORCE: A → GET(B) = 404 مجدداً`);
  else fail(`استعادة RLS فشلت — ${r3.statusCode}`);
}

// ══════════════════════════════════════════════════════════════════
//  main
// ══════════════════════════════════════════════════════════════════

async function main() {
  console.log('▶ G-P4-3 — بوابة Brand Kits');

  const fastify = await buildServer();
  await fastify.ready();

  try {
    const ctx = await cleanupAndSeed(fastify);
    await checkExistence(fastify, ctx);
    await checkIsolation(fastify, ctx);
    await checkNegative(fastify, ctx);
    await checkMergePatchSemantics(fastify, ctx);
    await checkRbac(fastify, ctx);
    await checkPrivileges();
    await checkPolicyDisableFails(fastify, ctx);
  } finally {
    await fastify.close();
    await closePool();
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'BKGate-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'bkgate-%'`);
    await migPool.end();
  }

  console.log(`\n${'═'.repeat(60)}`);
  if (failures === 0) {
    console.log(`✓ G-P4-3 PASSED`);
    process.exit(0);
  } else {
    console.error(`✗ G-P4-3 FAILED — ${failures} إخفاق`);
    for (const line of failLog) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Unexpected exception:', err);
  process.exit(1);
});
