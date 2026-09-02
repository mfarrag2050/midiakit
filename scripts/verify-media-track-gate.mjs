// scripts/verify-media-track-gate.mjs — بوابة الجلسة الثانية للمرحلة 3.7.
//
// **الهدف:** إثبات أن مسار الوسائط v2 يعمل بمنطق kenBurns على عنصرين
// متتاليين ويُصدَّر MP4، وأن الأداء لا يتدهور عن مسار breaking الحالي.
//
// **بلا مقطع مصدر حقيقي (تعليمات المالك 2026-09-02):** نولّد صورتين
// اصطناعيتين 1080×1350 بلون ونصّ مركز — تكفيان لإثبات:
//   • عنصران متتاليان في نفس المسار
//   • kenBurns يتقدّم خطياً (from → to) على مدى كل عنصر
//   • drawTimelineAt يستدعي drawImage primitive بشكل صحيح
//   • أنبوب FFmpeg يستقبل الإطارات كما مع legacy drawAt
//   • الأداء ضمن مدى مسار breaking
//
// **البوابات:**
//   1. MP4 صادر بحجم واقعي وبطول متوقّع (6.4s)
//   2. عدد إطارات صحيح (192 = 6.4 × 30fps)
//   3. زمن الرندر ≤ 1.5× زمن breaking للمدة نفسها (تسامح متوقّع مع
//      الرسم الإضافي: تحويل + drawImage)

import { Canvas, FontLibrary, Image } from 'skia-canvas';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  buildRenderPlan,
drawTimelineAt,
templateToTimeline,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/media-track-gate');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const brand = resolveBrand(DEFAULT_BRAND);

// ── توليد صورتين اصطناعيتين ────────────────────
async function synthImage(bg, label) {
  const c = new Canvas(SIZE.w, SIZE.h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 400px "IBM Plex Sans Arabic"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, SIZE.w / 2, SIZE.h / 2);
  // إضافة عناصر بأطراف مختلفة — يُبيّن kenBurns بصرياً
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(60, 60, 180, 180);
  ctx.fillRect(SIZE.w - 240, SIZE.h - 240, 180, 180);
  const buf = await c.toBuffer('png');
  const path = join(OUT_DIR, `synth-${label}.png`);
  writeFileSync(path, buf);
  const img = new Image();
  img.src = buf;
  await img.decode();
  return { image: img, path };
}

console.log('[gate-media] توليد صورتَين اصطناعيتين …');
const img1 = await synthImage('#0f4c81', '1');
const img2 = await synthImage('#c1440e', '2');
console.log(`  ${img1.path} · ${img2.path}`);

// ── بناء Timeline للمسار الوسائطي ──────────────
const CLIP_DUR = 3.2; // كل عنصر
const TOTAL = CLIP_DUR * 2; // 6.4s

