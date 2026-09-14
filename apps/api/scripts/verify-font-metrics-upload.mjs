#!/usr/bin/env node
/**
 * FONT-METRICS-UPLOAD (90) — L-46 على مسار رفع الخطّ.
 *
 * يغطّي:
 *   1. رفع ملفّ ليس خطّاً بـkind='font' + finalize ⇒ 422 INVALID_FONT_METRICS
 *   2. رفع خطّ سليم + finalize ⇒ 200 + assets.metadata.metrics مكتوب
 *   3. PATCH brand-kits بـassetId لخطّ سليم ⇒ config.fonts.primary.weights.regular.metrics مطابق
 *   4. PATCH brand-kits بـassetId لخطّ غير مقيس (metadata.metrics غائبة) ⇒ 422
 *
 * السلوك لا الوجود: نتحقّق أنّ الأعداد الصحيحة تصل من assets.metadata إلى
 * brand-kits.config عبر مسار API الحقيقيّ.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { getStorage, __resetStorage } from '../src/storage/index.js';

const { Pool } = pg;
// STORAGE_DRIVER=memory يُضبَط في package.json script (imports تُقرأ config قبل هذا السطر)

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ Missing DATABASE_URL'); process.exit(1); }
const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });

let failures = 0;
function pass(m) { console.log(`  ✓ ${m}`); }
function fail(m) { failures++; console.error(`  ✗ ${m}`); }
function json(r) { try { return JSON.parse(r.body); } catch { return null; } }
const H = (t) => ({ authorization: `Bearer ${t}` });

// خطّ سليم من مستودعنا (Almarai — عربيّ · معايير OS/2 كاملة)
const FONT_PATH = resolve('../../assets/fonts/Almarai-Regular.ttf');
const FONT_BUF = readFileSync(FONT_PATH);
const NOT_A_FONT_BUF = Buffer.from('this is not a font file — plain text');

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

async function seedUploadedAsset(fastify, tenantId, token, buf, tenantSuffix) {
  // 1. طلب upload-url بـkind='font'
  const u = await fastify.inject({
    method: 'POST', url: '/v1/assets/upload-url', headers: H(token),
    payload: {
      kind: 'font', filename: `t-${tenantSuffix}.ttf`,
      sizeBytes: buf.length, contentType: 'font/ttf',
    },
  });
  if (u.statusCode < 200 || u.statusCode >= 300) throw new Error(`upload-url: ${u.statusCode} ${u.body}`);
  const { assetId } = json(u);
  // 2. اقرأ storage_key من DB (الاستجابة لا تعطيه) — via tenant scope RLS
  const skRow = (await queryAs(tenantId, `SELECT storage_key FROM assets WHERE id = $1`, [assetId])).rows[0];
  if (!skRow) throw new Error(`asset ${assetId} not found after upload-url`);
  // 3. حاكي رفع العميل بـputObjectRaw على memory storage
  await getStorage().putObjectRaw(skRow.storage_key, buf, 'font/ttf');
  return assetId;
}

async function main() {
  console.log('▶ FONT-METRICS-UPLOAD — L-46 على مسار رفع الخطّ');
  __resetStorage();
  const fastify = await buildServer();
  await fastify.ready();
  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'FMU-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE email LIKE 'fmu-%'`);
    const suffix = String(Date.now());
    const signup = async (label) => {
      const r = await fastify.inject({
        method: 'POST', url: '/v1/auth/signup',
        payload: {
          email: `fmu-${label}-${suffix}@t.local`,
          password: 'strong_password_1234!',
          tenantName: `FMU-${label}-${suffix}`,
        },
      });
      if (r.statusCode !== 201) throw new Error(`signup: ${r.body}`);
      return json(r);
    };
    const a = await signup('A');

    // ── (١) رفض ملفّ ليس خطّاً ──
    console.log('\n▶ (١) finalize kind=font لملفّ ليس خطّاً ⇒ 422 INVALID_FONT_METRICS');
    const badId = await seedUploadedAsset(fastify, a.tenant.id, a.session.accessToken, NOT_A_FONT_BUF, `bad-${suffix}`);
    const rBad = await fastify.inject({
      method: 'POST', url: `/v1/assets/${badId}/finalize`, headers: H(a.session.accessToken),
      payload: { licenseAck: true, acknowledgedBy: a.user.id },
    });
    if (rBad.statusCode === 422 && json(rBad)?.error?.code === 'INVALID_FONT_METRICS') {
      pass(`(١) ملفّ تالف → 422 INVALID_FONT_METRICS (${json(rBad).error.code})`);
    } else fail(`(١) توقّعنا 422 INVALID_FONT_METRICS، جاء ${rBad.statusCode} ${json(rBad)?.error?.code}`);

    // تأكيد: asset لم يُعلَم مُنتَهياً
    const badRow = (await queryAs(a.tenant.id,
      `SELECT finalized_at, metadata FROM assets WHERE id = $1`, [badId])).rows[0];
    if (badRow?.finalized_at === null) pass(`(١) الأصل بقي غير مُنتَهٍ (finalized_at IS NULL)`);
    else fail(`(١) الأصل تمّ finalize رغم فشل metrics! finalized_at=${badRow?.finalized_at}`);

    // ── (٢) قبول خطّ سليم ──
    console.log('\n▶ (٢) finalize لخطّ سليم ⇒ 200 + metadata.metrics مكتوب');
    const goodId = await seedUploadedAsset(fastify, a.tenant.id, a.session.accessToken, FONT_BUF, `good-${suffix}`);
    const rGood = await fastify.inject({
      method: 'POST', url: `/v1/assets/${goodId}/finalize`, headers: H(a.session.accessToken),
      payload: { licenseAck: true, acknowledgedBy: a.user.id },
    });
    if (rGood.statusCode !== 200) { fail(`(٢) finalize: ${rGood.statusCode} ${rGood.body}`); return; }
    pass(`(٢) finalize خطّ سليم → 200`);

    // اقرأ metadata من DB مباشرةً
    const goodRow = (await queryAs(a.tenant.id,
      `SELECT metadata FROM assets WHERE id = $1`, [goodId])).rows[0];
    const metrics = goodRow?.metadata?.metrics;
    if (metrics && typeof metrics.ascent === 'number' && typeof metrics.descent === 'number' && typeof metrics.unitsPerEm === 'number') {
      pass(`(٢) metadata.metrics مكتوب: ascent=${metrics.ascent} descent=${metrics.descent} unitsPerEm=${metrics.unitsPerEm}`);
    } else fail(`(٢) metadata.metrics غائب أو غير صالح: ${JSON.stringify(metrics)}`);

    // ── (٣) PATCH brand-kits بـassetId ⇒ metrics تُحقن ──
    console.log('\n▶ (٣) PATCH brand-kits بـassetId لخطّ سليم ⇒ metrics في config');
    const bkId = json(await fastify.inject({
      method: 'POST', url: '/v1/brand-kits', headers: H(a.session.accessToken),
      payload: { name: 'fmu-bk', config: {} },
    })).id;
    const rPatch = await fastify.inject({
      method: 'PATCH', url: `/v1/brand-kits/${bkId}`, headers: H(a.session.accessToken),
      payload: {
        fonts: {
          primary: {
            weights: {
              regular: { assetId: goodId, url: 'assets/fonts/Almarai-Regular.ttf', value: 400 },
            },
          },
        },
      },
    });
    if (rPatch.statusCode !== 200) { fail(`(٣) PATCH: ${rPatch.statusCode} ${rPatch.body}`); return; }
    const cfg = json(rPatch)?.config;
    const wMetrics = cfg?.fonts?.primary?.weights?.regular?.metrics;
    if (wMetrics && wMetrics.ascent === metrics.ascent
        && wMetrics.descent === metrics.descent
        && wMetrics.unitsPerEm === metrics.unitsPerEm) {
      pass(`(٣) metrics في config.fonts.primary.weights.regular مطابقة تماماً للـasset`);
    } else fail(`(٣) metrics في config: ${JSON.stringify(wMetrics)} (متوقّع ${JSON.stringify(metrics)})`);

    // ── (٤) PATCH بـassetId لخطّ بلا metrics ⇒ 422 ──
    console.log('\n▶ (٤) PATCH بـassetId لخطّ غير مقيس (metadata.metrics غائبة) ⇒ 422');
    // نُنشئ asset مباشرةً في DB بدون metrics
    const noMetricsId = (await queryAs(a.tenant.id,
      `INSERT INTO assets(tenant_id, kind, storage_key, content_type, size_bytes,
                          filename, metadata, finalized_at)
       VALUES ($1, 'font', 'fmu/no-metrics.ttf', 'font/ttf', 1024, 'no-metrics.ttf',
               '{}'::jsonb, now()) RETURNING id`, [a.tenant.id])).rows[0].id;
    const rPatch2 = await fastify.inject({
      method: 'PATCH', url: `/v1/brand-kits/${bkId}`, headers: H(a.session.accessToken),
      payload: {
        fonts: {
          primary: {
            weights: {
              bold: { assetId: noMetricsId, url: 'unused', value: 700 },
            },
          },
        },
      },
    });
    if (rPatch2.statusCode === 422 && json(rPatch2)?.error?.code === 'INVALID_FONT_METRICS') {
      pass(`(٤) PATCH بـassetId لخطّ غير مقيس → 422 INVALID_FONT_METRICS`);
    } else fail(`(٤) توقّعنا 422 INVALID_FONT_METRICS، جاء ${rPatch2.statusCode} ${json(rPatch2)?.error?.code}`);
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
  console.log(`\n[verify-summary] font-metrics-upload: ${failures} إخفاقاً`);
  if (failures === 0) console.log(`✓ FONT-METRICS-UPLOAD PASSED`);
  else console.error(`✗ FONT-METRICS-UPLOAD FAILED — ${failures} إخفاق`);
  process.exit(failures);
}
main();
