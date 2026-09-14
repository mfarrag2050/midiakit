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
 * تُستَعمل في `error_message` عند رفعِ `INK_GATE_EMPTY`.
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
