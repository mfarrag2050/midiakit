// layers/gradient — تدرّج علوي/سفلي/مركزي لتغميق الخلفية تحت النص.
// المرجع: reference/aa-media-kit.html:1717–1730 (`CV_GRAD_SHAPE`،
// `CV_GRAD_BAND`، `cvGradient`).
//
// السلوك مطابق للأصل، مع فرق واحد جوهري:
//   • `shape` و `band` تأتي من `brand.gradient` — لا ثوابت وحدة.
//   • `opacity` و `reach` وسائط اختيارية تسقط إلى `defaultOpacity`
//     و `defaultReach` من الهوية.
//
// لماذا اللون `rgba(0,0,0,α)` ليس قيمة هوية؟
//   التدرّج هنا **قناع تعتيم** لدرجات القرب من الحافة، لا لون من
//   الهوية. الشكل (shape/band) واتجاهه هما ما يميّز الهوية؛ الأسود
//   المشفف هو تعريف «التغميق» نفسه. مطابق لسلوك الأصل الذي كان يستعمل
//   `rgba(0,0,0,…)` صراحةً وليس لوناً معلَناً.

import type { BrandKit } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

export type GradientDirection = 'top' | 'bottom' | 'center';

export interface GradientLayerParams {
  readonly direction: GradientDirection;
  /** يسقط إلى `brand.gradient.defaultOpacity`. */
  readonly opacity?: number;
  /** يسقط إلى `brand.gradient.defaultReach`. مستعمل في top/bottom فقط. */
  readonly reach?: number;
}

const fmt = (n: number): string => n.toFixed(3);

export function drawGradient(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  brand: BrandKit,
  params: GradientLayerParams
): void {
  const { w: W, h: H } = size;
  const { direction } = params;
  const peak = params.opacity ?? brand.gradient.defaultOpacity;
  const reach = params.reach ?? brand.gradient.defaultReach;

  if (direction === 'center') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [f, a] of brand.gradient.band) {
      g.addColorStop(f, `rgba(0,0,0,${fmt(a * peak)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  // top | bottom
  const y0 = direction === 'top' ? 0 : H;
  const y1 = direction === 'top' ? H : 0;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [f, a] of brand.gradient.shape) {
    // 0.92 هو نقطة النهاية العليا في shape الأصلية؛ نقسم عليها ثم نطبق
    // reach لضغط/توسيع الوصول. مطابق حرفياً للأصل (السطر 1726).
    const offset = Math.min(1, (f / 0.92) * reach);
    g.addColorStop(offset, `rgba(0,0,0,${fmt(a * peak)})`);
  }
  if (reach < 0.999) {
    g.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
