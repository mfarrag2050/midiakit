// scripts/verify-text-tracks-gate.mjs — بوابة الجلسة الثالثة (مسارات النصوص).
//
// **الهدف:** إثبات أن مسارات النص المتعددة تعمل مع مسار وسائط، byWord
// RTL يظهر من اليمين، والكشيدة ثابتة عبر الإطارات، والأداء لا يتدهور.
//
// **الحقل:** مشروع 8s = وسائط (صورة + kenBurns) + مسار نص A (بـbyWord)
// + مسار نص B (سطور ثابتة). النصان بتوقيتات متداخلة.
//
// **البوابات:**
//   1. عدد إطارات صحيح (240 = 8s × 30fps)
//   2. MP4 صادر بحجم واقعي
//   3. الأداء ≤ 1.5× من مرجع breaking
//   4. **ثبات الكشيدة:** إطاران بعد اكتمال byWord (فيهما نفس النص كامل)
//      يعطيان md5 متطابق لصفّ pixels يمرّ عبر منتصف كتلة النص.
//   5. **byWord مرئي:** إطار مبكّر أثناء الكشف يختلف عن إطار متأخّر
//      (ليس فقط بسبب kenBurns — نتحقّق من عدد الكلمات المرسومة).

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
  resolveBrand,
  buildRenderPlan,
drawTimelineAt,
buildTimelinePlan,
templateToTimeline,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/text-tracks-gate');
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

// ── خلفية اصطناعية للوسائط ────────────────────
async function synthImage(bg) {
  const c = new Canvas(SIZE.w, SIZE.h);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE.h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  const buf = await c.toBuffer('png');
  const img = new Image();
  img.src = buf;
  await img.decode();
  return img;
}

console.log('[gate-text] توليد خلفية اصطناعية …');
const bgImg = await synthImage('#1a2942');

// ── نصوص الاختبار ─────────────────────────────
const TEXT_A =
  'الرئيس التركي يستقبل نظيره المصري في القمة الطارئة';
const TEXT_B =
  'مصدر دبلوماسي — تعاون كامل في ملفات الأمن الإقليمي';

// ── بناء Timeline: 3 مسارات ──────────────────
const TOTAL = 8.0;

const timeline = {
  duration: TOTAL,
  fps: FPS,
  size: 'portrait',
  tracks: [
    // مسار وسائط — خلفية بـkenBurns على كامل المدة
    {
      id: 'media', type: 'media', index: 0,
      items: [{
        id: 'bg', start: 0, end: TOTAL, src: 'asset:bg',
        effects: [
          { type: 'kenBurns', from: 1.0, to: 1.10, origin: 'center' },
          { type: 'draw-media', assetKey: 'asset:bg' },
        ],
      }],
    },
    // مسار نص A — byWord RTL، الثلث الأوسط (anchor: 'center'، 50%
     // من الارتفاع). يبدأ عند 0.5s وينتهي عند 5.5s.
    {
      id: 'textA', type: 'text', index: 10,
      items: [{
        id: 'a1',
        start: 0.5, end: 5.5,
        value: TEXT_A,
        anchor: 'center',
        keyframes: [
          { t: 0, opacity: 0, ease: 'easeOutCubic' },
          { t: 0.3, opacity: 1 },
          { t: 4.7, opacity: 1 },
          { t: 5.0, opacity: 0 },
        ],
        effects: [
          { type: 'text-item-byWord', stagger: 0.12, fadeDuration: 0.24 },
        ],
      }],
    },
    // مسار نص B — سطور ثابتة، الثلث السفلي (anchor: 'bottom'، 85%).
    // يبدأ عند 3.0s وينتهي عند 7.5s — يتداخل زمنياً مع A لكن مكانياً
    // منفصل (بينهما ~35% من ارتفاع القماش).
    {
      id: 'textB', type: 'text', index: 20,
      items: [{
        id: 'b1',
        start: 3.0, end: 7.5,
        value: TEXT_B,
        anchor: 'bottom',
        keyframes: [
          { t: 0, opacity: 0, y: 20, ease: 'easeOutCubic' },
          { t: 0.5, opacity: 1, y: 0 },
          { t: 4.0, opacity: 1, y: 0 },
          { t: 4.5, opacity: 0, y: 0 },
        ],
        effects: [
          { type: 'text-item-lines' },
        ],
      }],
    },
  ],
};

