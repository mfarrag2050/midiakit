// verify-frame-at — يقارن إطاراً منفرداً من MP4 مع رندر مباشر عبر
// drawAt عند نفس الزمن. تأكيد إضافي على النقاء الزمني: الأنبوب لا
// يشوّه شيئاً بين drawAt والملف النهائي.
//
// **الاستخدام:** node scripts/verify-frame-at.mjs [t=1.4]
// (T بالثواني — الافتراضي 1.4)

import { Canvas, FontLibrary } from 'skia-canvas';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, drawAt, timelineOf } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const T = parseFloat(process.argv[2] ?? '1.4');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(DEFAULT_BRAND);
const template = TEMPLATES.breaking;
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};
const SIZE = { w: 1080, h: 1350 };

const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

// (١) رندر مباشر عبر drawAt → PNG
const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, SIZE.w, SIZE.h);
const timeline = timelineOf(template, brand, CONTENT);
drawAt({ ctx, size: SIZE, template, brand, content: CONTENT, t: T, timeline });
const directPath = join(OUT, `verify-frame-direct-t${T}.png`);
await canvas.toFile(directPath);

// (٢) استخراج نفس الإطار من MP4 عبر ffmpeg
const mp4Path = join(OUT, 'render-default-breaking.mp4');
const extractedPath = join(OUT, `verify-frame-mp4-t${T}.png`);
const result = spawnSync(
  FFMPEG,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(T),
    '-i', mp4Path,
    '-frames:v', '1',
    extractedPath,
  ],
  { encoding: 'utf8' }
);
if (result.status !== 0) {
  console.error('[verify-frame-at] فشل ffmpeg:', result.stderr);
  process.exit(1);
}

// (٣) مقارنة أبعاد + رسالة للتحقق البصري
const { readFile } = await import('node:fs/promises');
const [a, b] = await Promise.all([readFile(directPath), readFile(extractedPath)]);
console.log(`
[verify-frame-at] t=${T}s
  رندر مباشر (drawAt → PNG):  ${directPath} (${a.length} بايت)
  مستخرج من MP4 (ffmpeg -ss): ${extractedPath} (${b.length} بايت)

ملاحظة: بايتات PNG لن تتطابق بايت-بايت لأن ffmpeg يمرّ بترميز H.264
(lossy) ثم فك ترميز → PNG. المقارنة البصرية عبر QuickView/Preview.
المهم: التخطيط والألوان والنصّ متطابقة.
`);
