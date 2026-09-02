// scripts/verify-audio-gate.mjs — بوابة الجلسة الخامسة (الصوت).
//
// **الهدف:** إثبات أن AudioPlan + ترجمة filter_complex تعملان،
// وأن ducking يخفض الموسيقى فعلاً حين ينطق التعليق.
//
// **الحقل:** مشروع 8s = خلفية فيديو (اصطناعية) + مسار موسيقى (sine
// 220Hz لكل المدة) + مسار تعليق (pink noise 2s من t=3s). ducking:
// حين ينطق التعليق، الموسيقى تنخفض بـ0.7.
//
// **البوابات (كمّية):**
//   1. MP4 يحمل مساراً صوتياً واحداً
//   2. المدة تطابق timelineDuration (±0.05s)
//   3. MP4 حجم واقعي (> 100KB)
//
// **L-17 على الصوت (نوعي):**
//   • استخراج شكل الموجة بـffmpeg showwavespic
//   • قراءتها ووصف ما يظهر: هل هناك انخفاض للموسيقى بين t=3s و t=5s؟
//   • لا يُعلَن النجاح قبل رؤية الدليل البصري.

import { Canvas, FontLibrary } from 'skia-canvas';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, buildAudioGraph } from '@pf-mediakit/engine';
import { renderVideo } from '@pf-mediakit/renderer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/audio-gate');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);
const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const TOTAL = 8.0;
const brand = resolveBrand(DEFAULT_BRAND);

// ── Timeline: فيديو بسيط + مسارَي صوت + ducking ──
// لا نستعمل renderVideo لأنه يحتاج قالباً — سنستدعي FFmpeg مباشرة
// عبر synth أزرق ثابت للفيديو + AudioPlan للصوت.
//
// الفيديو: color=blue من lavfi (مبسّط للاختبار — التركيز على الصوت).
// AudioPlan: بُنيت يدوياً من Timeline صوتي فقط.

const timeline = {
  duration: TOTAL, fps: FPS, size: 'portrait',
  tracks: [
    {
      id: 'music', type: 'audio', index: 0,
      items: [{
        id: 'bg-music',
        // sine 220Hz لكل المدة، gain 0.6
        src: `synth:sine:220:${TOTAL}`,
        start: 0, end: TOTAL,
        gain: 0.6,
        fadeIn: 0.5,
        fadeOut: 0.8,
      }],
    },
    {
      id: 'voice', type: 'audio', index: 1,
      items: [{
        id: 'voiceover',
        // pink noise 2s (يحاكي حضور تعليق)
        src: 'synth:noise:pink:0.5:2',
        start: 3, end: 5,
        gain: 1.0,
        fadeIn: 0.1,
        fadeOut: 0.1,
        ducking: {
          target: 'music',   // مسار الموسيقى ينخفض
          amount: 0.7,
          attack: 0.15,
          release: 0.3,
        },
      }],
    },
  ],
};

console.log('[gate-audio] بناء AudioPlan …');
const audioPlan = buildAudioGraph(timeline, brand);
console.log(`  duration=${audioPlan.duration}s  tracks=${audioPlan.tracks.length}  duckings=${audioPlan.duckings.length}`);
for (const t of audioPlan.tracks) {
  console.log(`  track ${t.id}: ${t.items.length} عنصر`);
}
for (const d of audioPlan.duckings) {
  console.log(`  ducking: ${d.triggerTrackId} يخفض ${d.targetTrackId} بـ${d.amount} (attack=${d.attack}s, release=${d.release}s)`);
}

// ── الرندر: فيديو أزرق ثابت + AudioPlan ────────
// نبني ffmpeg args يدوياً هنا (بدل استعمال renderVideo لأنه يتطلب قالب).
// input 0: rawvideo (RGBA) من stdin — سنولّد إطارات صفراء كخلفية.
// inputs 1..N: مصادر lavfi للصوت.

import { buildAudioFilterGraph } from '../apps/renderer/src/audio-ffmpeg.js';
const built = buildAudioFilterGraph(audioPlan, 1);
console.log('\nfilter_complex:', built.filterComplex.substring(0, 200) + '...');

const outPath = join(ROOT, 'out/timeline-audio-demo.mp4');
const framesTotal = Math.ceil(TOTAL * FPS);

const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba',
  '-s', `${SIZE.w}x${SIZE.h}`, '-r', String(FPS),
  '-i', 'pipe:0',
  ...built.inputs,
  '-filter_complex', built.filterComplex,
  '-map', '0:v',          // فيديو stdin بلا أقواس (مصدر مباشر)
  '-map', built.audioMap, // مخرج filter (بأقواس)
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '128k',
  outPath,
];

