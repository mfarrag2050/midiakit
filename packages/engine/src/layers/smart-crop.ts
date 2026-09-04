// layers/smart-crop — يحسب مربّع القصّ (source rect) لتحويل صورة
// بمقاس `image` إلى قالب بمقاس `target`.
//
// **الفصل بين الكشف والحساب (L-07):** هذه الوحدة لا تكشف وجوهاً؛
// تستهلك إحداثيات جاهزة (من `services/face-detector/` وقت الرفع).
// الكشف مرة واحدة عند الرفع، القصّ في كل رندر — لا تستدعِ كشفاً
// في مسار زمن-حرج.
//
// **قاعدة الأولوية (L-13):**
//   1. `override` (من content.crop) يتقدّم دائماً — تعديل يدوي إلزامي.
//   2. وجوه ⇒ التمركز حول مركز ثقل الوجوه، ضمان ألا يُقطع وجه،
//      الأولوية للوجه الأكبر عند التعارض.
//   3. saliency (بسيط) ⇒ يُوفَّر لاحقاً — تراجع مقبول اليوم إلى المركز.
//   4. لا معلومات ⇒ تمركز ذكي مع نسبة العرض إلى الارتفاع.
//
// **الخالصة (القاعدة 1):** كل الحالة كوسيط. لا document/window.

// ── الأنواع ─────────────────────────────────────────────

export interface FaceBox {
  /** الإحداثيات بالبكسل من زاوية الصورة العليا اليسرى. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** ثقة الكشف — 0..1. غير مستخدَم في القرار حالياً، يُحفَظ للتصحيح. */
  readonly score?: number;
}

/** مربّع bounding بسيط بالبكسل — مصدر و/أو هدف. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface SmartCropOptions {
  /** وجوه مكشوفة مسبقاً عند الرفع. */
  readonly faces?: readonly FaceBox[];
  /** ملاحظة بروز بصري بديلة — للتوسّع اللاحق (تباين/حواف). */
  readonly saliency?: { readonly cx: number; readonly cy: number };
  /** تجاوز يدوي من content.crop — يتقدّم على كل شيء (L-13). */
  readonly override?: Rect;
}

// ── الحساب ─────────────────────────────────────────────

/**
 * يحسب مربّع مصدر من صورة `image` لملء قالب `target` مع الحفاظ على
 * نسبة العرض إلى الارتفاع (cover-crop). يعيد { sx, sy, sw, sh }
 * صالحاً لاستدعاء `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, target.w, target.h)`.
 *
 * الأولوية:
 *   override > faces > saliency > center.
 */
export function smartCrop(
  image: Size,
  target: Size,
  opts: SmartCropOptions = {}
): Rect {
  // (1) تجاوز يدوي — يتقدّم على كل شيء.
  if (opts.override) {
    return clampRectToImage(opts.override, image);
  }

  // احسب أبعاد مربّع المصدر الذي يطابق نسبة `target`.
  const { sw, sh } = coverSize(image, target);

  // احسب المركز المستهدف (cx, cy) بالبكسل داخل الصورة الأصلية.
  const center = pickFocusCenter(image, opts);

  // احسب sx, sy بحيث يكون (cx, cy) في وسط مربّع المصدر قدر الإمكان،
  // ثم قصّه ضمن حدود الصورة.
  let sx = center.cx - sw / 2;
  let sy = center.cy - sh / 2;

  // ضمان أن الوجوه (إن وُجدت) تبقى ضمن مربّع المصدر — إعادة توسيط
  // انزلاقية حين يخرج وجه من الحدّ.
  if (opts.faces && opts.faces.length > 0) {
    const fitted = shiftToKeepFaces(sx, sy, sw, sh, opts.faces);
    sx = fitted.sx;
    sy = fitted.sy;
  }

  // قصّ إلى حدود الصورة.
  sx = clamp(sx, 0, image.w - sw);
  sy = clamp(sy, 0, image.h - sh);

  return { x: sx, y: sy, w: sw, h: sh };
}

// ── داخلي: احسب أبعاد مربّع cover ───────────────────────

