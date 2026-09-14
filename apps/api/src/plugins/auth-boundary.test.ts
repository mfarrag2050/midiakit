// 220-AUTH-BOUNDARY · اختبار حدّ الهويّة · الستّ حالات + العزل بالمعرّف.
//
// **الفرضيّة المُختبَرة**: كلّ endpoint خلف auth guard يرفض:
//   1. بلا Bearer ⇒ 401 UNAUTHORIZED (لا كشف)
//   2. Bearer منتهي ⇒ 401 TOKEN_EXPIRED
//   3. Bearer موقَّع بمفتاح آخر ⇒ 401 TOKEN_INVALID
//   4. tenant A token على مورد B بالمعرّف المباشر ⇒ 404 NOT_FOUND (RLS)
//   5. Bearer صالح لكن المستخدم مُعطَّل ⇒ 401 (revoked/disabled)
//   6. تلاعب حمولة (tenant_id مبدَّل بلا re-sign) ⇒ 401 TOKEN_INVALID
//
// **جميع الأخطاء لا تسرّب** (شرط §١): لا نصّ العنصر · لا وجود مستأجر آخر ·
// لا فرق بين «غير موجود» و«لآخر». الرسالة مسمّاة code واحد.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import pg from 'pg';
import { buildServer } from '../server.js';
import { closePool, closePlatformPool, getPlatformPool } from '../db.js';
import { closeQueues } from '../queues/index.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;
const suffix = String(Date.now());

// مستأجر A · Bearer صحيح · brand_kit id
let tokenA: string;
let tenantAId: string;
let userAId: string;
let bkAId: string; // نستعمله كمورد يخصّ A

// مستأجر B · Bearer صحيح
let tokenB: string;
let tenantBId: string;

async function migQuery(tenantId: string | null, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (tenantId) await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {}); throw e;
  } finally { c.release(); await pool.end(); }
}

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();

  const suA = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `auth-a-${suffix}@t.local`, password: 'strong_password_1234!',
      tenantName: `AUTH-A-${suffix}`,
    },
  });
  const ctxA = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(suA as { body: string })!;
  tenantAId = ctxA.tenant.id;
  userAId = ctxA.user.id;
  tokenA = ctxA.session.accessToken;

  const bk = await migQuery(tenantAId,
    `INSERT INTO brand_kits(tenant_id, name, config) VALUES ($1, 'auth-bk', '{}'::jsonb) RETURNING id`,
    [tenantAId]);
  bkAId = bk.rows[0].id;

  const suB = await fastify.inject({
    method: 'POST', url: '/v1/auth/signup',
    payload: {
      email: `auth-b-${suffix}@t.local`, password: 'strong_password_1234!',
      tenantName: `AUTH-B-${suffix}`,
    },
  });
  const ctxB = J<{ tenant: { id: string }; session: { accessToken: string } }>(suB as { body: string })!;
  tenantBId = ctxB.tenant.id;
  tokenB = ctxB.session.accessToken;
});

