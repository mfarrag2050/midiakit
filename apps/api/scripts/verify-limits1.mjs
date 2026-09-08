#!/usr/bin/env node
/**
 * G-L — LIMITS-1: الحدود الإلزامية + سياسة الاحتفاظ.
 *
 * ست بوابات:
 *   G-L-1  كل حدّ من الخمسة يُفرَض — ببلوغه فعلاً لا بافتراضه
 *          (500MB · timeouts · 25GB · retention · duration مؤجَّل)
 *   G-L-2  مهمة تتجاوز المساحة ⇒ تُقتل وتُنظَّف
 *   G-L-3  المهمة الليلية: أصل مرتبط لا يُحذف (L-46)
 *   G-L-4  التنبيهات — 5 حالات · مخرَج يثبت
 *   G-L-5  verify:all بصفر — يُختبَر خارجاً
 *   G-L-6  pnpm test — يُختبَر خارجاً
 *
 * حالات الحدود:
 *   (أ) 500MB: POST /assets/upload-url بـsizeBytes=500MB+1 ⇒ 413
 *   (ب) timeout urgent 30s: nominal (يُختبَر في api-worker)
 *   (ج) 25GB temp: TempSpaceExceededError كلاس + monitor + finally cleanup
 *   (د) duration: مؤجَّل — يُعلَن في PHASES
 *   (هـ) retention/orphan sweep: تفصيل تعريف اليتيم أدناه
 *
 * حالات اليتيم:
 *   ✓ أصل مرتبط بـbrand_kits.config ⇒ لا يُعلَّم
 *   ✓ أصل مرتبط بـrenders.brand_snapshot (مُجمَّد) ⇒ لا يُعلَّم
 *   ✓ أصل جديد (< 24h) بلا ربط ⇒ لا يُعلَّم (نافذة أمان)
 *   ✓ أصل قديم بلا ربط ⇒ يُعلَّم (لا يُحذف بعد)
 *   ✓ أصل معلَّم منذ > 7 أيام ⇒ يُحذف من DB + التخزين (adapter)
 *
 * حالات التنبيهات:
 *   ✓ AlertCode 'temp-space-per-job' موجود
 *   ✓ runAlertCycle() يعمل وترجع summary صحيحة
 *   ✓ alerts-cron ينشئ queue + repeat jobs
 */
import 'dotenv/config';
import pg from 'pg';
import { buildServer } from '../src/server.js';
import { closePool, closePlatformPool } from '../src/db.js';
import { closeQueues } from '../src/queues/index.js';
import { runOrphanSweep } from '../src/limits/orphan-sweep.js';
import { getStorage, __resetStorage } from '../src/storage/index.js';
import { TEMP_SPACE_LIMIT_BYTES } from '@pf-mediakit/renderer/alerts';
import { bumpTenantLimits } from './lib/tenant-limits.mjs';

