// layers/image — طبقة الصورة (خلفية `cover`).
// المرجع: reference/aa-media-kit.html:1743–1753 (`cvDrawCover`).
//
// السلوك:
//   • إن مُرِّر `crop` صريح — تُستعمل حدوده مباشرة.
//   • خلاف ذلك يُحسب المستطيل المصدر بحيث تُغطّي الصورة الإطار كاملاً
//     دون تمدد (نسبة الصورة مقابل نسبة الإطار).
//   • تكون `imageSmoothing = true, quality = 'high'` كسلوك افتراضي —
//     مطابق للأصل.
//
// المحرك لا يعرف مصدر الصورة (رفع المستخدم، لقطة فيديو، إلخ) —
// يستهلك `ImageLike` فقط (width, height).

import type { BrandKit } from '@pf-mediakit/shared';
import type { CanvasDrawContext, ImageLike } from '../text/draw-line.js';

export interface CanvasSize {
  readonly w: number;
  readonly h: number;
}

/**
 * منطقة اقتصاص المصدر داخل الصورة الأصلية.
 * تُعطى بإحداثيات بكسل الصورة نفسها (لا الإطار).
 */
export interface ImageCrop {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

export interface ImageLayerParams {
  readonly image: ImageLike;
  readonly crop?: ImageCrop;
}

/**
 * يرسم `image` مغطّياً كامل الإطار `size`.
 *
 * `brand` غير مستهلك حالياً — يبقى في التوقيع لتوحيد الشكل مع باقي
 * الطبقات، وليتاح استعمال قيم منه لاحقاً (مثل ضبط جودة بحسب هوية).
 */
export function drawImage(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  _brand: BrandKit,
  params: ImageLayerParams
): void {
  const { w: W, h: H } = size;
  const { image, crop } = params;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;

  if (crop) {
    ({ sx, sy, sw, sh } = crop);
  } else {
    const ir = image.width / image.height;
    const tr = W / H;
    if (ir > tr) {
      sh = image.height;
      sw = sh * tr;
      sx = (image.width - sw) / 2;
      sy = 0;
    } else {
      sw = image.width;
      sh = sw / tr;
      sx = 0;
      sy = (image.height - sh) / 2;
    }
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, W, H);
}