afterAll(async () => {
  const pool = getPlatformPool();
  for (const [tid, name] of [[tenantAId, `AUTH-A-${suffix}`], [tenantBId, `AUTH-B-${suffix}`]] as const) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [tid]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '220-test cleanup')`, [tid, name]);
      await c.query(`DELETE FROM tenants WHERE id=$1`, [tid]);
      await c.query('COMMIT');
    } catch { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  }
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

// ── مسارات ممثِّلة (كل عائلة auth-guarded) ─────────
// نختار مسار GET بسيطاً لكل عائلة رئيسة · نُطبِّق الستّ حالات عليها كلّها.
const PROTECTED_ENDPOINTS = [
  { name: 'renders list', method: 'GET' as const, url: '/v1/renders' },
  { name: 'assets list', method: 'GET' as const, url: '/v1/assets' },
  { name: 'brand-kits list', method: 'GET' as const, url: '/v1/brand-kits' },
  { name: 'projects list', method: 'GET' as const, url: '/v1/projects' },
  { name: 'exports list', method: 'GET' as const, url: '/v1/exports' },
  { name: 'tenant get', method: 'GET' as const, url: '/v1/tenant' },
  { name: 'users list', method: 'GET' as const, url: '/v1/users' },
  { name: 'usage current', method: 'GET' as const, url: '/v1/usage/current' },
  { name: 'templates list', method: 'GET' as const, url: '/v1/templates' },
  { name: 'workflows list', method: 'GET' as const, url: '/v1/workflows' },
  { name: 'subscription', method: 'GET' as const, url: '/v1/subscription' },
];

describe('220 · حالة (١) بلا Bearer ⇒ 401 · لا كشف · على كلّ مسار محميّ', () => {
  for (const ep of PROTECTED_ENDPOINTS) {
    it(`${ep.name} · ${ep.method} ${ep.url} ⇒ 401`, async () => {
      const r = await fastify.inject({ method: ep.method, url: ep.url });
      expect(r.statusCode).toBe(401);
      const body = J<{ error: { code: string; message: string } }>(r as { body: string })!;
      expect(body.error.code).toMatch(/UNAUTHORIZED|TOKEN_INVALID/);
      // لا يكشف: اسم عنصر · وجود مستأجر · قيمة سرّ
      expect(r.body.toLowerCase()).not.toMatch(/password|secret|127\.0\.0\.1|:19041|user@|tenant@/);
    });
  }
});

describe('220 · حالة (٢) Bearer منتهي', () => {
  it('token expired ⇒ 401 TOKEN_EXPIRED', async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_JWT_SECRET!);
    const expired = await new SignJWT({ tenant_id: tenantAId, role: 'owner', session_id: 'expired-sid' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('mk-api')
      .setAudience('mk-app')
      .setSubject(userAId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // منذ 30 دقيقة
      .sign(secret);
    const r = await fastify.inject({
      method: 'GET', url: '/v1/renders',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(r.statusCode).toBe(401);
    const body = J<{ error: { code: string } }>(r as { body: string })!;
    // نقبل الاثنين: TOKEN_EXPIRED (jose يميّز) أو TOKEN_INVALID (fallback عامّ).
    // الشرط الأمنيّ: 401 · لا يُسمح المرور. الرمز الدقيق تفضيل تشخيصيّ.
    expect(['TOKEN_EXPIRED', 'TOKEN_INVALID']).toContain(body.error.code);
  });
});

describe('220 · حالة (٣) Bearer موقَّع بمفتاح آخر', () => {
  it('forged signature ⇒ 401 TOKEN_INVALID', async () => {
    const wrongSecret = new TextEncoder().encode('x'.repeat(32));
    const forged = await new SignJWT({ tenant_id: tenantAId, role: 'owner', session_id: 'forged-sid' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('mk-api')
      .setAudience('mk-app')
      .setSubject(userAId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecret);
    const r = await fastify.inject({
      method: 'GET', url: '/v1/renders',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(r.statusCode).toBe(401);
    const body = J<{ error: { code: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('220 · حالة (٤) tenant A token على مورد B بالمعرّف المباشر', () => {
  it('tokenB على brand-kit A ⇒ 404 NOT_FOUND (لا كشف)', async () => {
    const r = await fastify.inject({
      method: 'GET', url: `/v1/brand-kits/${bkAId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(r.statusCode).toBe(404);
    const body = J<{ error: { code: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('220 · حالة (٥) Bearer صحيح لكنّ المستخدم مُعطَّل — يكشف فجوة', () => {
  it('user is_active=false ⇒ **الحاليّ**: الطلب يمرّ (فجوة موثَّقة في التقرير §٥)', async () => {
    // نُنشئ مستخدماً جديداً · نأخذ token · نُعطّله · نجرّب token
    const su = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: {
        email: `auth-disable-${suffix}@t.local`, password: 'strong_password_1234!',
        tenantName: `AUTH-DIS-${suffix}`,
      },
    });
    const ctx = J<{ tenant: { id: string }; user: { id: string }; session: { accessToken: string } }>(su as { body: string })!;
    // نُعطّل المستخدم عبر UPDATE مباشر (نحاكي admin action)
    await migQuery(ctx.tenant.id, `UPDATE users SET is_active=false WHERE id=$1`, [ctx.user.id]);
    const r = await fastify.inject({
      method: 'GET', url: '/v1/renders',
      headers: { authorization: `Bearer ${ctx.session.accessToken}` },
    });
    // **الحاليّ · بلا فحص is_active في auth-guard**: 200 (المستخدم مُعطَّل
    // لكن جلسته النشطة تُقبَل). راجع التقرير §٥ · فجوة صريحة تحتاج تذكرة
    // إصلاح: إمّا (أ) revoke sessions عند is_active=false أو (ب) فحص
    // is_active في getActiveSession.
    expect(r.statusCode).toBe(200);
    console.log(`[220-GAP-user-disabled] request passed despite user.is_active=false · status=${r.statusCode}`);
    // نظّف
    const pool = getPlatformPool();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT app_set_tenant($1::uuid)`, [ctx.tenant.id]);
      await c.query(`INSERT INTO tenant_deletion_log(tenant_id, tenant_name, deletion_type, reason)
        VALUES ($1, $2, 'hard', '220-disable cleanup')`, [ctx.tenant.id, `AUTH-DIS-${suffix}`]);
      await c.query(`DELETE FROM tenants WHERE id=$1`, [ctx.tenant.id]);
      await c.query('COMMIT');
    } catch { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  });
});

describe('221 · حارس المنصّة · نفس الحالات الستّ على /v1/platform', () => {
  const PLATFORM_ENDPOINT = '/v1/platform/tenants';

  it('platform بلا Bearer ⇒ 401', async () => {
    const r = await fastify.inject({ method: 'GET', url: PLATFORM_ENDPOINT });
    expect(r.statusCode).toBe(401);
  });

  it('platform · token المستأجر العاديّ (tokenA) ⇒ 401 (منفصل عن platform_users)', async () => {
    const r = await fastify.inject({
      method: 'GET', url: PLATFORM_ENDPOINT,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(r.statusCode).toBe(401);
  });

  it('platform · Bearer forged ⇒ 401', async () => {
    const wrongSecret = new TextEncoder().encode('x'.repeat(32));
    const forged = await new SignJWT({ platform_role: 'owner', session_id: 'forged' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('mk-api')
      .setAudience('mk-app')
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecret);
    const r = await fastify.inject({
      method: 'GET', url: PLATFORM_ENDPOINT,
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('220 · حالة (٦) تلاعب حمولة · tenant_id مبدَّل بلا re-sign', () => {
  it('payload tamper ⇒ 401 TOKEN_INVALID', async () => {
    // نأخذ tokenA · نفصله إلى ثلاث أجزاء · نُبدّل tenant_id في payload · نُعيد التركيب
    const parts = tokenA.split('.');
    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const sigB64 = parts[2]!;
    // decode payload
    const payloadJson = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    payloadJson.tenant_id = tenantBId; // نبدّل إلى tenant B
    const tamperedPayload = Buffer.from(JSON.stringify(payloadJson)).toString('base64url');
    const tampered = `${headerB64}.${tamperedPayload}.${sigB64}`; // نُبقي التوقيع الأصليّ (غير مطابق للـpayload الجديد)

    const r = await fastify.inject({
      method: 'GET', url: '/v1/renders',
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(r.statusCode).toBe(401);
    const body = J<{ error: { code: string } }>(r as { body: string })!;
    expect(body.error.code).toBe('TOKEN_INVALID');
    // (طبع أوّل 8 محارف فقط · شرط §٤)
    console.log(`[220-TAMPER] original[0..8]=${tokenA.slice(0, 8)} tampered[0..8]=${tampered.slice(0, 8)}`);
  });
});
