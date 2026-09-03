// scripts/preview-caption-modes-video.mjs — يُصدّر out/caption-modes-demo.mp4.
//
// الأنماط الخمسة (wordColor · wordBackground · progressiveReveal ·
// wordScale · none) متتابعة على نفس المقطع + نصّ توضيحي يعرّف كل نمط.
// مدة كل نمط = مدة المقطع (~7s) + 1s شارة → ~8s. المجموع ~40s.

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

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const fixture = JSON.parse(
  await readFile(join(ROOT, 'fixtures/caption/breaking-news.json'), 'utf-8')
);
const segments = fixture.segments;

// خمس هويّات — نفس القيم عدا highlightMode + justify صريح
function brandWith(mode) {
  return resolveBrand({
    ...DEFAULT_BRAND,
    colors: {
      ...DEFAULT_BRAND.colors,
      text: '#F8F4E9',
      accent: '#E8815A',
      surface: '#0B2340',
    },
    typography: {
      ...DEFAULT_BRAND.typography,
      caption: {
        ...DEFAULT_BRAND.typography.caption,
        highlightMode: mode,
        justify: 'inherit', // صريح — يفعّل الكشيدة بحسب brand.typography.justify
      },
    },
  });
}

const MODES = [
  { key: 'wordColor',         label: 'wordColor · لون الكلمة النشطة' },
  { key: 'wordBackground',    label: 'wordBackground · خلفية ملوّنة' },
  { key: 'progressiveReveal', label: 'progressiveReveal · ظهور تدريجي' },
  { key: 'wordScale',         label: 'wordScale · تكبير خفيف' },
  { key: 'none',              label: 'none · بلا تمييز' },
];

const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const CLIP_DURATION = 7.0;   // مدة كل نمط
const FRAMES_PER_CLIP = Math.round(CLIP_DURATION * FPS);
const TOTAL_DURATION = MODES.length * CLIP_DURATION;
const TOTAL_FRAMES = MODES.length * FRAMES_PER_CLIP;
const OUT_PATH = join(OUT_DIR, 'caption-modes-demo.mp4');

console.log(`[modes-video] ${SIZE.w}×${SIZE.h} @${FPS}fps · ${TOTAL_DURATION}s · ${TOTAL_FRAMES} إطار · ${MODES.length} أنماط`);

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

const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');

let globalFrame = 0;
for (const mode of MODES) {
  const brand = brandWith(mode.key);
  for (let f = 0; f < FRAMES_PER_CLIP; f++) {
    ctx.clearRect(0, 0, SIZE.w, SIZE.h);
    ctx.fillStyle = brand.colors.surface;
    ctx.fillRect(0, 0, SIZE.w, SIZE.h);

    // شريط عنوان النمط في الأعلى
    ctx.fillStyle = brand.colors.text;
    ctx.font = '400 32px "IBM Plex Sans Arabic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = 'rtl';
    ctx.fillText(mode.label, SIZE.w / 2, 60);

    // مؤقّت المقطع الحالي
    const clipT = f / FPS;
    ctx.font = '400 22px "IBM Plex Sans Arabic", sans-serif';
    ctx.globalAlpha = 0.55;
    ctx.fillText(`t = ${clipT.toFixed(2)}s`, SIZE.w / 2, 110);
    ctx.globalAlpha = 1.0;

    // نمط واحد لكل حلقة — prepareCaption cache بمفتاح segment ref.
    // يمكن مشاركة النفس عبر الأنماط لأن التحضير مستقل عن highlightMode.
    drawCaption(ctx, SIZE, brand, { segments, t: clipT });

    const img = ctx.getImageData(0, 0, SIZE.w, SIZE.h);
    const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    globalFrame++;
    if (globalFrame % 30 === 0 || globalFrame === TOTAL_FRAMES) {
      process.stdout.write(`\r[modes-video] ${globalFrame}/${TOTAL_FRAMES}`);
    }
  }
}
ff.stdin.end();

const code = await done;
console.log('');
if (code !== 0) {
  console.error(`[modes-video] ffmpeg failed with exit ${code}`);
  process.exit(1);
}
const { stat } = await import('node:fs/promises');
const s = await stat(OUT_PATH);
console.log(`[modes-video] ✓ ${OUT_PATH} (${(s.size / 1024).toFixed(1)} KB)`);
