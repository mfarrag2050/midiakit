// drawLineRTL و drawLineCentered — نُقلت من reference/aa-media-kit.html:
//   • cvDrawLineRightEdge (INVENTORY 1844–1850) ← drawLineRTL
//   • cvDrawLine          (INVENTORY 1802–1815) ← drawLineCentered
//
// الفروق عن الأصل:
//   • الألوان تأتي من brand.colors.text — لا `#fff` مثبت.
//   • lineHeight/direction/textAlign/textBaseline كلها ثوابت رسم
//     (RTL, right/center, alphabetic) — تُضبط داخل الدالة.
//   • cx/rx وباقي الإحداثيات وسائط، لا حالة عامة (لا CVW/CVH).
//   • تُعيد { width, accentFrom, accentTo } حسب مواصفة 05 —
//     حتى drawLineRTL تحسب حدود التمييز الآن (الأصل لم يفعل).
//   • measure يُمرَّر — تُقاس الكلمات مرة واحدة قبل الرسم لتحديد المواضع.

import type { BrandKit, Token } from '@pf-mediakit/shared';
import { isBreak, isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

/**
 * الحد الأدنى من واجهات Canvas الرسومية التي نستهلكها.
 * تعريفات مستقلة عن `lib.dom` حتى يبقى المحرك محايداً بيئياً
 * (متصفح، skia-canvas، أي backend مستقبلي).
 */
export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

/**
 * الحد الأدنى من الصورة القابلة للرسم.
 * HTMLImageElement, HTMLCanvasElement, ImageBitmap, skia-canvas Image
 * كلها تُوفّر width و height.
 */
export interface ImageLike {
  readonly width: number;
  readonly height: number;
}

/**
 * مسار هندسي مسبق البناء — Path2D في المتصفح، Path2D في skia-canvas.
 * علامة نوعية مبهمة (opaque) — المحرك لا يبني Path2D بنفسه (يخالف الطهر
 * البيئي)، بل يستقبله من المستدعي. راجع layers/attribution.ts للاستعمال.
 */
export interface Path2DLike {
  readonly __path2dBrand?: unique symbol;
}

/**
 * السطح الأدنى من Canvas الذي نحتاجه للرسم — لا نستورد lib.dom.
 * يتوافق مع CanvasRenderingContext2D في المتصفح و skia-canvas في Node.
 *
 * يجمع كل ما تستهلكه طبقات النص وطبقات البصر الأخرى (`layers/*`) في
 * عقد واحد. `fillStyle` يقبل سلسلة أو تدرّجاً — سلوك Canvas القياسي.
 */
export interface CanvasDrawContext {
  // نص وطباعة
  font: string;
  fillStyle: string | CanvasGradientLike;
  textAlign: string;
  direction: string;
  textBaseline: string;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { readonly width: number };

  // مضلعات ومسارات
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  fill(): void;
  /**
   * تعبئة Path2D مسبق البناء — تُستعمل في layers/attribution لرسم شعارات
   * simple-icons (مسارات SVG public-domain). المتصفح و skia-canvas
   * كلاهما يدعم هذا التوقيع.
   */
  fill(path: Path2DLike): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  // roundRect اختياري: skia-canvas والمتصفحات الحديثة يوفّرونه؛
  // إن غاب نستخدم arcTo يدوياً (نفس أسلوب الأصل — INVENTORY 1852–1856).
  roundRect?(x: number, y: number, w: number, h: number, r: number): void;
  // rect + clip — يستهلكهما مؤثّر `wipe` في timeline-v2 لقصّ منطقة
  // مستطيلة تتحرّك مع تقدّم الانتقال. كلا Canvas 2D و skia-canvas
  // يوفّرانهما قياسياً.
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;

  // صور
  drawImage(image: ImageLike, dx: number, dy: number): void;
  drawImage(
    image: ImageLike,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  drawImage(
    image: ImageLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: 'low' | 'medium' | 'high';

  // تدرّجات
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradientLike;

  // حالة
  save(): void;
  restore(): void;
  globalAlpha: number;

  // تحويلات هندسية (للتحريك في الفيديو — slideY، pulse، إلخ).
  // متوفّرة في CanvasRenderingContext2D و skia-canvas.
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
}

export interface DrawLineResult {
  readonly width: number;
  readonly accentFrom: number | null;
  readonly accentTo: number | null;
}

// ── helper: اسم الأسرة المستخدَم في ctx.font ──────────

const familyOf = (brand: BrandKit): string =>
  `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;

const fontString = (
  fs: number,
  bold: boolean,
  brand: BrandKit
): string => `${bold ? '700' : '400'} ${fs}px ${familyOf(brand)}`;

// ── drawLineRTL ──────────────────────────────────────

/**
 * يرسم سطراً بحافة يمنى ثابتة (`rightX`).
 * النموذج: الكلمة الأولى تُرسم بحافّتها اليمنى عند rightX، ثم تتقدّم x
 * يساراً بمقدار عرض الكلمة + مسافة.
 *
 * يستعمل: بطاقة العاجل (`brk`) في الأصل — عمود واحد بحافة يمنى.
 */
export function drawLineRTL(
  ctx: CanvasDrawContext,
  measure: Measurer,
  toks: readonly Token[],
  rightX: number,
  baselineY: number,
  fs: number,
  allBold: boolean,
  brand: BrandKit
): DrawLineResult {
  if (toks.length === 0) {
    return { width: 0, accentFrom: null, accentTo: null };
  }

  const widths = toks.map((t) => measure.word(t, fs, allBold));
  const sp = measure.space(fs);

  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = brand.colors.text;

  let x = rightX;
  let accentFrom: number | null = null;
  let accentTo: number | null = null;

  toks.forEach((t, i) => {
    if (isBreak(t)) return; // BreakToken لا تُرسم — قد يمرّر بالخطأ.
    ctx.font = fontString(fs, t.bold || allBold, brand);
    ctx.fillText(t.text, x, baselineY);
    if (isWord(t) && t.accent) {
      const l = x - widths[i]!;
      const r = x;
      if (accentFrom === null || l < accentFrom) accentFrom = l;
      if (accentTo === null || r > accentTo) accentTo = r;
    }
    x -= widths[i]! + sp;
  });

  const totalWidth =
    widths.reduce((a, b) => a + b, 0) + sp * Math.max(0, toks.length - 1);

  return { width: totalWidth, accentFrom, accentTo };
}

// ── drawLineCentered ─────────────────────────────────

/**
 * يرسم سطراً متمركزاً حول `centerX`.
 * النموذج: يحسب العرض الكلي، يبدأ من `centerX + total/2` (أي أقصى يمين
 * السطر)، ثم يتقدّم يساراً كما في drawLineRTL.
 *
 * يستعمل: بطاقات s02 و s01 و s3l في الأصل (نمط المتمركز).
 */
export function drawLineCentered(
  ctx: CanvasDrawContext,
  measure: Measurer,
  toks: readonly Token[],
  centerX: number,
  baselineY: number,
  fs: number,
  allBold: boolean,
  brand: BrandKit
): DrawLineResult {
  if (toks.length === 0) {
    return { width: 0, accentFrom: null, accentTo: null };
  }

  const widths = toks.map((t) => measure.word(t, fs, allBold));
  const sp = measure.space(fs);
  const total =
    widths.reduce((a, b) => a + b, 0) + sp * Math.max(0, toks.length - 1);

  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = brand.colors.text;

  let x = centerX + total / 2;
  let accentFrom: number | null = null;
  let accentTo: number | null = null;

  toks.forEach((t, i) => {
    if (isBreak(t)) return;
    ctx.font = fontString(fs, t.bold || allBold, brand);
    ctx.fillText(t.text, x, baselineY);
    if (isWord(t) && t.accent) {
      const l = x - widths[i]!;
      const r = x;
      if (accentFrom === null || l < accentFrom) accentFrom = l;
      if (accentTo === null || r > accentTo) accentTo = r;
    }
    x -= widths[i]! + sp;
  });

  return { width: total, accentFrom, accentTo };
}
