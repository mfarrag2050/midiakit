// scripts/measure-frame-profile.mts
// ═══════════════════════════════════════════════════════════════════════════
// أداة قياس — NOT production, NOT a test.
//
// **الغرض:** تشريح زمن الإطار في `renderVideo` وقياس تكرار المحتوى البصري
// عبر الإطارات. يُستدعى يدوياً حين تُطرَح أسئلة أداء (VERIFY-2/2b وما بعد).
//
// **ليست:**
//   • ليست test — لا تحسب ضمن `pnpm test`
//   • ليست مسار إنتاج — لا يستوردها أيّ apps/*
//   • ليست بوابة — لا تعطي pass/fail
//
// **التشغيل:**
//   cd apps/api && node --import tsx ../../scripts/measure-frame-profile.mts
//   (يحتاج .env محلّي في apps/api لتحميل التبعيات)
//
// **ماذا تقيس:**
//   1. زمن إعداد خارج الحلقة (buildRenderPlan + templateToTimeline)
//   2. تشريح إطار (clearRect / drawTimelineAt / getImageData+Buffer / ffmpeg.write)
//   3. تشريح داخل drawTimelineAt بطبقة (subtract technique) — كل طبقة على حدة
//   4. بصمة SHA-256 على كامل مخزن البكسل (لا 64KB الأولى — درس VERIFY-2b)
//   5. توزيع الإطارات المتطابقة على المحور الزمني (بداية · وسط · outro)
//
// **صرّاحة**: القياس هنا **لا يشمل** كلفة node startup أو import parsing —
// كل شيء داخل الحلقة/حول الحلقة داخل عملية واحدة قيد التنفيذ.
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FontLibrary, Canvas } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, buildRenderPlan, templateToTimeline, drawTimelineAt } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const brand = resolveBrand(DEFAULT_BRAND as any);
const weights = brand.fonts.primary.weights;
const fontPaths = [weights.light.url, weights.regular.url, weights.bold.url]
  .map((u) => (u ? resolve(ROOT, u) : null))
  .filter((p): p is string => p !== null);
FontLibrary.use(brand.fonts.primary.family, fontPaths);

const FULL_TEMPLATE = TEMPLATES['reel']!;
const content = {
  title: 'قمة عربية طارئة تناقش الوضع الإنساني في القطاع',
  location: 'الدوحة',
  sourceHandle: '@source',
  sourceName: 'الوكالة',
};
const SIZE = { w: 1080, h: 1920 };
const fps = 30;

const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');

// ── مساعدات ───────────────────────────────────────────
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const stddev = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};

// نبني plan+timeline لأيّ template مُمرَّر (كامل أو مقصوص)
function preparePlan(tpl: typeof FULL_TEMPLATE) {
  const plan = buildRenderPlan({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: ctx as any,
    size: SIZE, template: tpl, brand, content, fps,
  });
  const headlineLineCount = plan.headline?.linesJustified.length ?? 1;
  const timeline = templateToTimeline({
    template: tpl, brand, content, headlineLineCount, fps,
  });
  return { plan, timeline };
}

function drawAt(t: number, tpl: typeof FULL_TEMPLATE, prep: ReturnType<typeof preparePlan>) {
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
  drawTimelineAt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: ctx as any,
    size: SIZE, timeline: prep.timeline, template: tpl, brand, content,
    ...(prep.plan.headline && { headlinePrep: prep.plan.headline }),
    t,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) إعداد خارج الحلقة
// ═══════════════════════════════════════════════════════════════════════════
const t0Prep = performance.now();
const fullPrep = preparePlan(FULL_TEMPLATE);
const setupMs = performance.now() - t0Prep;
const frameCount = Math.ceil(fullPrep.timeline.duration * fps);

console.log(`── إعداد (خارج الحلقة) ──`);
console.log(`  buildRenderPlan + templateToTimeline:  ${setupMs.toFixed(2)}ms`);
console.log(`  frameCount:                            ${frameCount} (${fullPrep.timeline.duration.toFixed(2)}s @ ${fps}fps)`);
console.log(`  حجم إطار خام:                          ${(SIZE.w * SIZE.h * 4 / (1024 * 1024)).toFixed(2)} MB`);
console.log(`  تخطيط المخزن:                          RGBA (r,g,b,a bytes) صفّاً صفّاً من الأعلى-يسار`);
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 2) تشريح الإطار الكامل — نفس نمط renderVideo
// ═══════════════════════════════════════════════════════════════════════════
const OUT = '/tmp/measure-1/profile-full.mp4';
const ffmpegArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-vcodec', 'rawvideo',
  '-pixel_format', 'rgba', '-video_size', `${SIZE.w}x${SIZE.h}`,
  '-framerate', String(fps),
  '-i', 'pipe:0',
  '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-vf', 'format=yuv420p', OUT,
];
const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise<number>((res) => ff.on('close', (c) => res(c ?? -1)));

