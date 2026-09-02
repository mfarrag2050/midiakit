// dashboard-screenshot — يلتقط PNG لكل لوحة مع بيانات حقيقية.
//
// **التصميم:**
//   1. يُدخل 6 مهام urgent (نفس تكوين peak-load) → الطابور مشغول
//   2. يشغّل العمّال (لكن نمنعهم من إنجاز أول 2 بسرعة عبر أبعاد أكبر)
//   3. يفتح Chrome headless على /ops و /client?tenantId=eta-test-tenant
//   4. ينتظر ثانيتين ثم يلتقط PNG لكل صفحة
//   5. يوقف العمّال، ينظّف
//
// **الحاجة إلى بيانات حقيقية:** لقطة فارغة لا تثبت شيئاً — نريد الطوابير
// تُظهر أرقاماً، والمهام النشطة تُظهر أعمار، والعتبات تُظهر تعبئتها.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

import { FontLibrary } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '@pf-mediakit/engine';
import {
  enqueueRenderJob,
  getConnection,
  BULLMQ_PREFIX,
  closeQueues,
} from '@pf-mediakit/renderer/queues';
import { startWorkers } from '@pf-mediakit/renderer/worker';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'apps/dashboard/screenshots');

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
const TENANT = 'eta-test-tenant';
const DASH_URL = process.env.DASH_URL ?? 'http://127.0.0.1:19030';

async function cleanRedis() {
  const conn = getConnection();
  const keys = await conn.keys(`${BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await conn.del(...keys);
}

async function screenshot(url, filename, waitMs = 2500) {
  const outPath = join(OUT_DIR, filename);
  await new Promise((resolve, reject) => {
    const child = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        `--virtual-time-budget=${waitMs}`,
        '--window-size=1280,1800',
        `--screenshot=${outPath}`,
        url,
      ],
      { stdio: 'inherit' }
    );
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))
    );
  });
  console.log(`[shot] ${filename} ← ${url}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await cleanRedis();

  // 1) نُدخل مهاماً قبل العمّال — تبقى في الطابور بينما تُلتقط اللقطات
  console.log('[setup] إدخال 6 مهام…');
  for (let i = 0; i < 6; i++) {
    await enqueueRenderJob('urgent', {
      tenantId: TENANT,
      templateId: 'breaking',
      brand,
      content: CONTENT,
      size: SIZE,
      outPath: `/tmp/shot-${i}.mp4`,
    });
  }

  // 2) بينما لم يبدأ العمّال — نأخذ لقطة تُظهر الطابور ممتلئاً
  console.log('[shot] قبل تشغيل العمّال — طابور 6/2');
  await screenshot(`${DASH_URL}/ops`, 'ops-queue-full.png');
  await screenshot(
    `${DASH_URL}/client?tenantId=${TENANT}`,
    'client-in-queue.png'
  );

  // 3) نشغّل العمّال — بعض المهام نشطة
  console.log('[setup] تشغيل العمّال…');
  const workers = startWorkers();

  // ننتظر حتى يبدأ الرندر (~1s للـintake)
  await new Promise((r) => setTimeout(r, 2000));

  console.log('[shot] بعد بدء العمّال — نشطة');
  await screenshot(`${DASH_URL}/ops`, 'ops-in-flight.png');
  await screenshot(
    `${DASH_URL}/client?tenantId=${TENANT}`,
    'client-in-flight.png'
  );

  // 4) ننتظر انتهاء الكل
  await new Promise((r) => setTimeout(r, 20000));
  console.log('[shot] بعد الاكتمال');
  await screenshot(`${DASH_URL}/ops`, 'ops-completed.png');
  await screenshot(
    `${DASH_URL}/client?tenantId=${TENANT}`,
    'client-empty.png'
  );

  await workers.stop();
  await closeQueues();
  console.log(`\nكل اللقطات في: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[shot] فشل:', err);
  process.exit(1);
});
