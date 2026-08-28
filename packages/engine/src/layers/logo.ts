// layers/logo — رسم الشعار في زاوية.
// المرجع: reference/aa-media-kit.html:1957 (`cvRenderInto` — شعار سفلي
// يسار بحجم 63 وهامش 51).
//
// الحجم والهامش والموضع من `brand.logo`. الصورة تأتي في `params`
// (المحرك لا يعرف مصدرها — رفع، تحميل، …).
//
// حراسة صامتة: عند غياب الصورة (الهوية الافتراضية بلا شعار،
// أو صورة لم تُحمَّل بعد) — لا تُرسم شيئاً. مطابق لسلوك الأصل
// الذي كان يتحقّق من `cvLogo.complete && naturalWidth`.

import type { BrandKit, LogoAnchor } from '@pf-mediakit/shared';
import type { CanvasDrawContext, ImageLike } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

export interface LogoLayerParams {
  /** صورة الشعار الجاهزة. `undefined` ⇒ تخطٍّ صامت. */
  readonly image?: ImageLike;
}

/**
 * يحسب زاوية الرسم بناءً على `position` من الهوية.
 * `size` = حجم مربع الشعار (`brand.logo.size`).
 * `margin` = المسافة من الحافة (`brand.logo.margin`).
 */
function anchorOf(
  W: number,
  H: number,
  size: number,
  margin: number,
  position: LogoAnchor
): { readonly x: number; readonly y: number } {
  switch (position) {
    case 'bottom-left':
      return { x: margin, y: H - margin - size };
    case 'bottom-right':
      return { x: W - margin - size, y: H - margin - size };
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: W - margin - size, y: margin };
  }
}

export function drawLogo(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  brand: BrandKit,
  params: LogoLayerParams
): void {
  const { image } = params;
  if (!image) return;

  const { size: logoSize, margin, position } = brand.logo;
  const { x, y } = anchorOf(size.w, size.h, logoSize, margin, position);
  ctx.drawImage(image, x, y, logoSize, logoSize);
}
