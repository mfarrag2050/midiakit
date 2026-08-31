// test-peak-load — بوابة الذروة (docs/08 §SLA و §المبدأ).
//
// **الحالة:** 9 مهام urgent متزامنة من 3 مستأجرين (3 لكلٍّ).
// **البوابة:** لا مهمة عاجلة تتجاوز 45 ثانية للبدء (docs/08 §SLA).
//
// **التصميم:**
//   1. ننظّف Redis (DB 3، بادئة pf-mediakit) — نبدأ بيئة نظيفة
//   2. نشغّل العمّال في نفس العملية (لا process spawning)
//   3. نُدخل 9 مهام urgent متتالية من tenants A/B/C بترتيب A1,B1,C1,A2,B2,C2,A3,B3,C3
//   4. نلتقط زمن `active` و `completed` لكل مهمة عبر أحداث BullMQ
//   5. نحسب wait = active - added لكل مهمة، ونصنّفها بحسب tenant
//   6. نطبع الجدول ونقارن بـ45 ثانية

import { performance } from 'node:perf_hooks';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { FontLibrary } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '@pf-mediakit/engine';
import {
  enqueueRenderJob,
  getConnection,
  BULLMQ_PREFIX,
  allQueuesSnapshot,
  closeQueues,
  createQueueEvents,
} from '@pf-mediakit/renderer/queues';
import { startWorkers } from '@pf-mediakit/renderer/worker';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// تسجيل الخط للـrender الحقيقي
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(DEFAULT_BRAND);
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};
const SIZE = { w: 1080, h: 1350 };

