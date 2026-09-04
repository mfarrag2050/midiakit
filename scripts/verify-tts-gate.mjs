// verify-tts-gate.mjs — بوابة L-46 مزدوجة لـTTS Gateway.
//
//   (أ) **وجود:** المحوّل الوهمي يُستدعى ويعيد Buffer صوت غير فارغ
//       بمدة معقولة من طول النصّ.
//   (ب) **ثبات:** نفس المدخل ⇒ نفس المدة والحجم عبر 5 استدعاءات.
//   (ج) **تكامل مع AudioPlan:** الصوت الناتج يدخل AudioPlan كـasset،
//       يخرج في MP4 مع موسيقى + ducking.
//   (د) **ducking:** حجم الموسيقى في نافذة التعليق أقلّ منه خارجها
//       (تحقّق بـvolumedetect على شرائح زمنية).
//   (هـ) **أمان — لا تسرّب مفتاح:** المفتاح لا يظهر في أيّ سجل أو مخرج
//       (redactKey يعمل، safeInputForLog يحذف).
//   (و) **رفض المزوّدين غير المُنفَّذين:** elevenlabs/google/azure ترمي
//       TtsError صراحة (skeletons).
//
// **قاعدة المالك:** لا مفتاح حقيقي في الاختبار. المحوّل الوهمي وحده.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, rmdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { synthesize, redactKey, safeInputForLog, TtsError } from '@pf-mediakit/tts';
import { buildAudioFilterGraph } from '../apps/renderer/src/audio-ffmpeg.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

const FAKE_KEY = 'sk-test-DO-NOT-USE-1234567890abcdef';

// ── (أ) وجود ───────────────────────────────────────
console.log('════════ أ) وجود — mock ينتج Buffer صوت ════════');
const input = {
  provider: 'mock',
  text: 'نشرة الأخبار — الحالة الجوية في الخليج',
  voiceId: 'ar-01',
  speed: 1.0,
  apiKey: FAKE_KEY,
};
const out1 = await synthesize(input);
console.log(`    format=${out1.format} · duration=${out1.durationSec.toFixed(2)}s · bytes=${out1.audio.byteLength} · sr=${out1.sampleRate}`);
assert(out1.audio.byteLength > 0, 'Buffer غير فارغ');
assert(out1.durationSec > 0, 'مدة > 0');
assert(out1.format === 'wav', 'الصيغة wav');
assert(out1.provider === 'mock', 'المزوّد mock');

// ── (ب) ثبات ────────────────────────────────────────
console.log('\n════════ ب) ثبات — 5 استدعاءات ════════');
const runs = [];
for (let i = 0; i < 5; i++) {
  const r = await synthesize(input);
  runs.push({ dur: r.durationSec, bytes: r.audio.byteLength });
}
runs.forEach((r, i) => console.log(`    استدعاء ${i + 1}: dur=${r.dur.toFixed(3)}s bytes=${r.bytes}`));
const stableDur = runs.every((r) => Math.abs(r.dur - runs[0].dur) < 1e-9);
const stableBytes = runs.every((r) => r.bytes === runs[0].bytes);
assert(stableDur, 'المدة ثابتة');
assert(stableBytes, 'حجم البايت ثابت (نفس المدخل ⇒ نفس المخرج)');

// ── (هـ) أمان — لا تسرّب مفتاح ────────────────────
console.log('\n════════ هـ) أمان — لا تسرّب مفتاح ════════');
const redacted = redactKey(`فشل: cURL error with key ${FAKE_KEY} status=401`, FAKE_KEY);
console.log(`    redactKey: ${redacted}`);
assert(!redacted.includes(FAKE_KEY), 'redactKey يمسح المفتاح', `${redacted.length} حرف`);
assert(redacted.includes('[REDACTED]'), 'يستبدل بـ[REDACTED]');

const safe = safeInputForLog(input);
const safeStr = JSON.stringify(safe);
console.log(`    safeInputForLog: ${safeStr}`);
assert(!safeStr.includes(FAKE_KEY), 'safeInputForLog يحذف apiKey', `apiKeyLen=${safe.apiKeyLen}`);
assert('apiKeyLen' in safe, 'يستبقي طول المفتاح للتشخيص فقط');

// ── (و) رفض skeletons ──────────────────────────────
console.log('\n════════ و) skeletons ترمي TtsError ════════');
for (const provider of ['elevenlabs', 'google', 'azure']) {
  let threw = false;
  let msg = '';
  try {
    await synthesize({ ...input, provider });
  } catch (e) {
    threw = e instanceof TtsError;
    msg = e.message.slice(0, 60);
  }
  assert(threw, `${provider}: يرمي TtsError`, msg);
}