const assets = { images: { 'asset:bg': bgImg } };

// ── بناء الخطة (L-07: مرة قبل الحلقة) ──────
console.log('[gate-text] buildTimelinePlan — تحضير النصوص مسبقاً …');
const scratch = new Canvas(SIZE.w, SIZE.h);
const scratchCtx = scratch.getContext('2d');
const plan = buildTimelinePlan({
  timeline, brand, template: BREAKING,
  ctx: scratchCtx, size: SIZE,
});
console.log(`  preps مبنية: ${plan.textPreps.size} (متوقّع 2)`);
for (const [key, p] of plan.textPreps) {
  console.log(`    ${key}: fs=${p.prep.fontSize} lines=${p.prep.linesJustified.length} yTop=${p.prep.bounds.top.toFixed(0)} yBot=${p.prep.bounds.bottom.toFixed(0)}`);
}
console.log(`  تحذيرات تصادم: ${plan.collisions.length}`);

// ── دوال الأنبوب ─────────────────────────────
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
      const t = f / FPS;
      frameFn(ctx, t);
      const buf = rgbaBufferOf(canvas);
      const w = ff.stdin.write(buf);
      if (!w) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
  } catch (e) {
    ff.kill('SIGKILL'); throw e;
  }
  const exit = await done;
  const elapsed = (performance.now() - t0) / 1000;
  if (exit !== 0) throw new Error(`ffmpeg exit=${exit}`);
  return { elapsed, size: statSync(outPath).size };
}

// ── الرندر الرئيسي ────────────────────────
const framesTotal = Math.ceil(TOTAL * FPS);
const outPath = join(ROOT, 'out/timeline-text-demo.mp4');
console.log(`\n[gate-text] رندر ${framesTotal} إطاراً → ${outPath}`);
const rTxt = await renderToMp4(
  (ctx, t) => drawTimelineAt({
    ctx, size: SIZE, timeline, brand, template: BREAKING,
    content: {}, assets, plan, t,
  }),
  framesTotal, outPath
);
console.log(`  ✓ ${(rTxt.size/1024).toFixed(0)}KB · ${rTxt.elapsed.toFixed(2)}s`);

// ── مرجع الأداء (breaking) ─────────────────
console.log(`\n[gate-text] رندر breaking كمرجع أداء …`);
const CONTENT_BR = {
  headline: 'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي — مراسلنا',
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
  framesBr, join(OUT_DIR, 'ref-breaking.mp4')
);
console.log(`  ✓ breaking ${(rBr.size/1024).toFixed(0)}KB · ${rBr.elapsed.toFixed(2)}s`);

// ── فحص ثبات الكشيدة — على timeline نص-فقط بدون kenBurns ──
// السبب: kenBurns على الخلفية يغيّر pixels البصرية عبر الزمن. لعزل
// اختبار الكشيدة، نبني timeline موازي بمسار نص A فقط (بلا وسائط)
// ونرسم إطارَين مختلفين حين النص كامل الظهور، ثم نقارن md5 بايت-بايت.
// أي فرق = عدم ثبات في تحديد مواضع التطويل.

const textOnlyTimeline = {
  duration: TOTAL,
  fps: FPS,
  size: 'portrait',
  tracks: [{
    ...timeline.tracks[1], // نفس تكوين مسار نص A
  }],
};
const textOnlyPlan = buildTimelinePlan({
  timeline: textOnlyTimeline, brand, template: BREAKING,
  ctx: scratchCtx, size: SIZE,
});