const OUT_DIR = join(ROOT, 'out', 'peak-test');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// ── تنظيف الطابور من أيّ بقايا ─────────────────────
const conn = getConnection();
async function cleanRedis() {
  const keys = await conn.keys(`${BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await conn.del(...keys);
  const tenantKeys = await conn.keys(`${BULLMQ_PREFIX}:tenant:*`);
  if (tenantKeys.length > 0) await conn.del(...tenantKeys);
}
await cleanRedis();

console.log('[test-peak] بيئة نظيفة — بدأ التشغيل');
console.log(`[test-peak] REDIS_URL=${process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3 (افتراضي)'}`);
console.log(`[test-peak] BULLMQ_PREFIX=${BULLMQ_PREFIX}`);

// ── تشغيل العمّال ────────────────────────────────
const runner = startWorkers();
console.log(
  `[test-peak] العمّال شغّالون: urgent=${runner.workers[0]?.opts.concurrency} · normal=${runner.workers[1]?.opts.concurrency} · edit=1 · batch=1`
);
console.log(`[test-peak] perTenantCap = ${runner.perTenantCap} (نصف مجموع urgent+normal)`);

// ── تتبّع الأحداث ────────────────────────────────
const events = createQueueEvents('urgent');
await events.waitUntilReady();

/** @type {Map<string, {tenantId: string, addedAt: number, activeAt?: number, completedAt?: number, failedAt?: number}>} */
const tracker = new Map();

events.on('active', ({ jobId }) => {
  const t = tracker.get(jobId);
  if (t) t.activeAt = performance.now();
});
events.on('completed', ({ jobId }) => {
  const t = tracker.get(jobId);
  if (t) t.completedAt = performance.now();
});
events.on('failed', ({ jobId, failedReason }) => {
  const t = tracker.get(jobId);
  if (t) {
    t.failedAt = performance.now();
    console.warn(`[test-peak] job ${jobId} فشل: ${failedReason?.slice(0, 100)}`);
  }
});

// ── الإدخال: 9 مهام بترتيب A1,B1,C1,A2,B2,C2,A3,B3,C3 ─
// (يضمن أن التوزيع بالتناوب على الأولوية يعمل — لو أدخلنا كل A أولاً
// ثم B ثم C، لكانت priority tenant A أعلى وسيقاومنا)
const TENANTS = ['tenant-A', 'tenant-B', 'tenant-C'];
const JOBS_PER_TENANT = 3;
const inputs = [];
for (let round = 0; round < JOBS_PER_TENANT; round++) {
  for (const tenantId of TENANTS) {
    inputs.push({
      tenantId,
      templateId: 'breaking',
      brand,
      content: CONTENT,
      size: SIZE,
      outPath: join(OUT_DIR, `${tenantId}-round${round + 1}.mp4`),
      fps: 30,
    });
  }
}

console.log(`[test-peak] إدخال ${inputs.length} مهمة urgent…`);
const enqueueStart = performance.now();
for (const input of inputs) {
  const id = await enqueueRenderJob('urgent', input);
  tracker.set(id, { tenantId: input.tenantId, addedAt: performance.now() });
}
const enqueueMs = performance.now() - enqueueStart;
console.log(`[test-peak] كل الإدخالات في ${enqueueMs.toFixed(0)}ms`);

// ── انتظار الاكتمال ─────────────────────────────
console.log('[test-peak] انتظار الاكتمال…');
const timeoutMs = 5 * 60 * 1000; // 5 دقائق حماية
const waitStart = performance.now();
while (performance.now() - waitStart < timeoutMs) {
  const snapshots = await allQueuesSnapshot();
  const urgent = snapshots.find((s) => s.name === 'urgent');
  if (!urgent) break;
  if (urgent.waiting === 0 && urgent.active === 0 && urgent.delayed === 0) {
    // كل المهام إمّا مكتملة أو فاشلة
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

// انتظار قصير إضافي لضمان استقبال آخر الأحداث
await new Promise((r) => setTimeout(r, 300));

// ── تحليل النتائج ──────────────────────────────
console.log('\n── نتائج المهام ──');
console.log(
  'jobId'.padEnd(8) +
    'tenant'.padEnd(12) +
    'wait(s)'.padStart(10) +
    'run(s)'.padStart(10) +
    'حالة'.padStart(12)
);
const rows = [...tracker.entries()].sort(
  (a, b) => a[1].addedAt - b[1].addedAt
);
const waits = [];
let failCount = 0;
for (const [id, t] of rows) {
  const waitMs = (t.activeAt ?? performance.now()) - t.addedAt;
  const runMs =
    t.completedAt !== undefined
      ? t.completedAt - (t.activeAt ?? t.addedAt)
      : t.failedAt !== undefined
        ? t.failedAt - (t.activeAt ?? t.addedAt)
        : 0;
  const status = t.completedAt
    ? '✓ مكتمل'
    : t.failedAt
      ? '✗ فشل'
      : '⏳ عالق';
  if (t.failedAt) failCount++;
  if (t.activeAt) waits.push(waitMs);
  console.log(
    id.padEnd(8) +
      t.tenantId.padEnd(12) +
      (waitMs / 1000).toFixed(2).padStart(10) +
      (runMs / 1000).toFixed(2).padStart(10) +
      status.padStart(12)
  );
}

const maxWait = waits.length > 0 ? Math.max(...waits) : Number.POSITIVE_INFINITY;
const meanWait = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

console.log('\n── الملخّص ──');
console.log(`  مجموع المهام: ${rows.length}`);
console.log(`  المكتملة: ${rows.length - failCount} · الفاشلة: ${failCount}`);
console.log(`  أقصى wait: ${(maxWait / 1000).toFixed(2)}s`);
console.log(`  متوسط wait: ${(meanWait / 1000).toFixed(2)}s`);
console.log(
  `  ← البوابة (docs/08): urgent max wait ≤ 45s ⇒ ${maxWait <= 45_000 ? '✓ عبرت' : '✗ فشلت'}`
);

// ── تنظيف ──────────────────────────────────
await events.close();
await runner.stop();
await closeQueues();

// exit code يعكس نتيجة البوابة
process.exit(maxWait <= 45_000 && failCount === 0 ? 0 : 1);
