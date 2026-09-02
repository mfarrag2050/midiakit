// layers/logo — رسم الشعار.
// المرجع: reference/aa-media-kit.html:1957 (`cvRenderInto` — شعار سفلي
// يسار بحجم 63 وهامش 51).
//
// **الموضع (2026-09-02):** يُقرأ من `brand.placement.logo` (نمط موحّد،
// docs/03 §placement). عند غيابه، تراجع خلفي إلى `brand.logo.position`
// (الحقل الموروث بأربع خيارات) — يضمن أن الهويّات القائمة تعمل بلا
// تعديل.
//
// **مبدأ:** القالب يحدّد أن الشعار **يظهر** (بوجود طبقة `logo`)،
// والهوية تحدّد **أين**. لا anchor يُذكر في القالب.
//
// الحجم والصورة يأتيان من `brand.logo` (size + image). الصورة `undefined`
// = تخطٍّ صامت (الهوية الافتراضية بلا شعار).

import type {
  BrandKit,
  LogoAnchor,
  PlacementAnchor,
} from '@pf-mediakit/shared';
import type { CanvasDrawContext, ImageLike } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

export interface LogoLayerParams {
  /** صورة الشعار الجاهزة. `undefined` ⇒ تخطٍّ صامت. */
  readonly image?: ImageLike;
}

/** تحويل PlacementAnchor التسعي إلى إحداثيات x/y لمربع بمقاس size. */
function placeInside(
  W: number,
  H: number,
  size: number,
  offset: { readonly x: number; readonly y: number },
  anchor: PlacementAnchor
): { readonly x: number; readonly y: number } {
  const [vert, horiz] = anchor.split('-') as [
    'top' | 'middle' | 'bottom',
    'left' | 'center' | 'right'
  ];
  let x: number;
  switch (horiz) {
    case 'left':
      x = offset.x;
      break;
    case 'right':
      x = W - offset.x - size;
      break;
    case 'center':
    default:
      x = (W - size) / 2;
      break;
  }
  let y: number;
  switch (vert) {
    case 'top':
      y = offset.y;
      break;
    case 'bottom':
      y = H - offset.y - size;
      break;
    case 'middle':
    default:
      y = (H - size) / 2;
      break;
  }
  return { x, y };
}

/** الفولباك القديم — أربع زوايا فقط. مصدر: brand.logo.position/margin. */
function legacyAnchor(
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
  const logoSize = brand.logo.size;

  // مصدر الموضع: brand.placement.logo إن وُجد؛ وإلا brand.logo.position.
  const placement = brand.placement?.logo;
  const { x, y } = placement
    ? placeInside(
        size.w,
        size.h,
        logoSize,
        { x: placement.offset.x, y: placement.offset.y },
        placement.anchor
      )
    : legacyAnchor(size.w, size.h, logoSize, brand.logo.margin, brand.logo.position);

  ctx.drawImage(image, x, y, logoSize, logoSize);
}
