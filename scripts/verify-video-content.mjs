#!/usr/bin/env node
// 390 · verify-video-content — حارسٌ يفتح الفيديو ويسأل أربعةَ أسئلة.
//
// **الفجوة (830 · 390):** `verify:breaking-video` يقارن md5 — يشهد
// **بالثبات لا بالصحّة**. فيديو أسودُ كلُّه بنفس البتّات يمرّ · بتّةٌ
// واحدةٌ تختلف بلا أثرٍ مرئيّ تحمرّ. حارسٌ يحمرّ حين لا يجب ولا يحمرّ
// حين يجب.
//
// هذا الحارس **بجوار** md5 لا بديلاً عنه. يجيب عن أربعة أسئلة لا تعتمد
// على بتّةٍ بعينها:
//
//   ١. مدّةٌ > عتبةٍ دنيا (لا فيديوٌ صفريّ).
//   ٢. عددُ إطاراتٍ > ١.
//   ٣. الإطارُ الأوسطُ فيه حبر (كثافةُ حوافٍّ فوق عتبة).
//   ٤. الإطارُ الأوّلُ ≠ الأوسطُ ≠ الأخيرُ — **شيءٌ تحرّك فعلاً**.
//
// **الأدوات:** `ffprobe` + `ffmpeg` فقط (موجودان على الجهاز · ffmpeg 9.0.1).
// إطاراتٌ ثلاثة تُستخرَج كـraw rgb24 وتُحلَّل داخل Node — بلا وسيط PNG.
//
// **الوضع الافتراضيّ: `warn`** — كلّ فيديو يمرّ حتّى ننصت لإنذاراتِه
// على رندراتٍ حقيقيّة. `enforce` خلف `VIDEO_CONTENT_MODE=enforce`.
// السبب: العتبات مُعايَرةٌ على مرجعٍ واحدٍ (breaking.mp4 · مقيسٌ في §٤
// من التقرير) — أسبوعُ لوغٍ يُنضج توزيعَ الإنتاج ثمّ نُثبّت.
//
// **العتبات — كلٌّ ومصدرُه (390 §١ · «لا رقمٍ سحريّ»):**
//
//   • duration_min = 0.5s — أيُّ فيديو أقصر عطبٌ (الفريم فبيّة العادية 30
//     fps · ٠.٥s = ١٥ إطاراً · دون ذلك لا رندر جدّي).
//   • frame_count_min = 2 — نصُّ التذكرة «> ١».
//   • ink_ratio_min = 0.0005 (0.05٪) — مطابقٌ لبوّابة الحبر (feat/api ·
//     ink-gate.ts) · مُعايَرٌ على أربع عيّناتٍ ثابتة (fixtures/ink-gate/):
//     empty=0.000٪ · plain=0.436٪ · breaking=1.230٪. الفارق ١٠٠× من الفارغ
//     يبرّر الحدّ.
//   • frame_diff_min_mean_luma = 2.0 (على مقياس 0-255) — قِستُ على المرجع
//     `snapshots-video/breaking.mp4` (1080×1350 · 8.4s · 252 إطاراً):
//       - first↔mid  = 5.99  (t=0.1 · t=4.2 · t=8.3)
//       - mid↔last   = 29.20
//       - first↔last = 24.77
//     أرخصُ فارقٍ = 5.99. فيديو من إطارٍ واحدٍ مكرَّر (§٢ الحالة الرابعة)
//     = 0.0 حتماً. العتبةُ 2.0 = هامشٌ ×3 تحت أرخص فارقٍ حيّ · وأعلى
//     بلانهاية فوق الصفر. لا تتأثّر بضوضاء H.264 (عادةً < 1.0 على
//     منطقةٍ ثابتة).
//
// **الخروج:**
//   warn mode (افتراضي): 0 دائماً · إن سقط سؤالٌ يُطبع `VIDEO_CONTENT_WOULD_FAIL`.
//   enforce mode: 0 عند النجاح · 1 عند أوّل سقوط.
//
// **الاستعمال:**
//   node scripts/verify-video-content.mjs <path.mp4> [--expect-duration=8.4] [--tolerance=0.5]
//   VIDEO_CONTENT_MODE=enforce node scripts/verify-video-content.mjs …

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── عتبات (كلٌّ مبرَّرٌ في رأس الملفّ) ─────────────────
const DURATION_MIN = 0.5;
const FRAME_COUNT_MIN = 2;
const INK_RATIO_MIN = 0.0005;
const INK_PER_PIXEL_DELTA = 8;
const FRAME_DIFF_MIN_MEAN_LUMA = 2.0;

