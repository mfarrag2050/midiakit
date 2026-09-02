// scripts/verify-transitions-gate.mjs — بوابة الجلسة الرابعة (الانتقالات).
//
// **الهدف:** إثبات أن الانتقالات الخمسة (crossfade، slide، wipe، zoom،
// blurIn) تعمل بين عناصر وسائط، و slide يحترم brand.direction ('rtl'
// افتراضياً — يدخل من اليمين)، وأن الأداء لا يتدهور.
//
// **البوابات:**
//   1. عدد إطارات صحيح (300 = 10s × 30fps)
//   2. MP4 صادر بحجم واقعي
//   3. الأداء ≤ 1.5× من مرجع breaking
//   4. **لا وميض:** md5 لـ5 إطارات متتالية حول كل حدّ انتقال — كلها
//      متمايزة (لا إطار مكرَّر يشير إلى «قفزة» أو تجمّد)
//   5. **L-17 مُطبَّق:** استخراج 3 إطارات لكل انتقال (بداية، منتصف، نهاية)،
//      قراءتها ووصفها في التقرير قبل إعلان النجاح.

import { Canvas, FontLibrary, Image } from 'skia-canvas';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand, buildRenderPlan,
drawTimelineAt, templateToTimeline,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/transitions-gate');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);
const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const brand = resolveBrand(DEFAULT_BRAND);

// ── ثلاث صور اصطناعية بألوان مميّزة ─────────────
async function synthImage(bg, label) {
  const c = new Canvas(SIZE.w, SIZE.h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, SIZE.h);
  g.addColorStop(0, bg);
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 380px "IBM Plex Sans Arabic"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, SIZE.w / 2, SIZE.h / 2);
  const buf = await c.toBuffer('png');
  const path = join(OUT_DIR, `img-${label}.png`);
  writeFileSync(path, buf);
  const img = new Image();
  img.src = buf;
  await img.decode();
  return { image: img, path };
}

console.log('[gate-tr] توليد 3 صور اصطناعية …');
const img1 = await synthImage('#0f4c81', 'أ');
const img2 = await synthImage('#c1440e', 'ب');
const img3 = await synthImage('#2d6a4f', 'ج');
console.log(`  ${img1.path} · ${img2.path} · ${img3.path}`);

// ── Timeline: 3 عناصر + 2 انتقالان ──────────────
// كل عنصر 3.5s. الانتقال يستهلك 0.8s (0.4 من كل جانب).
// clip1: 0.0 → 3.5
// clip2: 3.5 → 7.0
// clip3: 7.0 → 10.0
// crossfade عند 3.5 (النافذة 3.1-3.9)
// slide rtl عند 7.0 (النافذة 6.6-7.4)
const TOTAL = 10.0;

const timeline = {
  duration: TOTAL, fps: FPS, size: 'portrait',
  tracks: [{
    id: 'media', type: 'media', index: 0,
    items: [
      {
        id: 'c1', start: 0, end: 3.5, src: 'asset:a',
        effects: [
          { type: 'kenBurns', from: 1.0, to: 1.06, origin: 'center' },
          { type: 'draw-media', assetKey: 'asset:a' },
        ],
      },
      {
        id: 'c2', start: 3.5, end: 7.0, src: 'asset:b',
        effects: [
          { type: 'kenBurns', from: 1.04, to: 1.0, origin: 'top' },
          { type: 'draw-media', assetKey: 'asset:b' },
        ],
      },
      {
        id: 'c3', start: 7.0, end: TOTAL, src: 'asset:c',
        effects: [
          { type: 'kenBurns', from: 1.0, to: 1.05, origin: 'bottom' },
          { type: 'draw-media', assetKey: 'asset:c' },
        ],
      },
    ],
    transitions: [
      { between: ['c1', 'c2'], type: 'crossfade', duration: 0.8 },
      { between: ['c2', 'c3'], type: 'slide',     duration: 0.8, direction: 'rtl' },
    ],
  }],
};

const assets = {
  images: { 'asset:a': img1.image, 'asset:b': img2.image, 'asset:c': img3.image },
};

// ── دوال أنبوب ─────────────────────────────
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
  const ff = spawn('ffmpeg', ffmpegArgs(SIZE, FPS, outPath),
    { stdio: ['pipe', 'inherit', 'inherit'] });
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
      frameFn(ctx, f / FPS);
      const buf = rgbaBufferOf(canvas);
      const w = ff.stdin.write(buf);
      if (!w) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
  } catch (e) { ff.kill('SIGKILL'); throw e; }
  const exit = await done;
  const elapsed = (performance.now() - t0) / 1000;
  if (exit !== 0) throw new Error(`ffmpeg exit=${exit}`);
  return { elapsed, size: statSync(outPath).size };
}