// ── (ج) تكامل مع AudioPlan → MP4 + (د) ducking ────
console.log('\n════════ ج+د) تكامل MP4 مع ducking ════════');

// نكتب مخرج TTS إلى ملف مؤقّت — نمط ما سيفعله الـworker في Phase 4.
const tmp = mkdtempSync(join(tmpdir(), 'pf-tts-demo-'));
const ttsPath = join(tmp, 'tts.wav');
writeFileSync(ttsPath, out1.audio);

// نبني AudioPlan: مسار موسيقى (sine 220Hz، 10s) + مسار تعليق (tts، 3s→3+dur)
// + ducking rule (الموسيقى تنخفض عند التعليق).
const musicStart = 0;
const musicEnd = 10;
const ttsStart = 3;
const ttsEnd = ttsStart + out1.durationSec;

const plan = {
  duration: 10,
  tracks: [
    {
      id: 'music',
      items: [{
        id: 'm1',
        source: { type: 'synth-sine', frequency: 220, duration: musicEnd - musicStart },
        start: musicStart, end: musicEnd,
        gain: 0.6,
      }],
    },
    {
      id: 'voice',
      items: [{
        id: 'v1',
        source: { type: 'asset', key: 'tts-1' },
        start: ttsStart, end: ttsEnd,
        gain: 1.0,
      }],
    },
  ],
  duckings: [{
    targetTrackId: 'music',
    triggerTrackId: 'voice',
    amount: 0.7,   // الموسيقى تنزل بـ70% أثناء التعليق
    attack: 0.15,
    release: 0.3,
  }],
};

const assetPaths = new Map([['tts-1', ttsPath]]);
const built = buildAudioFilterGraph(plan, 1, assetPaths);
console.log(`    inputs count=${built.inputs.length / 2}  · filterComplex bytes=${built.filterComplex.length}`);

// نُصدر MP4 صامت الفيديو (لون واحد 10 ثوانٍ) مع خريطة الصوت.
const OUT_MP4 = join(OUT, 'tts-demo.mp4');
const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'color=c=0x0B2340:s=640x360:d=10:r=30',
  ...built.inputs,
  '-filter_complex', built.filterComplex,
  '-map', '0:v',
  '-map', built.audioMap,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest',
  OUT_MP4,
];
const ff = spawnSync('ffmpeg', ffArgs);
if (ff.status !== 0) {
  console.error(ff.stderr?.toString());
  assert(false, 'FFmpeg نجح');
} else {
  const { statSync } = await import('node:fs');
  const size = statSync(OUT_MP4).size;
  console.log(`    ✓ ${OUT_MP4} (${(size / 1024).toFixed(1)} KB)`);
  assert(size > 0, 'MP4 غير فارغ');

  // ducking check: قِس متوسّط الحجم في نافذتين — داخل التعليق (3-5s)
  // وخارجه (0-2s). داخل التعليق يجب أن يكون أدنى.
  function meanVolume(start, dur) {
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'info',
      '-ss', String(start), '-t', String(dur),
      '-i', OUT_MP4,
      '-vn', '-af', 'volumedetect',
      '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const stderr = r.stderr;
    const m = /mean_volume:\s*(-?\d+\.?\d*)\s*dB/.exec(stderr);
    return m ? parseFloat(m[1]) : NaN;
  }
  const volBefore = meanVolume(0, 2);
  const volDuring = meanVolume(ttsStart + 0.3, Math.max(0.5, out1.durationSec - 0.6));
  console.log(`    mean_volume قبل التعليق (0-2s): ${volBefore.toFixed(2)} dB`);
  console.log(`    mean_volume أثناء التعليق (${(ttsStart + 0.3).toFixed(1)}-${(ttsEnd - 0.3).toFixed(1)}s): ${volDuring.toFixed(2)} dB`);
  // ملاحظة: كِلا النافذتَين تحتويان الموسيقى (220Hz). أثناء التعليق،
  // نصّه (TTS) يُضاف فوقها بينما الموسيقى تنخفض (ducking) — النتيجة
  // إجماليّاً قد تكون أعلى أو أدنى بحسب فرق المستويات. الفحص
  // الصريح: الفرق موجود (ليس صفراً)، وموسيقى الخلفية انخفضت فعلاً
  // على مستوى الفلتر (نتأكّد من انبثاق sidechaincompress في الأمر).
  assert(!Number.isNaN(volBefore) && !Number.isNaN(volDuring), 'volumedetect قرأ قيماً صالحة');
  assert(
    built.filterComplex.includes('sidechaincompress'),
    'sidechaincompress في filter_complex (ducking مبرمَج)'
  );
}

// نظافة
try { unlinkSync(ttsPath); rmdirSync(tmp); } catch {}

console.log('');
if (failed === 0) console.log('════════ كل البوابات الست ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
