// ink-gate — يحرس «لا رندرَ ناجحٌ بلا حبر».
//
// **المسألة (2026-09-14):** الخادمُ أعلن أربعةَ رندراتٍ succeeded وكانت بطاقاتٍ
// بيضاء (٣ منها ٩٤٧٠ بايت بالضبط · صورةٌ واحدةٌ مكرّرة). ٣٨٩ اختباراً أخضر
// ولا واحدٌ يسأل: هل على الصورة حبر؟
//
// **المقياس:** كثافةُ الحوافّ — نسبةُ البكسلات التي يختلف سطوعُها (luma)
// عن جارِها اليساريّ أو الأعلى بأكثر من `T`. النصُّ والشعارُ والشارةُ يُنتجون
// انتقالاتٍ حادّة؛ التدرّجُ الأملسُ لا يُنتج شيئاً. المقياس لا يعتمد على
// `brand.colors.surface` ولا يُخدَع بالتدرّجات ولا بالفراغ الملوَّن.
//
// **المعايرة (اشتُقّت من fixtures/ink-gate/ · Rec.709 luma):**
//   empty-flat.png       → 0.000%   (يجب أن يمسك)
//   empty-gradient.png   → 0.000%   (يجب أن يمسك — التدرّج لا يعبر T=8:
//                                     255/1080 ≈ 0.24 لكلّ خطوة)
//   inked-plain.png      → 0.436%   (يجب أن يمرّ)
//   inked-breaking.png   → 1.230%   (يجب أن يمرّ)
//
// الفجوة من صفرٍ حرفيّ إلى 0.436% ⇒ الحدّ **0.05% مع T=8** يُثبِّت هامشاً
// 4× تحت أرخصِ مملوء، وهامشاً غيرَ محدودٍ فوق الفارغ.
//
// **الوضع (2026-09-15 · قرارُ owner):** الافتراضيُّ `warn` — كلُّ رندرٍ يمرّ،
// وسطرٌ في اللوغ لكلّ واحد (الناجحِ والمشبوه). المشبوهُ يحمل `INK_GATE_WOULD_FAIL`.
// وضعُ `enforce` (يرفع INK_GATE_EMPTY ويوقف الرندر) خلف `INK_GATE_MODE=enforce`.
// **السبب:** الحدُّ 0.05٪ مُعايَرٌ على أربع عيّنات — قد يرفض بطاقةً سليمة
// (بطاقةٌ مينيماليّة · غلافُ صورةٍ ملساءَ · نصٌّ خفيفُ التباين). أسبوعٌ من
// اللوغ يعطينا توزيعَ الإنتاج الحقيقيّ، ثمّ نُثبّت الحدَّ على بيانات لا على
// أربع عيّنات. (701b · وأصلُ الحكم في تقرير 701.)

export interface InkGateResult {
  /** نسبةُ بكسلاتِ الحافّة (edge pixels / (w-1)·(h-1)). */
  ratio: number;
  /** عتبةُ الفصل. `ratio > threshold` ⇒ فيها حبر. */
  threshold: number;
  /** عتبةُ الفارق اللونيّ لكلّ بكسل (Rec.709 luma delta). */
  perPixelDelta: number;
  /** false ⇒ صورةٌ فارغة (بيضاءُ مسطّحة أو تدرّجٌ أملس). */
  hasInk: boolean;
}

/**
 * كثافةُ الحوافّ فوق قماشٍ حيّ. لا فكّ ترميز، لا معايرةٌ لكلّ (قالب × مقاس).
 *
 * @param pixels RGBA بطول `4*width*height` (من `ctx.getImageData(0,0,w,h).data`)
 * @param width  عرض القماش بالبكسل
 * @param height ارتفاع القماش بالبكسل
 * @param perPixelDelta فارقُ luma لتصنيف الحافّة (افتراضي 8/255)
 * @param threshold نسبةُ الحوافّ الدنيا (افتراضي 0.0005 = 0.05٪)
 */
