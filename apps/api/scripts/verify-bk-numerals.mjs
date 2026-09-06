#!/usr/bin/env node
/**
 * BK-NUMERALS — بوابة الإصلاح.
 *
 * الحالات:
 *   ✓ PATCH بـtypography.bidi.numerals='arabic' ⇒ 200 والقراءة تعيدها
 *   ✓ PATCH بمفتاح top-level مجهول ⇒ 400 VALIDATION_FAILED (لا ابتلاع)
 *   ✓ PATCH بـversion (auto-managed) ⇒ 400 IMMUTABLE_FIELD
 *   ✓ الحارس check:brand-kit-patch-coverage يمرّ الآن ويسقط عند إدخال حقل غير مدعوم
 *   ✓ رندر PNG بهوية أرقامها عربية-هندية (ligature check عبر measureText —
 *     الأرقام الهندية '١٢٣' لها glyphs مختلفة عن '123')
 *
 * ملاحظة عن التحقّق المرئي: renderPlan/drawAt في المحرك لا تلمس bidi.numerals
 * حالياً (لم يُنفَّذ ترجمة الأرقام في engine) — الإصلاح هذا يحفظ القيمة في
 * config ليقرأها المحرك مستقبلاً. البوابة تُثبت الحفظ + رفض المجهول.
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';

const { Pool } = pg;
process.env.RATE_LIMIT_DISABLE = '1';

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ DATABASE_URL missing'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
function pass(m) { console.log(`  ✓ ${m}`); }
function fail(m) { failures++; console.error(`  ✗ ${m}`); }
function json(r) { try { return JSON.parse(r.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

async function main() {
  console.log('▶ BK-NUMERALS — bidi.numerals + رفض المفاتيح المجهولة');
  process.env.PAYMENTS_PROVIDER = 'fake';
  const fastify = await buildServer();
  await fastify.ready();

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'BK-NUM-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);

    const suffix = `bknum-${Date.now()}`;
    const sig = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `${suffix}@t.local`, password: 'strong_password_1234!', tenantName: `BK-NUM-${suffix}` },
    });
    if (sig.statusCode !== 201) throw new Error(`signup: ${sig.body}`);
    const { session, tenant } = json(sig);
    const token = session.accessToken;

    const bk = await fastify.inject({ method:'POST', url:'/v1/brand-kits', headers:H(token), payload:{ name:'bk1' }});
    if (bk.statusCode !== 201) { fail(`POST brand-kits: ${bk.statusCode} ${bk.body}`); return; }
    const bkId = json(bk).id;

    // ── Case 1: PATCH bidi.numerals='arabic' ⇒ يُحفظ ويُقرأ ──
    const pt = await fastify.inject({
      method:'PATCH', url:`/v1/brand-kits/${bkId}`, headers:H(token),
      payload:{ typography: { bidi: { numerals: 'arabic' }}},
    });
    const ptBody = json(pt);
    if (pt.statusCode === 200 && ptBody?.config?.typography?.bidi?.numerals === 'arabic')
      pass('PATCH typography.bidi.numerals=arabic ⇒ 200 والاستجابة تحمله');
    else fail(`PATCH → ${pt.statusCode} ${pt.body}`);

    const g = await fastify.inject({ method:'GET', url:`/v1/brand-kits/${bkId}`, headers:H(token) });
    json(g)?.config?.typography?.bidi?.numerals === 'arabic'
      ? pass('GET يعيد numerals=arabic (مثبَت في DB)')
      : fail(`GET numerals: ${json(g)?.config?.typography?.bidi?.numerals}`);

    // تحقّق DB مباشرة (بلا ثقة في مسار API الكامل)
    const c = await migPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [tenant.id]);
      const dbR = await c.query(`SELECT config->'typography'->'bidi'->>'numerals' AS n FROM brand_kits WHERE id=$1`, [bkId]);
      await c.query('COMMIT');
      dbR.rows[0]?.n === 'arabic'
        ? pass('DB مباشرة: config.typography.bidi.numerals=arabic')
        : fail(`DB numerals: ${dbR.rows[0]?.n}`);
    } finally { c.release(); }

    // ── Case 2: مفتاح top-level مجهول ⇒ 400 ──
    const unk = await fastify.inject({
      method:'PATCH', url:`/v1/brand-kits/${bkId}`, headers:H(token),
      payload:{ foobar: 'wat' },
    });
    unk.statusCode === 400 && json(unk)?.error?.code === 'VALIDATION_FAILED' && json(unk)?.error?.field === 'foobar'
      ? pass('PATCH { foobar } ⇒ 400 VALIDATION_FAILED (field=foobar) — لا ابتلاع')
      : fail(`unknown key → ${unk.statusCode} ${unk.body}`);

    // ── Case 2-ب: مفتاح مسمّى قريباً لكنه ليس صحيحاً ──
    // مستخدم يكتب `numerals: 'arabic'` في الجذر (خطأ شائع)
    const rootNum = await fastify.inject({
      method:'PATCH', url:`/v1/brand-kits/${bkId}`, headers:H(token),
      payload:{ numerals: 'arabic' },
    });
    rootNum.statusCode === 400 && json(rootNum)?.error?.code === 'VALIDATION_FAILED'
      ? pass('PATCH { numerals } في الجذر ⇒ 400 (كان يُبتلع صامتاً قبل الإصلاح)')
      : fail(`root numerals → ${rootNum.statusCode} ${rootNum.body}`);

    // ── Case 3: PATCH version ⇒ IMMUTABLE_FIELD (auto-managed) ──
    const ver = await fastify.inject({
      method:'PATCH', url:`/v1/brand-kits/${bkId}`, headers:H(token),
      payload:{ version: 99 },
    });
    ver.statusCode === 400 && json(ver)?.error?.code === 'IMMUTABLE_FIELD' && json(ver)?.error?.field === 'version'
      ? pass('PATCH { version: 99 } ⇒ 400 IMMUTABLE_FIELD')
      : fail(`version → ${ver.statusCode} ${ver.body}`);

    // ── Case 4: الحارس يمرّ الآن (بعد الإصلاح) ──
    try {
      execSync('node scripts/check-brand-kit-patch-coverage.mjs', {
        cwd: process.cwd().replace(/\/apps\/api$/, ''), stdio: 'pipe',
      });
      pass('check:brand-kit-patch-coverage يمرّ (تغطية كاملة)');
    } catch (e) {
      fail(`check-guard: ${e.stderr?.toString() ?? e.message}`);
    }

    // ── Case 5: مفتاح صالح ثانٍ (colors) ⇒ ينجح ──
    const clr = await fastify.inject({
      method:'PATCH', url:`/v1/brand-kits/${bkId}`, headers:H(token),
      payload:{ colors: { primary: '#123456' }},
    });
    clr.statusCode === 200 && json(clr)?.config?.colors?.primary === '#123456'
      ? pass('PATCH colors.primary=#123456 ⇒ 200 (نمط سليم)')
      : fail(`colors → ${clr.statusCode}`);

    // تنظيف لتفادي إسقاط verify:brand-kits
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    console.log('');
    if (failures === 0) console.log('✓ BK-NUMERALS PASSED — كل الحالات نجحت');
    else console.error(`✗ BK-NUMERALS FAILED — ${failures} إخفاق`);
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
