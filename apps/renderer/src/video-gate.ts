// video-gate — نظير ink-gate (٧٠١) لمخرَجات mp4.
//
// **المسألة (2026-09-15 · ٣٤٠):** api-worker يرفع `succeeded` لكلّ mp4 يخرج
// بـexit=0 من ffmpeg، بلا فحصٍ على المحتوى. طرقٌ يمكن أن يمرّ فيها فيديو
// «فارغٌ فعلاً» (٣٣٠ §١.٣): كتلة animation فارغة · إطارات كلّها فارغة ·
// مدّة رمزيّة · frames=0. الحارس هنا يمسك هذه بأربعة شروط لا أكثر.
//
// **الأربعة (بلا خامس · بحدود مُعايَرة):**
//   1) duration > 0                        — مدّة معدومة = لا فيديو
//   2) frames > 1                          — إطار واحد = صورة، لا فيديو
//   3) الإطار الأوسط يمرّ بوّابة الحبر     — نفس checkInkPresent · نفس الحدّ (٧٠١)
//   4) الإطارات ليست متطابقة              — «فيديو من إطارٍ واحدٍ مكرَّرٍ ليس فيديو»
//
// **معايرة الشرط 4 (اعترافٌ على الحدّ · L-46 · ٧٠١):**
//   عيّنة القياس = **٣ mp4s** (كلّها breaking · قماش 1080×1350 · 30fps · h264):
//     • «عاجل-كامل» (headline + source · animation موجود)
//         start↔middle = 3.139%   middle↔end = 100.000%   start↔end = 99.747%
//     • «عاجل-محتوى-أدنى» (headline=" . " · source="")
//         start↔middle = 0.749%   middle↔end = 100.000%   start↔end = 100.000%
//     • «اصطناعيّ-ثابت» (animation=[] · outro=0 · headline="x")
//         start↔middle = 0.000%   middle↔end = 0.000%     start↔end = 0.000%
//   الفجوة: 0.000% (الاصطناعيّ) مقابل ≥0.749% (المحتوى الأدنى). أيّ حدٍّ في
//   هذا المدى يفصل. المختار: **max(pairDiffs) > 0.01%** — هامش 75× تحت أرخصِ
//   عيّنةٍ فيها حركة، وهامشٌ غيرُ محدود فوق الحالة الاصطناعيّة (صفر حرفيّاً).
//   **٣ عيّنات معايرة ضيّقة.** كما في ٧٠١ (٤ صور)، اللوغ في وضع warn هو
//   شبكة الأمان الحقيقيّة لتوسيع البيانات قبل تشديد الحدّ.
//
// **الوضع (نفس ٧٠١):** الافتراضيّ `warn` — كلُّ رندرٍ يمرّ، سطرُ لوغٍ موحّد.
// وضعُ `enforce` خلف `VIDEO_GATE_MODE=enforce`.

import { checkInkPresent, type InkGateResult } from './ink-gate.js';

// ── الشرطان 1+2 · مدّة الفيديو وعدد الإطارات ─────────

export interface VideoBasicsResult {
  durationSec: number;
  frameCount: number;
  durationOk: boolean;
  framesOk: boolean;
  ok: boolean;
}

/** duration > 0 و frames > 1 · لا معايرة (فيزيائيّ). */
export function checkVideoBasics(durationSec: number, frameCount: number): VideoBasicsResult {
  const durationOk = durationSec > 0;
  const framesOk = frameCount > 1;
  return { durationSec, frameCount, durationOk, framesOk, ok: durationOk && framesOk };
}

// ── الشرط 4 · الإطارات ليست متطابقة ─────────────────
//
// **الإصلاح (٣٤٠b · 2026-09-15):** كان الشرط الأصلي `max(start↔middle,
// middle↔end, start↔end)`. الـoutro (تعتيمٌ إلى السواد) يُغيّر كلَّ بكسل،
// فـ`middle↔end` = 100% لأيّ فيديو فيه outro **مهما كان محتواه** — حتى
// قماشٌ فارغٌ يخبو إلى السواد يمرّ. الشاهد: عيّنة «minimal» في §١.٢ (headline=" . ")
// أعطت `middle↔end=100%` تماماً مثل «inked». الحارس يقيس اختفاءَ الطبقات
// لا ظهورَها.
//
// **الآن:** نقيس `start↔middle` **حصراً** — نافذة ظهور المحتوى، قبل outro.
// الشاهد من §١ لا يتغيّر (نفس ٣ عيّنات):
//   inked start↔middle=3.139% · minimal 0.749% · static 0.000%
// الفجوة نفسها. الحدّ نفسه (0.01%). الاختلاف: outro لم يعد يُخفي فراغَ المحتوى.