export function checkInkPresent(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  perPixelDelta = 8,
  threshold = 0.0005,
): InkGateResult {
  if (width < 2 || height < 2) {
    throw new Error(`ink-gate: canvas too small (${width}×${height})`);
  }
  const expected = width * height * 4;
  if (pixels.length !== expected) {
    throw new Error(`ink-gate: pixel buffer length ${pixels.length} ≠ expected ${expected} for ${width}×${height} RGBA`);
  }

  // Rec.709 luma لكلّ بكسل — سطوعٌ إدراكيّ لا مجموع RGB
  const lumas = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lumas.length; i++, p += 4) {
    lumas[i] = 0.2126 * pixels[p]! + 0.7152 * pixels[p + 1]! + 0.0722 * pixels[p + 2]!;
  }

  let edge = 0;
  let checked = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      const l = lumas[i]!;
      const dLeft = Math.abs(l - lumas[i - 1]!);
      const dUp = Math.abs(l - lumas[i - width]!);
      if (dLeft > perPixelDelta || dUp > perPixelDelta) edge++;
      checked++;
    }
  }
  const ratio = edge / checked;
  return { ratio, threshold, perPixelDelta, hasInk: ratio > threshold };
}

/**
 * صياغةُ رسالةِ الفشل — تحمل الرقمَ المقيسَ والحدَّ لا اتّهاماً بسبب.
 * تُستَعمل في `error_message` عند رفعِ `INK_GATE_EMPTY` (وضعُ enforce فقط).
 */
export function formatInkGateFailure(r: InkGateResult, failedKey?: string): string {
  const pct = (v: number) => (v * 100).toFixed(3) + '%';
  const body = [
    `كثافةُ الحوافّ ${pct(r.ratio)} · الحدّ ${pct(r.threshold)} (T=${r.perPixelDelta})`,
    `— الصورةُ بلا حبر`,
  ];
  if (failedKey) body.push(`· failed_key=${failedKey}`);
  return `INK_GATE_EMPTY: ${body.join(' ')}`;
}

// ── وضعُ التشغيل · سياسةٌ خالصة ─────────────────────────

/** `warn` = يمرّ الجميعُ ويُسجَّل · `enforce` = يُرفَض الفارغ. */
export type InkGateMode = 'warn' | 'enforce';

/** `pass` = فيها حبر · `warn` = بلا حبر في وضع التحذير · `block` = بلا حبر في وضع الرفض. */
export type InkGateLogKind = 'pass' | 'warn' | 'block';

export interface InkGateDecision {
  /** يُرمى INK_GATE_EMPTY فقط في `block`. */
  shouldThrow: boolean;
  logKind: InkGateLogKind;
}

/** يُحلّل قيمةَ متغيّر البيئة `INK_GATE_MODE`. أيُّ شيءٍ غير `enforce` = `warn`. */
export function parseInkGateMode(v: string | undefined | null): InkGateMode {
  return v === 'enforce' ? 'enforce' : 'warn';
}

/** القرار الخالص — ماذا يفعل العاملُ بنتيجة الفحص، بحسب الوضع. */
export function decideInkGatePolicy(mode: InkGateMode, hasInk: boolean): InkGateDecision {
  if (hasInk) return { shouldThrow: false, logKind: 'pass' };
  if (mode === 'warn') return { shouldThrow: false, logKind: 'warn' };
  return { shouldThrow: true, logKind: 'block' };
}

export interface InkGateLogContext {
  templateId?: string | undefined;
  width: number;
  height: number;
  renderId?: string | undefined;
}

/** سطرُ لوغ موحّد. يحمل النسبةَ والحدَّ و T والقالبَ والمقاسَ للناجحِ والمشبوه. */
export function formatInkGateLog(
  kind: InkGateLogKind,
  r: InkGateResult,
  ctx: InkGateLogContext,
): string {
  const pct = (v: number) => (v * 100).toFixed(4) + '%';
  const tag =
    kind === 'pass' ? 'ok'
    : kind === 'warn' ? 'INK_GATE_WOULD_FAIL (warn-only)'
    : 'INK_GATE_BLOCK (enforce)';
  const parts = [
    `[api-worker] ink-gate ${tag}:`,
    `ratio=${pct(r.ratio)}`,
    `threshold=${pct(r.threshold)}`,
    `T=${r.perPixelDelta}`,
    `template=${ctx.templateId ?? '?'}`,
    `size=${ctx.width}x${ctx.height}`,
  ];
  if (ctx.renderId) parts.push(`render=${ctx.renderId}`);
  return parts.join(' ');
}