function coverSize(image: Size, target: Size): { sw: number; sh: number } {
  const targetRatio = target.w / target.h;
  const imageRatio = image.w / image.h;
  if (imageRatio > targetRatio) {
    // الصورة أعرض من الهدف — الارتفاع كامل، العرض مقصوص.
    const sh = image.h;
    const sw = sh * targetRatio;
    return { sw, sh };
  } else {
    // الصورة أطول من الهدف — العرض كامل، الارتفاع مقصوص.
    const sw = image.w;
    const sh = sw / targetRatio;
    return { sw, sh };
  }
}

// ── داخلي: احسب مركز الاهتمام ───────────────────────────

function pickFocusCenter(
  image: Size,
  opts: SmartCropOptions
): { cx: number; cy: number } {
  // وجوه ⇒ مركز الثقل مرجَّح بالمساحة (الوجه الأكبر يزن أكثر).
  if (opts.faces && opts.faces.length > 0) {
    return faceCentroid(opts.faces);
  }
  // saliency ⇒ استعمله كما هو.
  if (opts.saliency) {
    return { cx: opts.saliency.cx, cy: opts.saliency.cy };
  }
  // لا معلومات ⇒ التمركز الأعمى (وسط الصورة).
  return { cx: image.w / 2, cy: image.h / 2 };
}

function faceCentroid(faces: readonly FaceBox[]): { cx: number; cy: number } {
  let totalWeight = 0;
  let wx = 0;
  let wy = 0;
  for (const f of faces) {
    const area = Math.max(1, f.w * f.h);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    wx += cx * area;
    wy += cy * area;
    totalWeight += area;
  }
  return { cx: wx / totalWeight, cy: wy / totalWeight };
}

// ── داخلي: أزح المربّع كي تبقى الوجوه داخله ─────────────

/**
 * إن كان الوجه الأكبر يخرج جزئياً من مربّع المصدر، أزح المربّع كي يبقى
 * كاملاً داخله. **الأولوية للأكبر فقط** — الوجوه الأصغر قد تقع خارجاً
 * إن كانت المسافة بينها والأكبر تتجاوز عرض/ارتفاع المربّع (سيناريو
 * صورة جماعية عريضة يُقصّ إلى مربّع).
 *
 * السبب المعماري: محاولة احتواء كل الوجوه معاً قد تُلغي إزاحة الأكبر
 * حين يحاول الحساب جلب الأصغر — سلوك خاطئ للأخبار (الوجه الرئيسي هو
 * الأكبر عادةً).
 */
function shiftToKeepFaces(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  faces: readonly FaceBox[]
): { sx: number; sy: number } {
  // الأولوية للوجه الأكبر — نضمن احتواءه، والباقي تراجع مقبول.
  const largest = faces.reduce(
    (max, f) => (f.w * f.h > max.w * max.h ? f : max),
    faces[0]!
  );
  const dx = deltaToContain(largest.x, largest.w, sx, sw);
  const dy = deltaToContain(largest.y, largest.h, sy, sh);
  return { sx: sx + dx, sy: sy + dy };
}

/**
 * يحسب الإزاحة اللازمة لجعل [box, box+len] داخل [win, win+winLen].
 * إن كان box أكبر من winLen، الإزاحة تُحاذي مراكزهما (لا حلّ آخر).
 */
function deltaToContain(
  box: number,
  len: number,
  win: number,
  winLen: number
): number {
  if (len >= winLen) {
    // لا يسع — حاذِ المراكز.
    const boxCenter = box + len / 2;
    const winCenter = win + winLen / 2;
    return boxCenter - winCenter;
  }
  const overflowLeft = win - box;
  const overflowRight = (box + len) - (win + winLen);
  if (overflowLeft > 0) return -overflowLeft;
  if (overflowRight > 0) return overflowRight;
  return 0;
}

// ── مساعدات ─────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampRectToImage(r: Rect, image: Size): Rect {
  const w = clamp(r.w, 1, image.w);
  const h = clamp(r.h, 1, image.h);
  const x = clamp(r.x, 0, image.w - w);
  const y = clamp(r.y, 0, image.h - h);
  return { x, y, w, h };
}