export interface FramesNotIdenticalResult {
  /** فرق الأزواج الثلاثة كاملة (للوغ · للتشخيص). */
  pairDiffs: readonly number[];
  /** أكبر فرقٍ بين أيّ زوج (للوغ فقط · لم يعد يحكم). */
  maxDiff: number;
  /** **الفرق الحاكم:** start↔middle — يقيس ظهور المحتوى، لا اختفاءه (outro). */
  contentAppearDiff: number;
  /** الحدّ · افتراضي 0.0001 = 0.01% (٧٥× تحت أرخص عيّنة معايرة). */
  threshold: number;
  /** true ⇒ محتوى ظهر بين البداية والوسط (`contentAppearDiff > threshold`). */
  ok: boolean;
}

/**
 * فرقُ بكسلات بين إطارَين — نسبةُ البكسلات التي يختلف فيها أيُّ قناة (r,g,b) > 2.
 * القناة ± 2 يتغاضى عن ضجيج ترميز h264 → PNG.
 */
export function pixelDiffRatio(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
): number {
  if (a.length !== b.length) {
    throw new Error(`video-gate: pixel buffer length mismatch (${a.length} vs ${b.length})`);
  }
  const total = a.length / 4;
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i]!   - b[i]!);
    const dg = Math.abs(a[i+1]! - b[i+1]!);
    const db = Math.abs(a[i+2]! - b[i+2]!);
    if (dr > 2 || dg > 2 || db > 2) diff++;
  }
  return diff / total;
}

/**
 * فحصُ «الإطارات ليست متطابقة» — يأخذ ٣ إطارات (بداية · وسط · نهاية) بشكل RGBA
 * ويعيد فرقَ الأزواج الثلاثة + أكبرَها. `maxDiff > threshold` ⇒ حركةٌ حقيقيّة.
 */
export function checkFramesNotIdentical(
  frames: readonly {
    pixels: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
  }[],
  threshold = 0.0001,
): FramesNotIdenticalResult {
  if (frames.length !== 3) {
    throw new Error(`video-gate: expected 3 frames (start · middle · end), got ${frames.length}`);
  }
  const [s, m, e] = frames as [typeof frames[0], typeof frames[0], typeof frames[0]];
  if (s.width !== m.width || s.width !== e.width || s.height !== m.height || s.height !== e.height) {
    throw new Error('video-gate: frame dimensions mismatch');
  }
  const dSM = pixelDiffRatio(s.pixels, m.pixels);
  const dME = pixelDiffRatio(m.pixels, e.pixels);
  const dSE = pixelDiffRatio(s.pixels, e.pixels);
  const maxDiff = Math.max(dSM, dME, dSE);
  return {
    pairDiffs: [dSM, dME, dSE],
    maxDiff,
    contentAppearDiff: dSM,
    threshold,
    ok: dSM > threshold,
  };
}

// ── القرار الكلّيّ · جمعُ الأربعة ─────────────────────

export interface VideoGateComposite {
  basics: VideoBasicsResult;
  middleInk: InkGateResult;
  framesDiff: FramesNotIdenticalResult;
  /** true ⇒ الأربعة كلُّها OK. */
  allOk: boolean;
  /** أوّل شرطٍ فشل (للرسالة) · null إن نجح الكلّ. */
  firstFailure: 'duration' | 'frames' | 'middleInk' | 'framesIdentical' | null;
}

/** يجمع الشروط الأربعة في نتيجةٍ واحدة. */
export function composeVideoGate(input: {
  durationSec: number;
  frameCount: number;
  middleFramePixels: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  frames: readonly {
    pixels: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
  }[];
}): VideoGateComposite {
  const basics = checkVideoBasics(input.durationSec, input.frameCount);
  const middleInk = checkInkPresent(input.middleFramePixels, input.width, input.height);
  const framesDiff = checkFramesNotIdentical(input.frames);
  const allOk = basics.ok && middleInk.hasInk && framesDiff.ok;
  const firstFailure = !basics.durationOk ? 'duration'
    : !basics.framesOk ? 'frames'
    : !middleInk.hasInk ? 'middleInk'
    : !framesDiff.ok ? 'framesIdentical'
    : null;
  return { basics, middleInk, framesDiff, allOk, firstFailure };
}

