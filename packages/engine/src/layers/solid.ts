// layers/solid — لون صلب يغطّي الإطار.
// المرجع: reference/aa-media-kit.html:1876 (`cvBreakingBg` — الجزء اللوني)
// و 1895 (`cvRenderInto` — خلفية أساس).
//
// لا لون مثبت. الطبقة تسحب من `brand.colors[colorKey]` — أي مفتاح
// من BrandColors (surface, urgentBg, text، …).

import type { BrandKit, BrandColors } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

/**
 * مفاتيح الألوان الصلبة الصالحة كخلفية.
 * (`placeholder` مصفوفة — للتدرّج فقط، ليست لوناً واحداً.)
 */
export type SolidColorKey = Exclude<keyof BrandColors, 'placeholder'>;

export interface SolidLayerParams {
  readonly colorKey: SolidColorKey;
}

/**
 * يملأ الإطار بلون من `brand.colors[colorKey]`.
 */
export function drawSolid(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  brand: BrandKit,
  params: SolidLayerParams
): void {
  ctx.fillStyle = brand.colors[params.colorKey];
  ctx.fillRect(0, 0, size.w, size.h);
}
