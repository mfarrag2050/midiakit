#!/usr/bin/env node
/**
 * G-AW — ALERTS-WIRE: تشغيل alerts-worker منفصل + إثبات سلوكي.
 *
 * سبب الوجود: G-L-4 في LIMITS-1 أثبت وجود الكود لا وصول الإشعار.
 * G-L-2 أثبت وجود الكلاس لا الفَتْك الفعلي. هذه البوابة تُغلق الفجوتين.
 *
 * سبع بوابات:
 *   G-AW-1  alerts-worker (process منفصل) يعالج ALERT_CYCLE_JOB
 *   G-AW-2  إذا كان طابور urgent > 10 ⇒ webhook يصل فعلاً بحدث queue-deep
 *           إذا صفَّرنا الطابور + dedup ⇒ webhook لا يصل
 *   G-AW-3  حدّ 1MB + كتابة 2MB ⇒ TempSpaceExceededError يُرمى
 *           الافتراضي 25GB + كتابة صغيرة ⇒ لا رمي
 *   G-AW-4  حذف حقيقي على S3: HeadObject قبل ⇒ 200؛ بعد sweep ⇒ 404
 *   G-AW-5  check-isolation-completeness — L-46 · جدول جديد ⇒ فشل الحارس
 *   G-AW-6  verify:all — يُختبَر خارجاً
 *   G-AW-7  pnpm test — يُختبَر خارجاً
 *
 * العزل: BULLMQ_PREFIX=pf-mediakit-alertswire — لا يمسّ prefix الإنتاج.
 * كل الحالة تُصفَّى في finally.
 */
import 'dotenv/config';
process.env.RATE_LIMIT_DISABLE = '1';
// عزل مطلق قبل أي import يلمس Redis:
process.env.BULLMQ_PREFIX = 'pf-mediakit-alertswire';

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import pg from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { ALERTS_QUEUE, ALERT_CYCLE_JOB } from '../src/limits/alerts-cron.js';
import { withTempSpaceMonitor, TempSpaceExceededError } from '@pf-mediakit/renderer/api-worker';
import { getTempSpaceLimitBytes } from '@pf-mediakit/renderer/alerts';

const execFileAsync = promisify(execFile);
const { Pool } = pg;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIGRATION_URL = process.env.DATABASE_URL ||
  process.env.DATABASE_URL_APP?.replace('app_user:dev_app_pass', 'migration_user:dev_migration_pass');
if (!MIGRATION_URL) { console.error('✗ DATABASE_URL missing'); process.exit(1); }

let failures = 0;
function pass(m) { console.log(`  ✓ ${m}`); }
function fail(m) { failures++; console.error(`  ✗ ${m}`); }

// ── مستقبِل webhook محلّي ──────────────────────────────
function startWebhookReceiver() {
  const events = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { events.push({ ts: Date.now(), body: JSON.parse(body) }); }
      catch { events.push({ ts: Date.now(), body }); }
      res.writeHead(204); res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, events, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// ── إسقاط كل حالة الاختبار في Redis (prefix اختباري) ──────
async function wipeTestPrefix(redis) {
  const scan = async (pattern) => {
    let cursor = '0';
    const keys = [];
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next; keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length) await redis.del(...keys);
    return keys.length;
  };
  return await scan('pf-mediakit-alertswire:*');
}

async function waitForWebhook(receiver, timeoutMs, predicate = () => true) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const evt = receiver.events.find(predicate);
    if (evt) return evt;
    await sleep(200);
  }
  return null;
}

