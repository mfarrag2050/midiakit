// pixel-height — قياس ارتفاع النص من البكسلات المرسومة فعلياً.
//
// **العلّة (L-50 · 2026-09-04):** `measureText` يُبلّغ `actualBoundingBox
// Ascent/Descent` بحسب bounds الحرف الأساسي فقط. **التشكيل العربي**
// (فتحة U+064E، ضمة، كسرة، شدّة، تنوين، سكون) **combining marks** —
// تُرسم فوق الحرف لكن bounds المُبلَّغة لا تحتسبها. النتيجة:
//   • fatha: API يُبلّغ ascent=54، البكسلات تُظهر 67 (خفاء 13px).
//   • تشكيل كامل: API يُبلّغ 54، البكسلات 85 (خفاء 31px).
//   • همزة/مدّة (أ/آ = حرف واحد لا combining) → API **صادق**.
//
// **الحل:** حين اكتشاف combining marks عربية، ارسم النصّ على قماش
// مؤقّت واقرأ الارتفاع الفعلي من البكسلات. أبطأ (~1-3ms لكل قياس)
// لكن دقيق. **يُستدعى مرة لكل headline، لا لكل إطار** — الأداء مقبول.
//
// **البدائل المرفوضة:**
//   • إضافة safety padding ثابت (13px أو 30px): heuristic غير موثوق —
//     التشكيل يختلف حسب الكلمة، والخط، والحجم.
//   • تحويل combining marks إلى precomposed forms: يفقد المعنى النصّي
//     ويكسر بحث النصّ في العمليات اللاحقة.

// ── كشف التشكيل العربي ────────────────────────────────

/**
 * نطاق Unicode للتشكيل العربي (combining marks):
 *   • U+064B-U+065F: فتحة، ضمة، كسرة، تنوين، شدّة، سكون، …
 *   • U+0670: ألف خنجرية (فوقية)
 *   • U+06D6-U+06ED: علامات القرآن
 *   • U+08D3-U+08FF: ملحقات التشكيل الموسّعة
 */
const TASHKIL_REGEX = /[ً-ٰٟۖ-ۭ࣓-ࣿ]/;

export function hasTashkil(text: string): boolean {
  return TASHKIL_REGEX.test(text);
}

// ── قياس بكسلي ─────────────────────────────────────────

export interface PixelHeightContext {
  font: string;
  fillStyle: string | unknown;
  textBaseline: string;
  direction: string;
  textAlign: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): {
    readonly data: Uint8ClampedArray | { readonly [i: number]: number; readonly length: number };
  };
}

export interface PixelHeightFactory {
  /** ينشئ سياق قماش نظيف بحجم w×h — القماش الخارجي لا يُلمَس. */
  create(w: number, h: number): PixelHeightContext;
}

export interface PixelHeightResult {
  /** أعلى بكسل ملوّن فوق خط الأساس (بكسل). */
  readonly ascent: number;
  /** أدنى بكسل ملوّن تحت خط الأساس (بكسل). */
  readonly descent: number;
  /** المجموع = ascent + descent. */
  readonly height: number;
}

/**
 * يرسم `text` على قماش مؤقّت بلون داكن ثمّ يمسح البكسلات من الأعلى
 * والأسفل لإيجاد أول/آخر صف يحوي أيّ بكسل غير أبيض. النتيجة هي الارتفاع
 * **الفعلي** الذي سيُرسم على القماش الحقيقي.
 *
 * **يجب استدعاؤه فقط عند `hasTashkil(text)===true`** — للنصوص بلا
 * تشكيل، `measureText` كافٍ وأسرع بكثير.
 *
 * `factory` يفصل الاعتماد عن `skia-canvas` (يعمل في Node ومتصفح كذلك).
 */
export function measurePixelHeight(
  factory: PixelHeightFactory,
  text: string,
  fontString: string
): PixelHeightResult {
  // قماش بحجم كافٍ لأيّ نصّ عربي معقول بأيّ fs معقول.
  // نستنبط fs من fontString ونستعمل 3× fs عمودياً كأمان.
  const fsMatch = /(\d+(?:\.\d+)?)\s*px/.exec(fontString);
  const fs = fsMatch ? parseFloat(fsMatch[1]!) : 40;
  const W = Math.max(1200, Math.ceil(text.length * fs));
  const H = Math.ceil(fs * 3);
  const yBaseline = Math.floor(H * 0.7); // baseline في الثلثين

  const ctx = factory.create(W, H);
  // خلفية بيضاء
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  // نصّ أسود
  ctx.fillStyle = '#000000';
  ctx.font = fontString;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText(text, W - 20, yBaseline);

  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;

  // أعلى صف بأيّ بكسل غير أبيض (تسامح 240 لـanti-aliasing)
  let top = -1;
  outer1: for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const idx = (row * W + col) * 4;
      const r = data[idx] as number, g = data[idx + 1] as number, b = data[idx + 2] as number;
      if (r < 240 || g < 240 || b < 240) { top = row; break outer1; }
    }
  }
  // أدنى صف
  let bot = -1;
  outer2: for (let row = H - 1; row >= 0; row--) {
    for (let col = 0; col < W; col++) {
      const idx = (row * W + col) * 4;
      const r = data[idx] as number, g = data[idx + 1] as number, b = data[idx + 2] as number;
      if (r < 240 || g < 240 || b < 240) { bot = row; break outer2; }
    }
  }

  if (top < 0 || bot < 0) return { ascent: 0, descent: 0, height: 0 };
  return {
    ascent: yBaseline - top,
    descent: bot - yBaseline,
    height: bot - top + 1,
  };
}
