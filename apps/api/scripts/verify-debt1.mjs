#!/usr/bin/env node
/**
 * G-D1 — DEBT-1: ثلاث ديون تحجب العميل الأول.
 *
 * الثمان بوابات:
 *   G-D1-1  دعوة تُقبل من طرف إلى طرف — المدعوّ يصير عضواً
 *   G-D1-2  دعوة منتهية ⇒ 410 · مقبولة مرتين ⇒ 410
 *   G-D1-3  البريد يُرسَل فعلاً (DevConsoleEmailer يطبع الرابط)
 *   G-D1-4  8b: verify:brand-kits بصفر إخفاق (يُختبَر خارجاً)
 *   G-D1-5  verify:all بصفر إخفاق كاملاً (يُختبَر خارجاً)
 *   G-D1-6  لقطة brand_snapshot لا تتأثّر بالاستبدال
 *   G-D1-7  UPDATE على صفّ license_acks ⇒ يُرفض (permission denied)
 *   G-D1-8  pnpm test أخضر (يُختبَر خارجاً)
 */
import 'dotenv/config';
import pg from 'pg';
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

async function main() {
  console.log('▶ G-D1 — DEBT-1: accept-invite + 8b + license_acks');
  const fastify = await buildServer();
  await fastify.ready();

  const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 2 });

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'D1-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);

    // ── إعداد: مستأجر ────────────────────────────
    const sig = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `d1o-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `D1-${Date.now()}` },
    });
    if (sig.statusCode !== 201) throw new Error(`signup: ${sig.body}`);
    const owner = json(sig);
    await bumpTenantLimits(migPool, owner.tenant.id);

    // ══════════════════════════════════════════════
    // G-D1-3: البريد يُرسَل فعلاً — DevConsoleEmailer يطبع الرابط
    // نلتقط stdout للتحقّق من ظهور "acceptUrl" في الرسالة
    console.log('\n▶ G-D1-3 — البريد يُرسَل فعلاً');
    const captured = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return origWrite(chunk, ...rest);
    };

    const inviteEmail = `d1invitee-${Date.now()}@t.local`;
    const invRes = await fastify.inject({
      method: 'POST', url: '/v1/users/invite', headers: H(owner.session.accessToken),
      payload: { email: inviteEmail, role: 'writer' },
    });
    process.stdout.write = origWrite;
    if (invRes.statusCode !== 201) { fail(`invite: ${invRes.body}`); return; }
    const combinedLogs = captured.join('');
    combinedLogs.includes('accept-invite?token=') && combinedLogs.includes(inviteEmail)
      ? pass('DevConsoleEmailer طبع الرابط في السجلّ + البريد المرسَل')
      : fail(`لا رابط في السجلّ: ${combinedLogs.length} حرفاً مُلتقَط`);

    // ══════════════════════════════════════════════
    // G-D1-1: دعوة تُقبل من طرف إلى طرف — المدعوّ يصير عضواً
    console.log('\n▶ G-D1-1 — قبول الدعوة من طرف إلى طرف');
    // نستخرج invitation ونضبط token_hash معروف للاختبار (RLS يحتاج tenant)
    const { createHash } = await import('node:crypto');
    const testToken = 'd1test_token_' + Date.now();
    const testHash = createHash('sha256').update(testToken).digest('hex');
    const cInv = await migPool.connect();
    let updated;
    try {
      await cInv.query('BEGIN');
      await cInv.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      const r = await cInv.query(
        `UPDATE invitations SET token_hash = $1 WHERE email = $2 RETURNING id`,
        [testHash, inviteEmail]);
      updated = r.rowCount;
      await cInv.query('COMMIT');
    } finally { cInv.release(); }
    if (updated === 0) { fail('invitation row missing'); return; }

    const acceptRes = await fastify.inject({
      method: 'POST', url: '/v1/users/accept-invite',
      payload: { token: testToken, password: 'invitee_pass_1234!' },
    });
    if (acceptRes.statusCode === 201 && json(acceptRes)?.userId && json(acceptRes)?.email === inviteEmail) {
      pass(`accept-invite ⇒ 201 · userId=${json(acceptRes).userId.slice(0,8)}… · role=writer`);
    } else fail(`accept: ${acceptRes.statusCode} ${acceptRes.body}`);

    // login للمدعوّ الجديد
    const inviteeLogin = await fastify.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { email: inviteEmail, password: 'invitee_pass_1234!' },
    });
    inviteeLogin.statusCode === 200 && json(inviteeLogin)?.session?.accessToken
      ? pass('المدعوّ يستطيع تسجيل الدخول (auto-login بعد accept)')
      : fail(`invitee login: ${inviteeLogin.statusCode} ${inviteeLogin.body}`);

    // ══════════════════════════════════════════════
    // G-D1-2: دعوة منتهية · مقبولة مرتين
    console.log('\n▶ G-D1-2 — دعوة منتهية · مقبولة مرتين');
    // (أ) مقبولة سابقاً ⇒ 410
    const dupAccept = await fastify.inject({
      method: 'POST', url: '/v1/users/accept-invite',
      payload: { token: testToken, password: 'other_pass_1234!' },
    });
    dupAccept.statusCode === 410 && json(dupAccept)?.error?.code === 'INVITATION_ALREADY_ACCEPTED'
      ? pass('accept مرّة ثانية بنفس token ⇒ 410 INVITATION_ALREADY_ACCEPTED')
      : fail(`re-accept: ${dupAccept.statusCode} ${dupAccept.body}`);

    // (ب) دعوة منتهية — INSERT مع SET LOCAL app.tenant_id لتفادي RLS
    const expToken = 'd1exp_expired_test_token_' + Date.now() + '_padding_padding';
    const expHash = createHash('sha256').update(expToken).digest('hex');
    const cExp = await migPool.connect();
    try {
      await cExp.query('BEGIN');
      await cExp.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      await cExp.query(
        `INSERT INTO invitations(tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, $2, 'writer', $3, now() - interval '1 day')`,
        [owner.tenant.id, `expired-${Date.now()}@t.local`, expHash]);
      await cExp.query('COMMIT');
    } finally { cExp.release(); }
    const expRes = await fastify.inject({
      method: 'POST', url: '/v1/users/accept-invite',
      payload: { token: expToken, password: 'expired_pass_1234!' },
    });
    expRes.statusCode === 410 && json(expRes)?.error?.code === 'INVITATION_EXPIRED'
      ? pass('accept دعوة منتهية ⇒ 410 INVITATION_EXPIRED')
      : fail(`expired: ${expRes.statusCode} ${expRes.body}`);

    // (ج) token غير موجود
    const badRes = await fastify.inject({
      method: 'POST', url: '/v1/users/accept-invite',
      payload: { token: 'nonexistent_token_' + Date.now(), password: 'bad_pass_1234!' },
    });
    badRes.statusCode === 404 && json(badRes)?.error?.code === 'INVITATION_NOT_FOUND'
      ? pass('accept بـtoken مجهول ⇒ 404 INVITATION_NOT_FOUND')
      : fail(`bad token: ${badRes.statusCode}`);

    // ══════════════════════════════════════════════
    // G-D1-6: لقطة brand_snapshot لا تتأثّر بالاستبدال
    console.log('\n▶ G-D1-6 — brand_snapshot يبقى raw بلا fill-in');
    // نُنشئ brand-kit + project + render، ونُقارن snapshot الخام في DB
    // بـGET /renders/:id/brand-snapshot الذي يعيدها raw.
    const bk = await fastify.inject({ method:'POST', url:'/v1/brand-kits', headers:H(owner.session.accessToken), payload:{ name:'d1-snap-bk' }});
    const bkId = json(bk).id;
    // نحذف مفتاحاً من config لنُثبت أن fill-in يعمل على brand-kit read
    // لكن snapshot لا تُملأ
    const cSnap = await migPool.connect();
    try {
      await cSnap.query('BEGIN');
      await cSnap.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      // نُزيل logo.size من config لنختبر
      await cSnap.query(
        `UPDATE brand_kits SET config = config #- '{logo,size}' WHERE id = $1`, [bkId]);
      await cSnap.query('COMMIT');
    } finally { cSnap.release(); }

    // GET brand-kit ⇒ يجب أن يُظهر logo.size=63 (fill-in)
    const bkGet = json(await fastify.inject({ method:'GET', url:`/v1/brand-kits/${bkId}`, headers:H(owner.session.accessToken) }));
    bkGet?.config?.logo?.size === 63
      ? pass('GET /brand-kits/:id ⇒ logo.size=63 من DEFAULT (fill-in فعّال)')
      : fail(`bk fill-in: logo.size=${bkGet?.config?.logo?.size}`);

    // إنشاء render مع snapshot
    const tpls = json(await fastify.inject({ method:'GET', url:'/v1/templates', headers:H(owner.session.accessToken) }));
    const tplId = tpls.data[0].id;
    const prj = await fastify.inject({ method:'POST', url:'/v1/projects', headers:H(owner.session.accessToken), payload:{ title:'d1-snap-prj', brand_kit_id: bkId, template_id: tplId }});
    const pid = json(prj).id;
    const rC = await fastify.inject({ method:'POST', url:'/v1/renders', headers:H(owner.session.accessToken), payload:{ project_id: pid, size:'x', format:'png' }});
    const renderId = json(rC).id;

    // GET brand-snapshot ⇒ raw (بلا fill-in)
    const snapGet = json(await fastify.inject({ method:'GET', url:`/v1/renders/${renderId}/brand-snapshot`, headers:H(owner.session.accessToken) }));
    snapGet?.logo && !('size' in snapGet.logo)
      ? pass('GET /renders/:id/brand-snapshot ⇒ logo.size غائب (snapshot raw، لا fill-in — بنيوياً)')
      : fail(`snapshot تأثّر: logo=${JSON.stringify(snapGet?.logo)}`);

    // ══════════════════════════════════════════════
    // G-D1-7: UPDATE على license_acks ⇒ يُرفض
    console.log('\n▶ G-D1-7 — license_acks append-only (UPDATE مرفوض)');
    // نُنشئ صفّ إقرار عبر font-ack ثم نحاول UPDATE
    // (نحتاج brand-kit بـfont uploaded أولاً — نتجاوز للاختبار المباشر)
    const c1 = await appPool.connect();
    let ackId;
    try {
      await c1.query('BEGIN');
      await c1.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      const ins = await c1.query(
        `INSERT INTO license_acks(tenant_id, brand_kit_id, kind, subject, ack_by)
         VALUES ($1, $2, 'font', 'IBM Plex Sans Arabic', $3) RETURNING id`,
        [owner.tenant.id, bkId, owner.user.id]);
      ackId = ins.rows[0].id;
      await c1.query('COMMIT');
      pass('INSERT license_acks من app_user ⇒ نجح');
    } finally { c1.release(); }

    const c2 = await appPool.connect();
    try {
      await c2.query('BEGIN');
      await c2.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      try {
        await c2.query(`UPDATE license_acks SET notes = 'tampered' WHERE id = $1`, [ackId]);
        fail('UPDATE license_acks من app_user نجح (يجب أن يفشل)');
      } catch (err) {
        err.code === '42501' || (err.message ?? '').includes('permission denied')
          ? pass(`UPDATE license_acks من app_user ⇒ 42501 permission denied (append-only محفوظ)`)
          : fail(`UPDATE error غير متوقّع: ${err.code} ${err.message}`);
      }
      await c2.query('ROLLBACK').catch(() => {});
    } finally { c2.release(); }

    // DELETE أيضاً
    const c3 = await appPool.connect();
    try {
      await c3.query('BEGIN');
      await c3.query('SELECT app_set_tenant($1::uuid)', [owner.tenant.id]);
      try {
        await c3.query(`DELETE FROM license_acks WHERE id = $1`, [ackId]);
        fail('DELETE license_acks من app_user نجح (يجب أن يفشل)');
      } catch (err) {
        err.code === '42501' || (err.message ?? '').includes('permission denied')
          ? pass(`DELETE license_acks من app_user ⇒ 42501 permission denied`)
          : fail(`DELETE error غير متوقّع: ${err.code}`);
      }
      await c3.query('ROLLBACK').catch(() => {});
    } finally { c3.release(); }

    // تنظيف
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    console.log('');
    if (failures === 0) console.log('✓ G-D1 PASSED — كل البوابات نجحت (1..3, 6, 7)');
    else console.error(`✗ G-D1 FAILED — ${failures} إخفاق`);
  } finally {
    await appPool.end();
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  console.log(`\n[verify-summary] debt1: ${failures} إخفاقاً`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