console.log(`\n[gate-audio] رندر ${framesTotal} إطاراً + مسارَي صوت + ducking …`);
const t0 = performance.now();
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => {
  ff.on('error', rej);
  ff.on('close', (code) => res(code ?? -1));
});
const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');
// خلفية زرقاء ثابتة مع نص «صوت» للتحقق البصري
ctx.fillStyle = '#1a2942';
ctx.fillRect(0, 0, SIZE.w, SIZE.h);
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 200px "IBM Plex Sans Arabic"';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('صوت', SIZE.w / 2, SIZE.h / 2);
const rgbaBuf = Buffer.from(ctx.getImageData(0, 0, SIZE.w, SIZE.h).data.buffer);

// EPIPE يحدث حين يغلق ffmpeg stdin قبل انتهاء الكتابة (يستقبل مثلاً كل
// إطاراته من amix duration=longest). نعالج بصمت بدل الرمي.
ff.stdin.on('error', (e) => { if (e.code !== 'EPIPE') throw e; });
try {
  for (let f = 0; f < framesTotal; f++) {
    if (ff.stdin.destroyed || !ff.stdin.writable) break;
    const w = ff.stdin.write(rgbaBuf);
    if (!w) await new Promise((r) => ff.stdin.once('drain', r));
  }
  if (!ff.stdin.destroyed) ff.stdin.end();
} catch (e) {
  if (e.code !== 'EPIPE') { ff.kill('SIGKILL'); throw e; }
}
const exit = await done;
const elapsed = (performance.now() - t0) / 1000;
if (exit !== 0) { console.error('ffmpeg exit=', exit); process.exit(1); }
console.log(`  ✓ ${outPath}  ${(statSync(outPath).size/1024).toFixed(0)}KB  ${elapsed.toFixed(2)}s`);

// ── فحص المدة عبر ffprobe ──────────────────────
const probe = spawnSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  outPath,
], { encoding: 'utf8' });
const actualDuration = parseFloat(probe.stdout.trim());
console.log(`  actualDuration=${actualDuration.toFixed(3)}s  expected=${TOTAL}s  diff=${Math.abs(actualDuration - TOTAL).toFixed(3)}s`);

// عدد مسارات الصوت
const streams = spawnSync('ffprobe', [
  '-v', 'error',
  '-select_streams', 'a',
  '-show_entries', 'stream=index',
  '-of', 'csv=p=0',
  outPath,
], { encoding: 'utf8' });
const audioStreams = streams.stdout.trim().split('\n').filter(Boolean).length;

// ── استخراج waveform (L-17 على الصوت) ─────────
const wavePath = join(OUT_DIR, 'waveform.png');
console.log(`\n[gate-audio] استخراج شكل الموجة → ${wavePath}`);
const wave = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', outPath,
  '-filter_complex', 'showwavespic=s=1600x300:colors=cyan|magenta',
  '-frames:v', '1',
  wavePath,
], { encoding: 'utf8' });
if (wave.status !== 0) {
  console.error('showwavespic failed:', wave.stderr);
  process.exit(1);
}

// ── التقرير الكمّي ────────────────────────────
console.log('\n════════ بوابة الصوت — الكمّية ════════');
console.log('البوابة                          | معيار              | قياس            | حكم');
console.log('---------------------------------|-------------------|-----------------|-----');
const g1 = audioStreams === 1;
console.log(`عدد المسارات الصوتية في MP4     | 1                 | ${audioStreams}                | ${g1 ? '✓' : '✗'}`);
const g2 = Math.abs(actualDuration - TOTAL) <= 0.05;
console.log(`المدة تطابق timelineDuration    | ±0.05s            | ${Math.abs(actualDuration - TOTAL).toFixed(3)}s            | ${g2 ? '✓' : '✗'}`);
const g3 = statSync(outPath).size > 100_000;
console.log(`MP4 حجم واقعي                    | > 100KB           | ${(statSync(outPath).size/1024).toFixed(0)}KB            | ${g3 ? '✓' : '✗'}`);

const allQuant = g1 && g2 && g3;
if (!allQuant) {
  console.error('\n✗ بوابة كمّية فاشلة.');
  process.exit(1);
}

console.log(`\n▲ البوابات الكمّية اجتازت. **لا نعلن النجاح بعد (L-17).**`);
console.log(`▲ راجع waveform: ${wavePath}`);
console.log(`▲ الوصف البصري في التقرير الرئيسي.`);
console.log(`▲ MP4 كامل: ${outPath}`);
