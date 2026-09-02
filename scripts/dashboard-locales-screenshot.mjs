// dashboard-locales-screenshot — لقطة من كل وضع لغة (ar/mixed/en).
//
// **يفترض:** الخادم يعمل على 19030 (start أو dev). يُدخل 4 مهام urgent
// ليتوفر محتوى ظاهر (مهام نشطة/منتظرة، حالة نظام، عتبات)، ثم يلتقط
// /client و /ops في الأوضاع الثلاثة عبر `?locale=X` (تتخطّى localStorage).

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
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
const LOCALES = ['ar', 'mixed', 'en'];

async function cleanRedis() {
  const conn = getConnection();
  const keys = await conn.keys(`${BULLMQ_PREFIX}:*`);
  if (keys.length > 0) await conn.del(...keys);
}

async function screenshot(url, filename, waitMs = 3500) {
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
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`))
    );
  });
  console.log(`[shot] ${filename}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await cleanRedis();

  // ندخل 12 مهمة لضمان محتوى ظاهر لكل الجولات (2 نشطة و 10 منتظرة)
  console.log('[setup] إدخال 12 مهمة…');
  for (let i = 0; i < 12; i++) {
    await enqueueRenderJob('urgent', {
      tenantId: TENANT,
      templateId: 'breaking',
      brand,
      content: CONTENT,
      size: SIZE,
      outPath: `/tmp/loc-shot-${i}.mp4`,
    });
  }

  // نشغّل العمّال لثانية → 2 نشطة، الباقي prioritized — أغنى مشهد
  const workers = startWorkers();
  await new Promise((r) => setTimeout(r, 800));

  for (const loc of LOCALES) {
    await screenshot(
      `${DASH_URL}/ops?locale=${loc}`,
      `ops-${loc}.png`
    );
    await screenshot(
      `${DASH_URL}/client?tenantId=${TENANT}&locale=${loc}`,
      `client-${loc}.png`
    );
  }

  await workers.stop();
  await closeQueues();
  console.log(`\nكل اللقطات في: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[shot] فشل:', err);
  process.exit(1);
});