const clearMs: number[] = [];
const drawMs: number[] = [];
const bufMs: number[] = [];
const writeMs: number[] = [];
const totalMs: number[] = [];
const frameHashes: string[] = []; // SHA-256 كامل، يحفظ الترتيب

for (let f = 0; f < frameCount; f++) {
  const tFrame0 = performance.now();
  const t = f / fps;
  const t1 = performance.now();
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
  const t2 = performance.now();
  drawTimelineAt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: ctx as any,
    size: SIZE, timeline: fullPrep.timeline, template: FULL_TEMPLATE, brand, content,
    ...(fullPrep.plan.headline && { headlinePrep: fullPrep.plan.headline }),
    t,
  });
  const t3 = performance.now();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const t4 = performance.now();

  // بصمة SHA-256 على كامل المخزن (8.29 MB) — درس VERIFY-2b:
  // 64KB الأولى = 15 صفّاً فقط = المنطقة الآمنة الفارغة بالتصميم
  const fullHash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  frameHashes.push(fullHash);

  const writable = ff.stdin.write(buf);
  if (!writable) await new Promise<void>((r) => ff.stdin.once('drain', r));
  const t5 = performance.now();

  clearMs.push(t2 - t1);
  drawMs.push(t3 - t2);
  bufMs.push(t4 - t3);
  writeMs.push(t5 - t4);
  totalMs.push(t5 - tFrame0);
}
ff.stdin.end();
const ffExit = await ffDone;

const cMean = mean(clearMs), dMean = mean(drawMs), bMean = mean(bufMs), wMean = mean(writeMs), tMean = mean(totalMs);
console.log(`── تشريح الإطار الكامل (${frameCount} إطار · ffmpeg=${ffExit === 0 ? 'OK' : 'FAIL'}) ──`);
console.log(`  clearRect:         ${cMean.toFixed(2)}ms  ±${stddev(clearMs).toFixed(2)}  (${(cMean/tMean*100).toFixed(1)}%)`);
console.log(`  drawTimelineAt:    ${dMean.toFixed(2)}ms  ±${stddev(drawMs).toFixed(2)}  (${(dMean/tMean*100).toFixed(1)}%)`);
console.log(`  getImageData+Buf:  ${bMean.toFixed(2)}ms  ±${stddev(bufMs).toFixed(2)}  (${(bMean/tMean*100).toFixed(1)}%)`);
console.log(`  ffmpeg.write:      ${wMean.toFixed(2)}ms  ±${stddev(writeMs).toFixed(2)}  (${(wMean/tMean*100).toFixed(1)}%)`);
console.log(`  ──────────────`);
console.log(`  إجمالي/إطار:       ${tMean.toFixed(2)}ms  ±${stddev(totalMs).toFixed(2)}`);
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 3) تشريح داخل drawTimelineAt — subtract technique على layers
// ═══════════════════════════════════════════════════════════════════════════
// نستنتج زمن كل طبقة من فرق زمن التركيبة الكاملة مع تركيبة تُنقص طبقة واحدة.
// نستعمل 30 إطار عيّنة (كافٍ لتقدير المتوسّط · stddev الطبقة الواحدة صغير
// كما رأينا في التركيبة الكاملة ±1.45ms).
const layerNames = FULL_TEMPLATE.layers.map((l: any) => l.type + (l.field ? `[${l.field}]` : ''));
console.log(`── تشريح داخل drawTimelineAt — subtract على layers ──`);
console.log(`  طبقات reel: ${layerNames.join(' · ')}`);
console.log(`  نقيس بـ30 إطار عيّنة · نُنقص طبقة واحدة في كل تشغيل`);
console.log('');

const SAMPLE_FRAMES = 30;
const sampleIndices = Array.from({ length: SAMPLE_FRAMES }, (_, i) =>
  Math.floor((i / SAMPLE_FRAMES) * frameCount),
);

// أوّلاً: قياس التركيبة الكاملة على نفس عيّنة الإطارات (baseline صافٍ)
const fullSampleMs: number[] = [];
for (const f of sampleIndices) {
  const t0 = performance.now();
  drawAt(f / fps, FULL_TEMPLATE, fullPrep);
  fullSampleMs.push(performance.now() - t0);
}
const fullSampleMean = mean(fullSampleMs);
console.log(`  التركيبة الكاملة (${SAMPLE_FRAMES} عيّنة): ${fullSampleMean.toFixed(2)}ms  ±${stddev(fullSampleMs).toFixed(2)}`);

// لكل طبقة: احسب زمن التركيبة بدونها، الفرق = زمنها
interface LayerTiming { name: string; withoutMs: number; delta: number; }
const layerTimings: LayerTiming[] = [];