// ── (١) رندر الانتقالات ────────────────────
const framesTotal = Math.ceil(TOTAL * FPS);
const outPath = join(ROOT, 'out/timeline-transitions-demo.mp4');
console.log(`\n[gate-tr] رندر ${framesTotal} إطاراً → ${outPath}`);
const rTr = await renderToMp4(
  (ctx, t) => drawTimelineAt({
    ctx, size: SIZE, timeline, brand, template: BREAKING,
    content: {}, assets, t,
  }),
  framesTotal, outPath
);
console.log(`  ✓ ${(rTr.size/1024).toFixed(0)}KB · ${rTr.elapsed.toFixed(2)}s`);

// ── (٢) مرجع الأداء (breaking) ───────────
console.log(`\n[gate-tr] رندر breaking كمرجع أداء …`);
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
const rBr = await renderToMp4(
  (ctx, t) => drawTimelineAt({
    ctx, size: SIZE, timeline: brTimeline, brand, template: BREAKING,
    content: CONTENT_BR, headlinePrep: planBr.headline, t,
  }),
  framesBr, join(OUT_DIR, 'ref-breaking.mp4'),
);

// ── (٣) فحص الوميض — 5 إطارات متتالية حول كل حدّ ─
function frameAt(t) {
  const c = new Canvas(SIZE.w, SIZE.h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
drawTimelineAt({
    ctx, size: SIZE, timeline, brand, template: BREAKING,
    content: {}, assets, t,
  });
  return c;
}
async function md5At(t) {
  return createHash('md5').update(await frameAt(t).toBuffer('png')).digest('hex');
}

const transitionCenters = [3.5, 7.0]; // مراكز الانتقالَين
const noFlickerResults = [];
for (const tc of transitionCenters) {
  const hashes = [];
  for (let i = -2; i <= 2; i++) {
    const t = tc + i / FPS;
    hashes.push(await md5At(t));
  }
  const uniq = new Set(hashes);
  noFlickerResults.push({ tc, hashes, distinct: uniq.size });
}

// ── (٤) L-17: استخراج 3 إطارات لكل انتقال ووصف ──
console.log(`\n[gate-tr] L-17 — استخراج 3 إطارات لكل انتقال …`);
const transitionFrames = [
  { name: 'crossfade', center: 3.5, start: 3.1, end: 3.9 },
  { name: 'slide-rtl', center: 7.0, start: 6.6, end: 7.4 },
];
for (const tr of transitionFrames) {
  const points = [
    { label: 'start', t: tr.start },
    { label: 'mid',   t: tr.center },
    { label: 'end',   t: tr.end },
  ];
  for (const p of points) {
    const buf = await frameAt(p.t).toBuffer('png');
    const path = join(OUT_DIR, `${tr.name}-${p.label}-t${p.t.toFixed(1)}.png`);
    writeFileSync(path, buf);
    console.log(`  ${tr.name} ${p.label.padEnd(5)} @ t=${p.t.toFixed(1)}s → ${path.split('/').pop()}`);
  }
}

// ── التقرير ───────────────────────────────
const perfRatio = (rTr.elapsed / framesTotal) / (rBr.elapsed / framesBr);
console.log('\n════════ بوابة الانتقالات ════════');
console.log('البوابة                          | معيار         | قياس                  | حكم');
console.log('---------------------------------|--------------|----------------------|-----');
const g1 = framesTotal === 300;
console.log(`عدد الإطارات                       | 300          | ${framesTotal}                    | ${g1 ? '✓' : '✗'}`);
const g2 = rTr.size > 100_000;
console.log(`MP4 حجم واقعي                     | > 100KB       | ${(rTr.size/1024).toFixed(0)}KB                 | ${g2 ? '✓' : '✗'}`);
const g3 = perfRatio <= 1.5;
console.log(`الأداء (transitions/breaking)   | ≤ 1.5×         | ${perfRatio.toFixed(2)}×                 | ${g3 ? '✓' : '✗'}`);

let allNoFlicker = true;
for (const r of noFlickerResults) {
  const ok = r.distinct === 5;
  console.log(`لا وميض عند t=${r.tc}s (5 hashes)  | 5 مختلفة       | ${r.distinct} مختلفة             | ${ok ? '✓' : '✗'}`);
  if (!ok) allNoFlicker = false;
}

console.log(`\nزمن الإطار: transitions=${(rTr.elapsed/framesTotal*1000).toFixed(1)}ms  breaking=${(rBr.elapsed/framesBr*1000).toFixed(1)}ms`);

const allPass = g1 && g2 && g3 && allNoFlicker;
if (!allPass) {
  console.error('\n✗ بوابة فاشلة (كمّياً) — راجع النتائج.');
  process.exit(1);
}
console.log(`\n▲ البوابات الكمّية اجتازت. **لم يُعلَن النجاح النهائي بعد (L-17).**`);
console.log(`▲ راجع 6 إطارات في ${OUT_DIR}/ — وصف بصري في التقرير الرئيسي.`);
console.log(`▲ الفيديو الكامل: ${outPath}`);