// ── تحليل الوسائط ──────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('الاستعمال: verify-video-content <path.mp4> [--expect-duration=N] [--tolerance=T]');
  process.exit(2);
}
const videoPath = args[0];
if (!existsSync(videoPath)) {
  console.error(`✗ الملفّ غير موجود: ${videoPath}`);
  process.exit(2);
}

let expectDuration = null;
let tolerance = 0.5;
for (const a of args.slice(1)) {
  const m1 = a.match(/^--expect-duration=(.+)$/);
  if (m1) { expectDuration = parseFloat(m1[1]); continue; }
  const m2 = a.match(/^--tolerance=(.+)$/);
  if (m2) { tolerance = parseFloat(m2[1]); continue; }
}

const mode = process.env.VIDEO_CONTENT_MODE === 'enforce' ? 'enforce' : 'warn';

// ── ffprobe: مدّة + عدد إطارات ───────────────────
function ffprobe(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames,duration,width,height,r_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'json',
    path,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`ffprobe فشل: ${r.stderr}`);
  }
  const j = JSON.parse(r.stdout);
  const s = j.streams?.[0] ?? {};
  return {
    width: parseInt(s.width, 10),
    height: parseInt(s.height, 10),
    duration: parseFloat(s.duration ?? j.format?.duration ?? '0'),
    nb_frames: parseInt(s.nb_frames ?? '0', 10),
    fps_raw: s.r_frame_rate ?? '0/1',
  };
}

// ── ffmpeg: استخراج إطارٍ عند ثانيةٍ محدَّدة كـraw rgb24 ─
function extractFrame(path, atSec, width, height) {
  const r = spawnSync('ffmpeg', [
    '-v', 'error',
    '-ss', String(atSec),
    '-i', path,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-',
  ], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`ffmpeg extract فشل عند t=${atSec}: ${r.stderr?.toString()}`);
  }
  const expected = width * height * 3;
  if (r.stdout.length !== expected) {
    throw new Error(`raw rgb24 حجمٌ غير متوقّع: ${r.stdout.length} ≠ ${expected}`);
  }
  return r.stdout; // Buffer rgb24
}

// ── حساب كثافة الحوافّ (نفس منطق ink-gate · Rec.709 luma) ─
function edgeDensity(rgb, width, height, perPixelDelta = INK_PER_PIXEL_DELTA) {
  const total = width * height;
  const lumas = new Float32Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 3) {
    lumas[i] = 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
  }
  let edge = 0;
  let checked = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      const l = lumas[i];
      const dLeft = Math.abs(l - lumas[i - 1]);
      const dUp = Math.abs(l - lumas[i - width]);
      if (dLeft > perPixelDelta || dUp > perPixelDelta) edge++;
      checked++;
    }
  }
  return edge / checked;
}

// ── الفارقُ بين إطارَين كمتوسّط |Δluma| على مقياس 0-255 ─
function frameMeanLumaDiff(rgbA, rgbB, width, height) {
  const total = width * height;
  let sum = 0;
  for (let i = 0, p = 0; i < total; i++, p += 3) {
    const la = 0.2126 * rgbA[p] + 0.7152 * rgbA[p + 1] + 0.0722 * rgbA[p + 2];
    const lb = 0.2126 * rgbB[p] + 0.7152 * rgbB[p + 1] + 0.0722 * rgbB[p + 2];
    sum += Math.abs(la - lb);
  }
  return sum / total;
}

// ── التنفيذ ──────────────────────────────────────
const failures = [];
const info = { path: videoPath, mode };

function record(q, ok, detail) {
  info[q] = { ok, detail };
  if (!ok) failures.push({ q, detail });
}

let probe;
try {
  probe = ffprobe(videoPath);
} catch (e) {
  console.error(`✗ فشل ffprobe: ${e.message}`);
  process.exit(mode === 'enforce' ? 1 : 0);
}
info.probe = probe;