for (let li = 0; li < FULL_TEMPLATE.layers.length; li++) {
  const filteredLayers = FULL_TEMPLATE.layers.filter((_: any, i: number) => i !== li);
  const filteredTpl = { ...FULL_TEMPLATE, layers: filteredLayers };
  let prep: ReturnType<typeof preparePlan>;
  try {
    prep = preparePlan(filteredTpl);
  } catch (e) {
    console.log(`  ✗ ${layerNames[li]}: preparePlan فشل (${(e as Error).message.slice(0, 60)}) — يُتخطّى`);
    continue;
  }
  const timings: number[] = [];
  for (const f of sampleIndices) {
    const t0 = performance.now();
    try {
      drawAt(f / fps, filteredTpl, prep);
      timings.push(performance.now() - t0);
    } catch (e) {
      // بعض الطبقات تعتمد على أخرى (badge above-headline). نسجّل الفشل.
      break;
    }
  }
  if (timings.length === 0) {
    console.log(`  ✗ ${layerNames[li]}: drawAt فشل لكل الإطارات — يُتخطّى`);
    continue;
  }
  const withoutMean = mean(timings);
  const delta = fullSampleMean - withoutMean;
  layerTimings.push({ name: layerNames[li]!, withoutMs: withoutMean, delta });
}

console.log('');
console.log(`  الطبقة         | full-without | delta (زمن الطبقة)`);
console.log(`  ────────────────────────────────────────────────`);
let sumDelta = 0;
for (const lt of layerTimings) {
  const sign = lt.delta >= 0 ? '+' : '';
  console.log(`  ${lt.name.padEnd(30)} ${lt.withoutMs.toFixed(2).padStart(7)}ms   ${sign}${lt.delta.toFixed(2)}ms  (${(lt.delta / fullSampleMean * 100).toFixed(1)}%)`);
  sumDelta += lt.delta;
}
console.log(`  ────────────────────────────────────────────────`);
console.log(`  مجموع الـdeltas: ${sumDelta.toFixed(2)}ms · التركيبة الكاملة: ${fullSampleMean.toFixed(2)}ms`);
console.log(`  فرق (تفاعلات بين الطبقات · overhead): ${(fullSampleMean - sumDelta).toFixed(2)}ms`);
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 4) بصمة الإطار الكامل + توزيع التطابق زمنياً
// ═══════════════════════════════════════════════════════════════════════════
const unique = new Set(frameHashes);
console.log(`── بصمة SHA-256 على كامل المخزن (8.29 MB · لا 64KB) ──`);
console.log(`  إطارات إجمالاً:         ${frameCount}`);
console.log(`  hashes فريدة:           ${unique.size}`);
console.log(`  نسبة التكرار الحقيقية:  ${((1 - unique.size / frameCount) * 100).toFixed(1)}%`);
console.log('');

// توزيع التطابق: نجمع runs من الإطارات المتتالية بنفس hash
interface Run { hash: string; start: number; end: number; count: number; }
const runs: Run[] = [];
let cur: Run | null = null;
for (let i = 0; i < frameHashes.length; i++) {
  const h = frameHashes[i]!;
  if (cur && cur.hash === h) {
    cur.end = i;
    cur.count++;
  } else {
    if (cur) runs.push(cur);
    cur = { hash: h, start: i, end: i, count: 1 };
  }
}
if (cur) runs.push(cur);

console.log(`── التوزيع الزمني (runs من إطارات متطابقة متتالية) ──`);
console.log(`  عدد runs: ${runs.length}`);
console.log(`  أطول 10 runs (بترتيب الطول تنازلياً):`);
runs.sort((a, b) => b.count - a.count);
for (const r of runs.slice(0, 10)) {
  const startSec = (r.start / fps).toFixed(2);
  const endSec = (r.end / fps).toFixed(2);
  const pct = (r.count / frameCount * 100).toFixed(1);
  console.log(`    f${String(r.start).padStart(3)}..f${String(r.end).padStart(3)}  (${startSec}s..${endSec}s)  ${r.count} إطار  ${pct}%  hash=${r.hash.slice(0, 8)}`);
}
console.log('');

// أين تقع runs الطويلة زمنياً؟
console.log(`  توزيع runs الطويلة (>3 إطارات) على المحور الزمني:`);
const longRuns = runs.filter((r) => r.count > 3).sort((a, b) => a.start - b.start);
const thirds = { start: 0, middle: 0, end: 0 };
for (const r of longRuns) {
  const midFrame = (r.start + r.end) / 2;
  if (midFrame < frameCount / 3) thirds.start += r.count;
  else if (midFrame < (2 * frameCount) / 3) thirds.middle += r.count;
  else thirds.end += r.count;
}
console.log(`    الثلث الأول  (0..${(frameCount/3).toFixed(0)}):     ${thirds.start} إطار متكرّر (${(thirds.start/frameCount*100).toFixed(1)}%)`);
console.log(`    الثلث الأوسط (${(frameCount/3).toFixed(0)}..${(2*frameCount/3).toFixed(0)}):    ${thirds.middle} إطار متكرّر (${(thirds.middle/frameCount*100).toFixed(1)}%)`);
console.log(`    الثلث الأخير (${(2*frameCount/3).toFixed(0)}..${frameCount}):  ${thirds.end} إطار متكرّر (${(thirds.end/frameCount*100).toFixed(1)}%)`);