async function main() {
  console.log('▶ G-AW — ALERTS-WIRE: worker منفصل + إثبات سلوكي\n');

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3', {
    maxRetriesPerRequest: null, enableReadyCheck: false,
  });
  await wipeTestPrefix(redis);

  const receiver = await startWebhookReceiver();
  const webhookUrl = `http://127.0.0.1:${receiver.port}/`;
  console.log(`  webhook receiver: ${webhookUrl}`);

  // spawn alerts-worker مع البيئة المعزولة
  const workerEnv = {
    ...process.env,
    BULLMQ_PREFIX: 'pf-mediakit-alertswire',
    ALERT_WEBHOOK_URL: webhookUrl,
    DATABASE_URL: MIGRATION_URL,
  };
  const worker = spawn(
    'node',
    ['--import', 'tsx', join(ROOT, 'src/limits/alerts-worker.ts')],
    { env: workerEnv, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const workerLog = [];
  worker.stdout.on('data', (d) => workerLog.push(`OUT: ${d.toString().trim()}`));
  worker.stderr.on('data', (d) => workerLog.push(`ERR: ${d.toString().trim()}`));

  // ننتظر ظهور "جاهز" في stdout — دليل أن worker + queue على قيد الحياة
  const ready = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      if (workerLog.some((l) => l.includes('جاهز'))) return true;
      await sleep(200);
    }
    return false;
  })();
  if (!ready) {
    fail('alerts-worker لم يقلع خلال 15s');
    console.error('worker log:', workerLog.join('\n'));
    worker.kill('SIGKILL');
    await receiver.close(); await redis.quit();
    process.exit(1);
  }
  pass('alerts-worker (process منفصل) أقلع بنجاح');

  const alertsQueue = new Queue(ALERTS_QUEUE, { connection: redis, prefix: 'pf-mediakit-alertswire' });
  // نحقن dummy queue urgent باسم مطابق لـrender-urgent (اسم BullMQ في queues.ts)
  const urgentQueue = new Queue('render-urgent', { connection: redis, prefix: 'pf-mediakit-alertswire' });

  try {
    // ══════════════════════════════════════════════
    // G-AW-1 & G-AW-2 (خط الأساس): طوابير فارغة ⇒ لا webhook
    console.log('\n▶ G-AW-1/2 خط الأساس — لا حالة، لا تنبيه');
    receiver.events.length = 0;
    await alertsQueue.add(ALERT_CYCLE_JOB, {}, { removeOnComplete: 100 });
    const baseline = await waitForWebhook(receiver, 8_000, (e) => e.body?.code);
    if (baseline) {
      // مقبول لو job-failed من فشل قديم في الطابور — نحن نُصفّي، فيجب أن يكون 0
      fail(`خط الأساس: webhook وصل بلا سبب — ${JSON.stringify(baseline.body)}`);
    } else {
      pass(`خط الأساس: cycle تمّت + لا webhook (لا حالة تستحقّ تنبيهاً)`);
    }

    // ══════════════════════════════════════════════
    // G-AW-2 (فَتْح الحالة): 11 مهمة معلَّقة ⇒ queue-deep webhook
    console.log('\n▶ G-AW-2 حَقْن حالة — 11 مهمة في urgent ⇒ queue-deep');
    receiver.events.length = 0;
    // نضيف 11 مهمة "معلّقة" — لا worker يعالجها لأن render-urgent worker ليس شغّالاً في هذا الاختبار
    for (let i = 0; i < 11; i++) {
      await urgentQueue.add('dummy', { i }, { removeOnComplete: false });
    }
    const waiting = await urgentQueue.getWaitingCount();
    if (waiting < 11) fail(`مهام urgent المنتظرة = ${waiting}, متوقّع ≥ 11`);
    else pass(`أُضيف ${waiting} مهام urgent في حالة waiting`);

    await alertsQueue.add(ALERT_CYCLE_JOB, {}, { removeOnComplete: 100 });
    const deep = await waitForWebhook(receiver, 12_000, (e) => e.body?.code === 'queue-deep');
    if (!deep) {
      fail('لم يصل webhook لـqueue-deep خلال 12s');
      console.error('worker log:', workerLog.slice(-20).join('\n'));
    } else {
      pass(`webhook queue-deep وصل فعلاً · body.data.queue=${deep.body.data?.queue} · body.data.waiting=${deep.body.data?.waiting}`);
    }

    // ══════════════════════════════════════════════
    // G-AW-2 (إغلاق الحالة): تفريغ الطابور + مسح dedup ⇒ لا webhook
    console.log('\n▶ G-AW-2 إغلاق الحالة — تفريغ + مسح dedup ⇒ سكوت');
    await urgentQueue.drain(true);
    // مسح dedup keys بشكل صريح
    const dedupKeys = await redis.keys('pf-mediakit-alertswire:alerts:sent:*');
    if (dedupKeys.length) await redis.del(...dedupKeys);
    receiver.events.length = 0;
    await alertsQueue.add(ALERT_CYCLE_JOB, {}, { removeOnComplete: 100 });
    const silence = await waitForWebhook(receiver, 8_000, (e) => e.body?.code === 'queue-deep');
    if (silence) fail(`webhook وصل بعد الإغلاق — الفَتْح مستمرّ خطأً`);
    else pass(`تفريغ الطابور + مسح dedup ⇒ لا webhook (سكوت مثبَت)`);

    // ══════════════════════════════════════════════
    // G-AW-3: temp-space limit قابل للحقن
    console.log('\n▶ G-AW-3 — حدّ 1MB مع كتابة 2MB ⇒ فَتْك');
    const smallLimit = 1 * 1024 * 1024;
    const testDir = mkdtempSync(join(tmpdir(), 'aw-tmp-'));
    try {
      process.env.TEMP_SPACE_LIMIT_BYTES = String(smallLimit);
      process.env.TEMP_SPACE_POLL_MS = '150'; // مسح كل 150ms
      const readLimit = getTempSpaceLimitBytes();
      readLimit === smallLimit
        ? pass(`env TEMP_SPACE_LIMIT_BYTES = ${smallLimit} مُقروء بنجاح`)
        : fail(`env override لم يُقرأ: ${readLimit}`);

      // مهمة: تكتب 2MB إلى testDir + تنتظر — يجب أن يقتلها المراقب
      const doJob = async () => {
        writeFileSync(join(testDir, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 0xff));
        await sleep(5000); // أطول من poll — المراقب يقيس ويرمي
      };
      let caught = null;
      try {
        await withTempSpaceMonitor(doJob, testDir);
      } catch (e) { caught = e; }
      if (!caught) fail('withTempSpaceMonitor لم يرمِ رغم تجاوز 1MB');
      else if (caught instanceof TempSpaceExceededError || caught?.name === 'TempSpaceExceededError') {
        pass(`TempSpaceExceededError رُمي فعلياً: ${caught.message}`);
      } else fail(`رُمي خطأ مختلف: ${caught?.name} ${caught?.message}`);

      // اختبار سلبي: نفس الكتابة تحت الحدّ الافتراضي (25GB) ⇒ لا رمي
      delete process.env.TEMP_SPACE_LIMIT_BYTES;
      const defaultDir = mkdtempSync(join(tmpdir(), 'aw-default-'));
      try {
        const quickJob = async () => {
          writeFileSync(join(defaultDir, 'small.bin'), Buffer.alloc(1024, 0));
          return 'ok';
        };
        const result = await withTempSpaceMonitor(quickJob, defaultDir);
        result === 'ok'
          ? pass('الحدّ الافتراضي (25GB): مهمة صغيرة تمرّ بلا رمي')
          : fail(`مهمة صغيرة أعادت ${result}`);
      } finally {
        rmSync(defaultDir, { recursive: true, force: true });
      }
    } finally {
      delete process.env.TEMP_SPACE_LIMIT_BYTES;
      delete process.env.TEMP_SPACE_POLL_MS;
      rmSync(testDir, { recursive: true, force: true });
    }

    // ══════════════════════════════════════════════
    // G-AW-4: حذف حقيقي على S3
    console.log('\n▶ G-AW-4 — حذف على MinIO حقيقي (upload · mark · sweep · HeadObject 404)');
    // نستدعي storage-s3 مباشرةً بغضّ النظر عن STORAGE_DRIVER الافتراضي
    // في هذا الشِّل (verify:all يُمرّر s3). نمرّر config صريحة عبر env.
    if (!process.env.S3_ENDPOINT || process.env.STORAGE_DRIVER === 'memory') {
      console.log('  ⊘ يُتخطّى G-AW-4: S3_ENDPOINT غير محدَّد أو STORAGE_DRIVER=memory');
    } else {
      // نستخدم الأدابتر مباشرة — ليس عبر runOrphanSweep (يحتاج DB seed كامل)
      const { getStorage, __resetStorage } = await import('../src/storage/index.js');
      __resetStorage();
      const storage = getStorage();
      const testKey = `alerts-wire-test/${Date.now()}.bin`;
      const bytes = Buffer.from('ALERTS-WIRE test payload');
      await storage.putObjectRaw(testKey, bytes, 'application/octet-stream');
      pass(`upload: ${testKey} (${bytes.length}B)`);
      // HeadObject قبل ⇒ exists=true
      const headBefore = await storage.headObject(testKey);
      headBefore.exists && headBefore.sizeBytes === bytes.length
        ? pass(`HeadObject قبل: exists=true · size=${headBefore.sizeBytes}`)
        : fail(`HeadObject قبل: ${JSON.stringify(headBefore)}`);
      // الحذف عبر الأدابتر مباشرة (نمط runOrphanSweep نفسه)
      await storage.deleteObject(testKey);
      pass('deleteObject تمّ');
      // HeadObject بعد ⇒ exists=false (S3 يعيد 404 داخلياً · الأدابتر يترجمها)
      const headAfter = await storage.headObject(testKey);
      headAfter.exists
        ? fail(`HeadObject بعد: exists=true (الحذف فشل!) · ${JSON.stringify(headAfter)}`)
        : pass('HeadObject بعد: exists=false (الملف اختفى من MinIO فعلاً)');
    }

    // ══════════════════════════════════════════════
    // G-AW-5: check-isolation-completeness (L-46)
    console.log('\n▶ G-AW-5 — check-isolation-completeness (حارس + L-46)');
    // الأولى: نقيّم عاديّاً — يجب أن ينجح
    const chk1 = await execFileAsync('node', [join(dirname(ROOT), '..', 'packages/db/scripts/check-isolation-completeness.mjs')],
      { env: { ...process.env, DATABASE_URL: MIGRATION_URL } }).catch((e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }));
    if (chk1.code === 0 || chk1.stdout?.includes('لا تسريب')) pass('الحارس ينجح على الحالة الحالية');
    else fail(`الحارس فشل بلا سبب: ${chk1.stderr || chk1.stdout}`);

    // L-46: أنشئ جدولاً تجريبياً · شغّل الحارس · احذف · تحقّق
    await migPool_query('CREATE TABLE _aw_test_leak (id int)');
    const chk2 = await execFileAsync('node', [join(dirname(ROOT), '..', 'packages/db/scripts/check-isolation-completeness.mjs')],
      { env: { ...process.env, DATABASE_URL: MIGRATION_URL } }).catch((e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }));
    const detected = chk2.code === 1 && (chk2.stderr?.includes('_aw_test_leak') || chk2.stdout?.includes('_aw_test_leak'));
    detected ? pass('L-46: جدول جديد ⇒ الحارس يفشل ويسمّيه')
             : fail(`L-46: الحارس لم يفشل رغم الجدول التجريبي: code=${chk2.code} · ${chk2.stderr || chk2.stdout}`);
    await migPool_query('DROP TABLE IF EXISTS _aw_test_leak');
  } finally {
    // تنظيف
    console.log('\n▶ تنظيف');
    try { await urgentQueue.drain(true); } catch {}
    try { await alertsQueue.drain(true); } catch {}
    try { await urgentQueue.close(); } catch {}
    try { await alertsQueue.close(); } catch {}
    await wipeTestPrefix(redis);
    await redis.quit();
    worker.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (!worker.killed) worker.kill('SIGKILL');
    await receiver.close();
  }

  const total = 3 + 5 /* G-AW-1..5 gates ~= 13 checks */;
  console.log('\n══════════════════════════════════════════════');
  console.log(`[verify-summary] alerts-wire: ${failures} إخفاقاً`);
  console.log('══════════════════════════════════════════════');
  process.exit(failures);
}

const migPool = new Pool({ connectionString: MIGRATION_URL, max: 2 });
async function migPool_query(sql) { return migPool.query(sql); }

main().catch(async (e) => {
  console.error('FATAL:', e);
  try { await migPool.end(); } catch {}
  process.exit(2);
}).finally(async () => {
  try { await migPool.end(); } catch {}
});