// السؤال ١ — المدّة
{
  const ok = probe.duration > DURATION_MIN;
  let detail = `duration=${probe.duration.toFixed(3)}s (min=${DURATION_MIN}s)`;
  if (expectDuration !== null) {
    const delta = Math.abs(probe.duration - expectDuration);
    const withinExpected = delta <= tolerance;
    detail += ` · expected=${expectDuration}s ±${tolerance} · Δ=${delta.toFixed(3)}s`;
    record('q1_duration', ok && withinExpected, detail);
  } else {
    record('q1_duration', ok, detail);
  }
}

// السؤال ٢ — عدد الإطارات
{
  const ok = probe.nb_frames >= FRAME_COUNT_MIN;
  record('q2_frame_count', ok, `nb_frames=${probe.nb_frames} (min=${FRAME_COUNT_MIN})`);
}

// إذا فشلت (١) أو (٢) فلا معنى لاستخراج إطارات — أنهِ.
if (!info.q1_duration.ok || !info.q2_frame_count.ok) {
  reportAndExit();
}

// السؤال ٣+٤ — استخراج ثلاثةِ إطارات
let f0, fmid, flast;
try {
  const t0 = Math.min(0.1, probe.duration * 0.05);
  const tmid = probe.duration / 2;
  const tlast = Math.max(probe.duration - 0.1, probe.duration * 0.95);
  f0 = extractFrame(videoPath, t0, probe.width, probe.height);
  fmid = extractFrame(videoPath, tmid, probe.width, probe.height);
  flast = extractFrame(videoPath, tlast, probe.width, probe.height);
} catch (e) {
  console.error(`✗ فشل استخراج إطار: ${e.message}`);
  process.exit(mode === 'enforce' ? 1 : 0);
}

// السؤال ٣ — الإطار الأوسط فيه حبر
{
  const ratio = edgeDensity(fmid, probe.width, probe.height);
  const ok = ratio > INK_RATIO_MIN;
  record('q3_middle_has_ink', ok, `edge_density=${(ratio * 100).toFixed(4)}٪ (min=${(INK_RATIO_MIN * 100).toFixed(4)}٪ · T=${INK_PER_PIXEL_DELTA})`);
}

// السؤال ٤ — الأوّل ≠ الأوسط ≠ الأخير
{
  const d1 = frameMeanLumaDiff(f0, fmid, probe.width, probe.height);
  const d2 = frameMeanLumaDiff(fmid, flast, probe.width, probe.height);
  const d3 = frameMeanLumaDiff(f0, flast, probe.width, probe.height);
  const minPair = Math.min(d1, d2, d3);
  const ok = minPair > FRAME_DIFF_MIN_MEAN_LUMA;
  record('q4_motion_present', ok,
    `mean|Δluma| first↔mid=${d1.toFixed(2)} · mid↔last=${d2.toFixed(2)} · first↔last=${d3.toFixed(2)} · min=${minPair.toFixed(2)} (threshold=${FRAME_DIFF_MIN_MEAN_LUMA})`);
}

reportAndExit();

function reportAndExit() {
  console.log(`[verify-video-content] الملفّ: ${videoPath}`);
  console.log(`  probe: ${probe.width}×${probe.height} · duration=${probe.duration.toFixed(3)}s · nb_frames=${probe.nb_frames} · fps=${probe.fps_raw}`);
  for (const q of ['q1_duration', 'q2_frame_count', 'q3_middle_has_ink', 'q4_motion_present']) {
    const r = info[q];
    if (!r) continue;
    const mark = r.ok ? '✓' : '✗';
    console.log(`  ${mark} ${q} — ${r.detail}`);
  }
  if (failures.length === 0) {
    console.log(`  ✓ الحارسُ يرى · جميعُ الأسئلة الأربعة أخضر.`);
    process.exit(0);
  }
  const tag = mode === 'enforce' ? 'VIDEO_CONTENT_BLOCK (enforce)' : 'VIDEO_CONTENT_WOULD_FAIL (warn-only)';
  console.log(`  ${tag}: ${failures.length} سؤال سقط:`);
  for (const f of failures) console.log(`    ✗ ${f.q}: ${f.detail}`);
  process.exit(mode === 'enforce' ? 1 : 0);
}
