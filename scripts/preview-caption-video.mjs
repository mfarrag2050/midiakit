// scripts/preview-caption-video.mjs — يصدّر out/caption-demo.mp4 مباشرة.
//
// نفس منطق apps/renderer (ADR-008: أنبوب rawvideo إلى FFmpeg بلا ملفات
// إطارات على القرص). كل إطار يستدعي drawCaption بـt الحالي، فيتقدّم
// التلوين مع الفيديو.

import { Canvas, FontLibrary } from 'skia-canvas';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, drawCaption } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// خطوط
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// فكستشر
const fixture = JSON.parse(
  await readFile(join(ROOT, 'fixtures/caption/breaking-news.json'), 'utf-8')
);
const segments = fixture.segments;

// هوية بألوان واضحة
const brand = resolveBrand({
  ...DEFAULT_BRAND,
  colors: {
    ...DEFAULT_BRAND.colors,
    text: '#F8F4E9',
    accent: '#E8815A',
    surface: '#0B2340',
  },
});

// ── إعدادات الفيديو ────────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const DURATION = 7.0; // ثانية — يغطي المقطع (0.20 → 5.02) + هامش
const FRAME_COUNT = Math.round(DURATION * FPS);
const OUT_PATH = join(OUT_DIR, 'caption-demo.mp4');

console.log(`[caption-video] ${SIZE.w}×${SIZE.h} @${FPS}fps · ${DURATION}s · ${FRAME_COUNT} إطار → ${OUT_PATH}`);

// ── FFmpeg: rawvideo/stdin → H.264 ────────────────────
const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba',
  '-s', `${SIZE.w}x${SIZE.h}`, '-r', String(FPS),
  '-i', 'pipe:0',
  '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-shortest',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '128k',
  OUT_PATH,
];
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

const done = new Promise((resolve, reject) => {
  ff.on('error', reject);
  ff.on('close', (code) => resolve(code));
});

// ── حلقة الإطارات ──────────────────────────────────────
const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');

for (let f = 0; f < FRAME_COUNT; f++) {
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
  // خلفية داكنة
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  const t = f / FPS;
  drawCaption(ctx, SIZE, brand, { segments, t });

  const img = ctx.getImageData(0, 0, SIZE.w, SIZE.h);
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  if (!ff.stdin.write(buf)) {
    await new Promise((r) => ff.stdin.once('drain', r));
  }
  if ((f + 1) % 30 === 0 || f + 1 === FRAME_COUNT) {
    process.stdout.write(`\r[caption-video] ${f + 1}/${FRAME_COUNT}`);
  }
}
ff.stdin.end();

const exitCode = await done;
console.log('');
if (exitCode !== 0) {
  console.error(`[caption-video] FFmpeg failed with exit ${exitCode}`);
  process.exit(1);
}

const { stat } = await import('node:fs/promises');
const s = await stat(OUT_PATH);
console.log(`[caption-video] ✓ ${OUT_PATH} (${(s.size / 1024).toFixed(1)} KB)`);
