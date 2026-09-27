// layers/gradient — تدرّج علوي/سفلي/مركزي لتغميق الخلفية تحت النص.
// المرجع: reference/aa-media-kit.html:1717–1730 (`CV_GRAD_SHAPE`،
// `CV_GRAD_BAND`، `cvGradient`).
//
// السلوك مطابق للأصل، مع فرق واحد جوهري:
//   • `shape` و `band` تأتي من `brand.gradient` — لا ثوابت وحدة.
//   • `opacity` و `reach` وسائط اختيارية تسقط إلى `defaultOpacity`
//     و `defaultReach` من الهوية.
//
// **mk/478b — تحديث:** كانت الفرضيّةُ أنّ التدرّجَ قناعُ «تعتيمٍ» أسود
// دائماً. الهويّةُ الفاتحةُ نقضتْها: سطحٌ فاتحٌ ونصٌّ داكن، فتغميقُ الخلفيّةِ
// في مكانِ النصِّ يبتلعُ النصَّ لا يُبرزه. لذلك يُقرَأ اللونُ من
// `brand.gradient.color` — الغيابُ ⇒ `#000000` (سلوكٌ سابقٌ محفوظ ببايت).

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
  /**
   * mk/478b: هل هذا التدرّج على سطحِ عاجل؟ إن كانت `true` و`brand.gradient.
   * urgentColor` معلَنة، تُستعمل بدل `brand.gradient.color`. الافتراضي
   * `false` (سلوكٌ سابقٌ محفوظ ببايت).
   */
  readonly onUrgentSurface?: boolean;
}

const fmt = (n: number): string => n.toFixed(3);

// mk/478b: hex → "r,g,b" · القيمةُ الافتراضيّةُ `#000000` تُعطي `0,0,0` —
// مطابقٌ حرفيّاً لـ`rgba(0,0,0,α)` السابقة. لا `#` ⇒ نمرّرُ كما هي.
function hexToRgbTriplet(hex: string): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length !== 6) return '0,0,0';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '0,0,0';
  return `${r},${g},${b}`;
}

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
  // mk/478b: الغيابُ ⇒ '#000000' ⇒ '0,0,0' ⇒ سلوكٌ سابقٌ محفوظ.
  // على سطحِ العاجل: `urgentColor` أولاً، ثمّ `color`، ثمّ `#000000`.
  const chosenHex = params.onUrgentSurface
    ? (brand.gradient.urgentColor ?? brand.gradient.color ?? '#000000')
    : (brand.gradient.color ?? '#000000');
  const rgb = hexToRgbTriplet(chosenHex);

  if (direction === 'center') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [f, a] of brand.gradient.band) {
      g.addColorStop(f, `rgba(${rgb},${fmt(a * peak)})`);
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
    g.addColorStop(offset, `rgba(${rgb},${fmt(a * peak)})`);
  }
  if (reach < 0.999) {
    g.addColorStop(1, `rgba(${rgb},0)`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