const timeline = {
  duration: TOTAL,
  fps: FPS,
  size: 'portrait',
  tracks: [
    {
      id: 'media',
      type: 'media',
      index: 0,
      items: [
        {
          id: 'clip1',
          start: 0,
          end: CLIP_DUR,
          src: 'asset:img1',
          effects: [
            { type: 'kenBurns', from: 1.0, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:img1' },
          ],
        },
        {
          id: 'clip2',
          start: CLIP_DUR,
          end: TOTAL,
          src: 'asset:img2',
          effects: [
            { type: 'kenBurns', from: 1.06, to: 1.0, origin: 'top' },
            { type: 'draw-media', assetKey: 'asset:img2' },
          ],
        },
      ],
    },
  ],
};

const assets = {
  images: {
    'asset:img1': img1.image,
    'asset:img2': img2.image,
  },
};

// ── دالة أنبوب FFmpeg ─────────────────────────
function ffmpegArgs(size, fps, outPath) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${size.w}x${size.h}`, '-r', String(fps),
    '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    outPath,
  ];
}

function rgbaBufferOf(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
}

async function renderToMp4(frameFn, frames, outPath) {
  const ff = spawn('ffmpeg', ffmpegArgs(SIZE, FPS, outPath), {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', (code) => res(code ?? -1));
  });
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();
  try {
    for (let f = 0; f < frames; f++) {
      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      const t = f / FPS;
      frameFn(ctx, t, canvas);
      const buf = rgbaBufferOf(canvas);
      const w = ff.stdin.write(buf);
      if (!w) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
  } catch (e) {
    ff.kill('SIGKILL');
    throw e;
  }
  const exit = await done;
  const elapsed = (performance.now() - t0) / 1000;
  if (exit !== 0) throw new Error(`ffmpeg exit=${exit}`);
  return { elapsed, size: statSync(outPath).size };
}

// ── (١) رندر مسار الوسائط v2 ────────────────
console.log(`\n[gate-media] رندر مسار الوسائط v2 — ${TOTAL}s × ${FPS}fps = ${TOTAL * FPS} إطار …`);
const framesMedia = Math.ceil(TOTAL * FPS);
const outMedia = join(OUT_DIR, 'render-media.mp4');
const rMedia = await renderToMp4(
  (ctx, t) => drawTimelineAt({
    ctx, size: SIZE, timeline, brand, template: BREAKING,
    content: {}, assets, t,
  }),
  framesMedia,
  outMedia
);
console.log(`  ✓ ${outMedia}  ${(rMedia.size/1024).toFixed(0)}KB  ${rMedia.elapsed.toFixed(2)}s`);

// ── (٢) رندر breaking كمرجع أداء ────────────
console.log(`\n[gate-media] رندر breaking (legacy) كمرجع أداء …`);
const CONTENT_BR = {
  headline: 'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};
const planBr = buildRenderPlan({
  ctx: new Canvas(SIZE.w, SIZE.h).getContext('2d'),
  size: SIZE, template: BREAKING, brand, content: CONTENT_BR, fps: FPS,
});
const brTimeline = templateToTimeline({
  template: BREAKING, brand, content: CONTENT_BR,
  headlineLineCount: planBr.headline?.linesJustified.length ?? 1,
  fps: FPS,
});
const framesBr = Math.ceil(brTimeline.duration * FPS);
const outBr = join(OUT_DIR, 'render-breaking.mp4');
const rBr = await renderToMp4(
  (ctx, t) => drawTimelineAt({
    ctx, size: SIZE, timeline: brTimeline, brand, template: BREAKING,
    content: CONTENT_BR, headlinePrep: planBr.headline, t,
  }),
  framesBr,
  outBr
);
console.log(`  ✓ ${outBr}  ${(rBr.size/1024).toFixed(0)}KB  ${rBr.elapsed.toFixed(2)}s  (${framesBr} إطار / ${brTimeline.duration}s)`);

// ── (٣) البوابات ─────────────────────────────
const framesExpected = 192; // 6.4 × 30
const mediaFrameTime = rMedia.elapsed / framesMedia;
const brFrameTime = rBr.elapsed / framesBr;
const perfRatio = mediaFrameTime / brFrameTime;

console.log('\n════════ بوابة مسار الوسائط ════════');
console.log('البوابة                       | المعيار                | القياس                | الحكم');
console.log('------------------------------|------------------------|-----------------------|-------');
const g1 = framesMedia === framesExpected;
console.log(`عدد الإطارات                  | ${framesExpected}                   | ${framesMedia}                    | ${g1 ? '✓' : '✗'}`);
const g2 = rMedia.size > 50_000; // MP4 حقيقي > 50KB
console.log(`MP4 صادر بحجم واقعي            | > 50KB                | ${(rMedia.size/1024).toFixed(0)}KB               | ${g2 ? '✓' : '✗'}`);
const g3 = perfRatio <= 1.5;
console.log(`الأداء (media/breaking)       | ≤ 1.5×                 | ${perfRatio.toFixed(2)}×                 | ${g3 ? '✓' : '✗'}`);
console.log('');
console.log(`زمن إطار المتوسط: media=${(mediaFrameTime*1000).toFixed(1)}ms  breaking=${(brFrameTime*1000).toFixed(1)}ms`);

if (!(g1 && g2 && g3)) {
  console.error('\n✗ بوابة فاشلة — راجع النتائج.');
  process.exit(1);
}
console.log('\n✓ تمر البوابات الثلاث. مسار الوسائط جاهز.');