function frameNoKenBurns(t) {
  const c = new Canvas(SIZE.w, SIZE.h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
drawTimelineAt({
    ctx, size: SIZE, timeline: textOnlyTimeline, brand, template: BREAKING,
    content: {}, plan: textOnlyPlan, t,
  });
  return c;
}

// byWord: 8 كلمات × 0.12 + 0.24 fade = 1.2s. مكتمل عند item.start + 1.5s = 2.0s.
// نختار إطارَين بعد الاكتمال وقبل بدء التلاشي (item.end - 0.5s = 5.0s).
console.log(`\n[gate-text] فحص ثبات الكشيدة على مسار نص-فقط (لعزل kenBurns) …`);
const f1 = frameNoKenBurns(2.5);
const f2 = frameNoKenBurns(4.5);
const buf1 = await f1.toBuffer('png');
const buf2 = await f2.toBuffer('png');
const h1 = createHash('md5').update(buf1).digest('hex');
const h2 = createHash('md5').update(buf2).digest('hex');
console.log(`  t=2.5s : md5=${h1.slice(0, 16)}… (${buf1.length}b)`);
console.log(`  t=4.5s : md5=${h2.slice(0, 16)}… (${buf2.length}b)`);
const kashidaStable = h1 === h2;

if (!kashidaStable) {
  writeFileSync(join(OUT_DIR, 'kashida-t2.5.png'), buf1);
  writeFileSync(join(OUT_DIR, 'kashida-t4.5.png'), buf2);
  console.log(`  ⚠ إطاران مختلفان — حُفظا في ${OUT_DIR}/`);
}

// ── فحص byWord مرئي: عدّ pixels ملوَّنة على canvas نص-فقط ──
// timeline نص-فقط ⇒ لا خلفية ⇒ كل pixel ملوَّن = نص. أوضح إشارة.
// t=0.8s: 0.3s داخل item، byWord مرّ على 2-3 كلمات فقط.
// t=1.8s: 1.3s داخل item، كل الكلمات ظاهرة (8 × 0.12 = 0.96s).
const fEarly = frameNoKenBurns(0.8);
const fLate = frameNoKenBurns(1.8);
const earlyCount = countNonEmptyPixels(fEarly);
const lateCount = countNonEmptyPixels(fLate);
console.log(`\n[gate-text] byWord مرئي: t=0.8s ⇒ ${earlyCount} pixels · t=1.8s ⇒ ${lateCount}`);
const byWordVisible = lateCount > earlyCount * 2;

function countNonEmptyPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, SIZE.w, SIZE.h);
  const data = img.data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

// ── التقرير ────────────────────────────────
const perfRatio = (rTxt.elapsed / framesTotal) / (rBr.elapsed / framesBr);
console.log('\n════════ بوابة مسارات النصوص ════════');
console.log('البوابة                        | معيار         | قياس           | حكم');
console.log('-------------------------------|--------------|----------------|-----');
const g1 = framesTotal === 240;
console.log(`عدد الإطارات                    | 240          | ${framesTotal}            | ${g1 ? '✓' : '✗'}`);
const g2 = rTxt.size > 100_000;
console.log(`MP4 حجم واقعي                    | > 100KB      | ${(rTxt.size/1024).toFixed(0)}KB          | ${g2 ? '✓' : '✗'}`);
const g3 = perfRatio <= 1.5;
console.log(`الأداء (text/breaking)         | ≤ 1.5×        | ${perfRatio.toFixed(2)}×          | ${g3 ? '✓' : '✗'}`);
console.log(`ثبات الكشيدة (md5 إطارَين)      | متطابق        | ${kashidaStable ? 'متطابق' : 'مختلف'}         | ${kashidaStable ? '✓' : '✗'}`);
console.log(`byWord مرئي (late > early×2)   | متزايد        | ${earlyCount}→${lateCount}      | ${byWordVisible ? '✓' : '✗'}`);
// **الشرط الدائم (L-16):** لا تصادم مكاني بين عناصر نص متداخلة زمنياً.
const noCollision = plan.collisions.length === 0;
console.log(`لا تصادم نص × نص (شرط دائم)   | 0 تحذير      | ${plan.collisions.length}              | ${noCollision ? '✓' : '✗'}`);
console.log('');
console.log(`زمن الإطار: text=${(rTxt.elapsed/framesTotal*1000).toFixed(1)}ms  breaking=${(rBr.elapsed/framesBr*1000).toFixed(1)}ms`);

if (!noCollision) {
  console.error('\n✗ تصادم بين عناصر نص — عيّن item.anchor صريحاً لكل عنصر.');
  for (const c of plan.collisions) {
    console.error(`  ${c.a.trackId}:${c.a.itemId} × ${c.b.trackId}:${c.b.itemId}  تداخل ${c.overlapSeconds.toFixed(2)}s`);
  }
}

const allPass = g1 && g2 && g3 && kashidaStable && byWordVisible && noCollision;
if (!allPass) {
  console.error('\n✗ بوابة فاشلة — راجع النتائج.');
  process.exit(1);
}
console.log(`\n✓ كل البوابات اجتازت. راجع بصرياً: ${outPath}`);