// ── وضع التشغيل · سياسة خالصة ───────────────────────

export type VideoGateMode = 'warn' | 'enforce';
export type VideoGateLogKind = 'pass' | 'warn' | 'block';

export interface VideoGateDecision {
  shouldThrow: boolean;
  logKind: VideoGateLogKind;
}

/** يُحلّل `VIDEO_GATE_MODE`. أيُّ شيءٍ غير 'enforce' = 'warn'. */
export function parseVideoGateMode(v: string | undefined | null): VideoGateMode {
  return v === 'enforce' ? 'enforce' : 'warn';
}

/** القرار الخالص · بحسب الوضع والنتيجة الكلّيّة. */
export function decideVideoGatePolicy(mode: VideoGateMode, allOk: boolean): VideoGateDecision {
  if (allOk) return { shouldThrow: false, logKind: 'pass' };
  if (mode === 'warn') return { shouldThrow: false, logKind: 'warn' };
  return { shouldThrow: true, logKind: 'block' };
}

// ── صياغة اللوغ الموحّد ───────────────────────────

export interface VideoGateLogContext {
  templateId?: string | undefined;
  width: number;
  height: number;
  fps: number;
  renderId?: string | undefined;
}

/** سطرُ لوغٍ موحّد · يحمل الأربعة أرقاماً حتّى في النجاح (لبناء التوزيع). */
export function formatVideoGateLog(
  kind: VideoGateLogKind,
  r: VideoGateComposite,
  ctx: VideoGateLogContext,
): string {
  const pct = (v: number) => (v * 100).toFixed(4) + '%';
  const tag =
    kind === 'pass' ? 'ok'
    : kind === 'warn' ? 'VIDEO_GATE_WOULD_FAIL (warn-only)'
    : 'VIDEO_GATE_BLOCK (enforce)';
  const [dSM, dME, dSE] = r.framesDiff.pairDiffs;
  const parts = [
    `[api-worker] video-gate ${tag}:`,
    `duration=${r.basics.durationSec.toFixed(2)}s`,
    `frames=${r.basics.frameCount}`,
    `mid_ink=${pct(r.middleInk.ratio)}`,
    // content_appear = start↔middle · هو الحاكم في الشرط ٤ (٣٤٠b).
    `content_appear=${pct(r.framesDiff.contentAppearDiff)}`,
    // للتشخيص فقط · لا يحكم:
    `pair_diffs=[${pct(dSM ?? 0)},${pct(dME ?? 0)},${pct(dSE ?? 0)}]`,
    `template=${ctx.templateId ?? '?'}`,
    `size=${ctx.width}x${ctx.height}`,
    `fps=${ctx.fps}`,
  ];
  if (ctx.renderId) parts.push(`render=${ctx.renderId}`);
  if (r.firstFailure) parts.push(`first_failure=${r.firstFailure}`);
  return parts.join(' ');
}

/**
 * صياغةُ رسالةِ الفشل — للـerror_message في الـDB (وضع enforce فقط).
 * تحمل الشرط الذي فشل، والرقم المقيس، والحدّ.
 */
export function formatVideoGateFailure(r: VideoGateComposite, failedKey?: string): string {
  const pct = (v: number) => (v * 100).toFixed(3) + '%';
  let body: string;
  switch (r.firstFailure) {
    case 'duration':
      body = `duration=${r.basics.durationSec.toFixed(3)}s ≤ 0 — لا مدّة`;
      break;
    case 'frames':
      body = `frames=${r.basics.frameCount} ≤ 1 — إطار واحد أو أقلّ`;
      break;
    case 'middleInk':
      body = `mid_ink ${pct(r.middleInk.ratio)} ≤ ${pct(r.middleInk.threshold)} — الإطار الأوسط بلا حبر`;
      break;
    case 'framesIdentical':
      body = `content_appear ${pct(r.framesDiff.contentAppearDiff)} ≤ ${pct(r.framesDiff.threshold)} — لا محتوى يظهر بين البداية والوسط (outro مستثنى)`;
      break;
    default:
      body = `unknown failure`;
  }
  const parts = [`VIDEO_GATE_EMPTY: ${body}`];
  if (failedKey) parts.push(`· failed_key=${failedKey}`);
  return parts.join(' ');
}