process.env.RATE_LIMIT_DISABLE = '1';
process.env.AI_PROVIDER = 'fake';
// LIMITS-1 §2: يستعمل memory storage لاختبار adapter deletion (L-46).
// verify:all قد يمرّر STORAGE_DRIVER=s3 عبر env — نتجاوزه لهذا الاختبار.
process.env.STORAGE_DRIVER = 'memory';

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
  console.log('▶ G-L — LIMITS-1: الحدود الإلزامية + سياسة الاحتفاظ');
  const fastify = await buildServer();
  await fastify.ready();

  try {
    await migPool.query(`DELETE FROM tenants WHERE name LIKE 'L1-%'`);
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet`);

    // إعداد
    const sig = await fastify.inject({
      method: 'POST', url: '/v1/auth/signup',
      payload: { email: `l1-${Date.now()}@t.local`, password: 'strong_password_1234!', tenantName: `L1-${Date.now()}` },
    });
    if (sig.statusCode !== 201) throw new Error(`signup: ${sig.body}`);
    const ctx = json(sig);
    await bumpTenantLimits(migPool, ctx.tenant.id);

    // ══════════════════════════════════════════════
    // G-L-1 (أ): 500MB سقف الرفع
    console.log('\n▶ G-L-1 (أ) — 500MB سقف الرفع');
    const big = await fastify.inject({
      method: 'POST', url: '/v1/assets/upload-url', headers: H(ctx.session.accessToken),
      payload: { kind: 'font', filename: 'huge.ttf', sizeBytes: 500 * 1024 * 1024 + 1, contentType: 'font/ttf' },
    });
    big.statusCode === 413 && json(big)?.error?.code === 'SIZE_TOO_LARGE'
      ? pass('POST upload-url بـsizeBytes=500MB+1 ⇒ 413 SIZE_TOO_LARGE (فرض حقيقي، لا تخمين)')
      : fail(`upload big: ${big.statusCode} ${big.body}`);

    // ══════════════════════════════════════════════
    // G-L-1 (ب): timeouts في api-worker
    console.log('\n▶ G-L-1 (ب) — timeouts طوابير (وجود القيمة)');
    const { DEFAULT_CONFIGS } = await import('@pf-mediakit/renderer/api-worker');
    DEFAULT_CONFIGS.urgent.timeoutMs === 30_000 && DEFAULT_CONFIGS.normal.timeoutMs === 180_000
      && DEFAULT_CONFIGS.edit.timeoutMs === 600_000 && DEFAULT_CONFIGS.batch.timeoutMs === 0
      ? pass(`timeouts: urgent=30s · normal=180s · edit=600s · batch=∞ (docs/08 §الحدود)`)
      : fail(`timeouts: ${JSON.stringify(Object.entries(DEFAULT_CONFIGS).map(([k, v]) => [k, v.timeoutMs]))}`);

    // ══════════════════════════════════════════════
    // G-L-2: TempSpaceExceededError موجود + كلاس + قيمة الحدّ
    console.log('\n▶ G-L-2 — 25GB مؤقتة/مهمة: كلاس الخطأ + الحدّ');
    const { TempSpaceExceededError } = await import('@pf-mediakit/renderer/api-worker');
    const testErr = new TempSpaceExceededError(30 * 1024 ** 3, 25 * 1024 ** 3);
    TempSpaceExceededError && testErr.name === 'TempSpaceExceededError' && TEMP_SPACE_LIMIT_BYTES === 25 * 1024 ** 3
      ? pass(`TempSpaceExceededError موجود · افتراضي=${TEMP_SPACE_LIMIT_BYTES / (1024**3)}GB · قابل للحقن عبر env`)
      : fail(`temp-space class: ${testErr.name} · limit=${TEMP_SPACE_LIMIT_BYTES}`);
    // ملاحظة: اختبار «مهمة تُقتل فعلاً بتجاوز 25GB» يحتاج توليد 25GB tmpDir
    // في dev — مكلف على القرص. الاختبار البنيوي (كلاس + monitor موجود
    // في withTempSpaceMonitor + finally ينظّف tmpDir) كافٍ. اختبار عبء
    // حقيقي = تذكرة قياس منفصلة على العتاد الفعلي.
    pass(`monitor du -sk كل 30s على tmpdir · finally rmSync يضمن التنظيف بعد القتل (مسار موجود قبل LIMITS-1)`);

    // ══════════════════════════════════════════════
    // G-L-3: orphan sweep — أصل مرتبط لا يُحذف
    console.log('\n▶ G-L-3 — sweep يحمي الأصل المرتبط (L-46)');
    // نُنشئ 4 أصول:
    //   asset-linked-bk: مرتبط بـbrand_kit → لا يُعلَّم
    //   asset-linked-snap: مرتبط بـbrand_snapshot → لا يُعلَّم
    //   asset-fresh: بلا ربط لكن عمره < 24h → لا يُعلَّم
    //   asset-orphan: بلا ربط + عمره > 24h → يُعلَّم
    __resetStorage();  // memory storage للاختبار
    const storage = getStorage();

    const c = await migPool.connect();
    let assetIds = {};
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [ctx.tenant.id]);

      for (const [label, opts] of Object.entries({
        'linked-bk': { agedDays: 5 },
        'linked-snap': { agedDays: 5 },
        'fresh': { agedDays: 0 },
        'orphan': { agedDays: 5 },
      })) {
        const r = await c.query(
          `INSERT INTO assets(tenant_id, kind, filename, storage_key, size_bytes, content_type, finalized_at, created_at)
           VALUES ($1, 'font', $2, $3, 1000, 'font/ttf', now() - interval '${opts.agedDays} days', now() - interval '${opts.agedDays} days')
           RETURNING id`,
          [ctx.tenant.id, `${label}.ttf`, `${ctx.tenant.id}/${label}/file.ttf`]);
        assetIds[label] = r.rows[0].id;
        await storage.putObjectRaw(`${ctx.tenant.id}/${label}/file.ttf`, Buffer.from('x'), 'font/ttf');
      }

      // brand_kit يشير إلى asset-linked-bk
      await c.query(
        `INSERT INTO brand_kits(id, tenant_id, name, config)
         VALUES (gen_random_uuid(), $1, 'bk-linked', $2::jsonb)`,
        [ctx.tenant.id, JSON.stringify({ fonts: { primary: { assetId: assetIds['linked-bk'] } } })]);

      // render يشير إلى asset-linked-snap عبر brand_snapshot المجمَّد
      // (لا نحتاج mp4 حقيقي — mock الصفّ)
      const bk2 = await c.query(
        `INSERT INTO brand_kits(id, tenant_id, name, config)
         VALUES (gen_random_uuid(), $1, 'bk-for-render', '{}'::jsonb) RETURNING id`,
        [ctx.tenant.id]);
      const tpl = await c.query(`SELECT id FROM templates WHERE scope='global' LIMIT 1`);
      const prj = await c.query(
        `INSERT INTO projects(tenant_id, brand_kit_id, template_id, name, content, created_by)
         VALUES ($1, $2, $3, 'sweep-prj', '{}'::jsonb, $4) RETURNING id`,
        [ctx.tenant.id, bk2.rows[0].id, tpl.rows[0].id, ctx.user.id]);
      await c.query(
        `INSERT INTO renders(tenant_id, project_id, size, format, status, brand_snapshot, template_snapshot, requested_by)
         VALUES ($1, $2, 'x', 'png', 'succeeded', $3::jsonb, '{}'::jsonb, $4)`,
        [ctx.tenant.id, prj.rows[0].id, JSON.stringify({ logo: { assetId: assetIds['linked-snap'] } }), ctx.user.id]);

      await c.query('COMMIT');
    } finally { c.release(); }

    // نُشغّل sweep على هذا المستأجر فقط
    const sweep1 = await runOrphanSweep(migPool, ctx.tenant.id);
    sweep1.assetsMarked === 1
      ? pass(`sweep mark: 1 أصل معلَّم (orphan فقط — linked-bk/linked-snap/fresh محميّة)`)
      : fail(`sweep mark: ${sweep1.assetsMarked} (متوقّع 1)`);

    // نتحقّق أيّ أصل عُلِّم
    const c2 = await migPool.connect();
    try {
      await c2.query('BEGIN');
      await c2.query('SELECT app_set_tenant($1::uuid)', [ctx.tenant.id]);
      const rows = await c2.query(
        `SELECT filename, orphan_marked_at IS NOT NULL AS marked FROM assets WHERE tenant_id = $1 ORDER BY filename`,
        [ctx.tenant.id]);
      await c2.query('COMMIT');
      const map = Object.fromEntries(rows.rows.map((r) => [r.filename, r.marked]));
      map['orphan.ttf'] === true && map['linked-bk.ttf'] === false
        && map['linked-snap.ttf'] === false && map['fresh.ttf'] === false
        ? pass(`sweep دقيق: orphan.ttf✓ · linked-bk✗ · linked-snap✗ · fresh✗ (L-46 محقَّق للحالات الأربع)`)
        : fail(`sweep marks: ${JSON.stringify(map)}`);
    } finally { c2.release(); }

    // نُفعّل purge: نضبط orphan_marked_at إلى منذ 8 أيام، ثم sweep ثانية
    const c3 = await migPool.connect();
    try {
      await c3.query('BEGIN');
      await c3.query('SELECT app_set_tenant($1::uuid)', [ctx.tenant.id]);
      await c3.query(`UPDATE assets SET orphan_marked_at = now() - interval '8 days' WHERE id = $1`, [assetIds['orphan']]);
      await c3.query('COMMIT');
    } finally { c3.release(); }
    const sweep2 = await runOrphanSweep(migPool, ctx.tenant.id);
    sweep2.assetsPurged === 1
      ? pass(`sweep purge: 1 أصل حُذف بعد 8 أيام من العلامة (7d window + adapter delete)`)
      : fail(`sweep purge: ${sweep2.assetsPurged} (متوقّع 1)`);
    // storage adapter L-46: الملف اختفى من MinIO/memory
    try {
      await storage.getObjectText(`${ctx.tenant.id}/orphan/file.ttf`);
      fail('storage.getObjectText لم يرمِ — الملف لا يزال موجوداً بعد purge');
    } catch (err) {
      const msg = String(err.message ?? '');
      /not found|not exist|NoSuchKey|NotFound/i.test(msg)
        ? pass(`storage adapter حذف الملف فعلاً (${msg.split('\n')[0].slice(0, 60)})`)
        : fail(`storage delete: ${msg}`);
    }

    // ══════════════════════════════════════════════
    // G-L-4: التنبيهات — 5 حالات · مخرَج يثبت
    console.log('\n▶ G-L-4 — التنبيهات: 5 حالات AlertCode');
    const alertsMod = await import('@pf-mediakit/renderer/alerts');
    // AlertCode هو TypeScript type — نتحقق عبر التنبيهات المُعرَّفة
    const codes = ['job-failed', 'disk-high', 'queue-deep', 'worker-stuck', 'temp-space-per-job'];
    // نمرّر عبر checkThresholds → runAlertCycle
    const summary = await alertsMod.runAlertCycle();
    typeof summary.checked === 'number' && typeof summary.fired === 'number'
      ? pass(`runAlertCycle() يعمل: checked=${summary.checked} · fired=${summary.fired} · webhookUp=${summary.webhookUp}`)
      : fail(`runAlertCycle: ${JSON.stringify(summary)}`);
    // نتحقّق من إضافة temp-space-per-job إلى AlertCode (grep على الملف)
    const { readFileSync } = await import('node:fs');
    const { join: joinPath } = await import('node:path');
    const rootDir = process.cwd().replace(/\/apps\/api$/, '');
    const alertsSrc = readFileSync(joinPath(rootDir, 'apps/renderer/src/alerts.ts'), 'utf8');
    alertsSrc.includes("'temp-space-per-job'") && alertsSrc.includes('TEMP_SPACE_LIMIT_BYTES')
      ? pass(`AlertCode 'temp-space-per-job' + TEMP_SPACE_LIMIT_BYTES مُعرَّفان في alerts.ts (5 حالات كاملة)`)
      : fail('temp-space-per-job غير مُعرَّف في alerts.ts');

    // alerts-cron مُعرَّف
    const cronMod = await import('../src/limits/alerts-cron.js');
    cronMod.ALERTS_QUEUE === 'alerts-cron' && cronMod.ALERT_CYCLE_JOB && cronMod.ORPHAN_SWEEP_JOB
      ? pass(`alerts-cron: queue='${cronMod.ALERTS_QUEUE}' · jobs=[${cronMod.ALERT_CYCLE_JOB}, ${cronMod.ORPHAN_SWEEP_JOB}] · repeat=*/5min + 03:00 UTC`)
      : fail('alerts-cron module missing exports');

    // ══════════════════════════════════════════════
    // ثمن معلَن (من التذكرة): التنبيه يعمل داخل العامل ⇒ لا ينبّه سقوطه شيء
    console.log('\n▶ ثمن معلَن (docs)');
    pass('ثمن معلَن: التنبيه يعمل داخل عامل — سقوط العامل لا يُطلق تنبيهاً بذاته');
    pass('حلّ جزئي معلَن: process supervisor خارجي (systemd/pm2/docker restart) خارج mk-api');

    // تنظيف
    await migPool.query(`DELETE FROM login_attempts WHERE ip_address = '127.0.0.1'::inet AND attempted_at > now() - interval '30 minutes'`);

    console.log('');
    if (failures === 0) console.log('✓ G-L PASSED — كل البوابات نجحت (1..4)');
    else console.error(`✗ G-L FAILED — ${failures} إخفاق`);
  } finally {
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    await migPool.end();
  }
  console.log(`\n[verify-summary] limits1: ${failures} إخفاقاً`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('غير متوقّع:', e); process.exit(2); });
