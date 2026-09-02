// dashboard-eta-check — بوابة دقة التقدير على اللوحة (docs/08 §لوحة العميل).
//
// **الحالة:** ندخل N مهمة urgent، ونلتقط عند لحظة الإدخال ما تعيده
// observe.jobPosition من `expectedStartSec`، ثم نقيس الزمن الفعلي حتى
// بدء المهمة (active). البوابة: |الخطأ| ≤ 30% متوسطاً.
//
// **لماذا 30%:** التقدير يفترض متوسط زمن معالجة ثابتاً، والذروة تُظهر
// تباين طبيعي. أقلّ من 30% يعني اللوحة تُبنى الثقة (docs/08 §المبدأ).

import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FontLibrary } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '@pf-mediakit/engine';
import {
  enqueueRenderJob,
  getConnection,
  BULLMQ_PREFIX,
  closeQueues,
  createQueueEvents,
} from '@pf-mediakit/renderer/queues';
import { startWorkers } from '@pf-mediakit/renderer/worker';
import { jobPosition } from '@pf-mediakit/renderer/observe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(DEFAULT_BRAND);
const CONTENT = {
  headline: 'ارتفاع عدد الضحايا جراء الاستهداف المتواصل شمالي القطاع',
  source: 'مصدر طبي',
};
const SIZE = { w: 1080, h: 1350 };
const N = Number(process.env.ETA_N ?? 6);
const TENANT = process.env.ETA_TENANT ?? 'eta-test-tenant';

async function cleanRedis() {
  const conn = getConnection();
  const keys = await conn.keys(`${BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await conn.del(...keys);
}

async function main() {
  await cleanRedis();

  // نشترك في الأحداث أولاً — بدون workers فلا مهام تنطلق بعد.
  const events = createQueueEvents('urgent');
  await events.waitUntilReady();

  const records = new Map(); // jobId → { addedAt, predictedSec, activeAt }

  events.on('active', ({ jobId }) => {
    const rec = records.get(jobId);
    if (rec && rec.activeAt === undefined) rec.activeAt = performance.now();
  });
  events.on('completed', ({ jobId }) => {
    const rec = records.get(jobId);
    if (rec) rec.completedAt = performance.now();
  });
  events.on('failed', ({ jobId, failedReason }) => {
    const rec = records.get(jobId);
    if (rec) {
      rec.failedAt = performance.now();
      rec.failedReason = failedReason;
    }
  });

  // إدخال دفعة **قبل** تشغيل العمال، حتى نحصل على position حقيقية
  const enqueueStart = performance.now();
  for (let i = 0; i < N; i++) {
    const outPath = `/tmp/eta-${i}.mp4`;
    const addedAt = performance.now();
    const jobId = await enqueueRenderJob('urgent', {
      tenantId: TENANT,
      templateId: 'breaking',
      brand,
      content: CONTENT,
      size: SIZE,
      outPath,
    });
    const pos = await jobPosition(jobId);
    records.set(jobId, {
      idx: i,
      addedAt,
      predictedSec: pos.expectedStartSec,
      position: pos.position,
      status: pos.status,
    });
    console.log(
      `[enqueue] #${i} jobId=${jobId} position=${pos.position} predictedStart=${pos.expectedStartSec?.toFixed(2)}s status=${pos.status}`
    );
  }
  console.log(
    `[enqueue] كل الـ${N} مهام في الطابور خلال ${((performance.now() - enqueueStart) / 1000).toFixed(2)}s`
  );

  // الآن نشغّل العمال — كل الـ N مهام تنتظر ذات القدر
  const workers = startWorkers();

  // انتظر كل المهام تبدأ (أو تنتهي)
  const start = performance.now();
  const timeoutMs = 90_000;
  while (performance.now() - start < timeoutMs) {
    const anyMissing = [...records.values()].some(
      (r) => r.activeAt === undefined && r.failedAt === undefined
    );
    if (!anyMissing) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // انتظر لحظة إضافية لتُكتب completed
  await new Promise((r) => setTimeout(r, 1000));

  // النتائج
  console.log('\n──────────── نتيجة دقة التقدير ────────────');
  console.log('jobId    | pos | pred  | actual | err%');
  console.log('─────────┼─────┼───────┼────────┼──────');
  const errs = [];
  for (const [jobId, r] of records) {
    if (r.activeAt === undefined) {
      console.log(
        `${jobId.padEnd(8)} | ${String(r.position).padEnd(3)} | ${(r.predictedSec ?? 0).toFixed(1).padEnd(5)} | (لم يبدأ) | —`
      );
      continue;
    }
    const actualSec = (r.activeAt - r.addedAt) / 1000;
    const pred = r.predictedSec ?? 0;
    let errPct = 0;
    if (pred < 0.1 && actualSec < 0.5) {
      errPct = 0; // كلاهما فوري — التقدير صحيح
    } else if (pred < 0.1) {
      errPct = 100; // توقعنا فوري ولم يكن
    } else {
      errPct = ((actualSec - pred) / pred) * 100;
    }
    errs.push(Math.abs(errPct));
    console.log(
      `${jobId.padEnd(8)} | ${String(r.position).padEnd(3)} | ${pred.toFixed(1).padEnd(5)} | ${actualSec.toFixed(2).padEnd(6)} | ${errPct >= 0 ? '+' : ''}${errPct.toFixed(0)}%`
    );
  }
  const meanErr = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
  const medianErr = errs.length
    ? errs.sort((a, b) => a - b)[Math.floor(errs.length / 2)]
    : 0;
  console.log('───────────────────────────────────────────');
  console.log(`متوسط |الخطأ|: ${meanErr.toFixed(1)}%`);
  console.log(`الوسيط |الخطأ|: ${medianErr.toFixed(1)}%`);
  console.log(`البوابة: الوسيط ≤ 30%  ${medianErr <= 30 ? '✅ عبرت' : '❌ فشلت'}`);

  await events.close();
  await workers.stop();
  await closeQueues();

  process.exit(medianErr <= 30 ? 0 : 1);
}

main().catch((err) => {
  console.error('[eta-check] فشل:', err);
  process.exit(2);
});
