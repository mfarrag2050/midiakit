// vertical-fit — mk/535: الكتلةُ الرأسيّة (شارة · عنوان · مصدر) تبقى داخل
// الهامش الآمن. مصدرٌ واحدٌ للقاعدة يستعمله render.ts (و render-plan عبره).
//
// **العلّة (10-05 · showroom 1080×1080):** عنوان طويل (6 أسطر) → source
// baseline ≈ h-15 → حروف المصدر مقصوصة أسفل الإطار. نحتاج:
//   • قياس الهامش العلويّ/السفليّ (brand.placement.safeArea إن وُجد،
//     وإلّا 6% من h).
//   • حسابُ ارتفاع الكتلة = reserveTop (شارة+gap) + headlineHeight +
//     reserveBottom (gap+source).
//   • إن تجاوزت الكتلةُ الحدَّ السفليّ، نرفع anchor؛ إن لم يكفِ (ضربنا
//     الحدَّ العلويّ أيضاً) نُبلّغ بـ`needsSmaller=true`.
//
// الدالّةُ خالصةٌ — لا تلمس ctx ولا state.

import type { BrandKit } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import type { CanvasSize } from './layers/image.js';

export interface SafeAreaMargins {
  readonly top: number;
  readonly bottom: number;
}

/**
 * الهامشُ الرأسيّ الآمن. اليوم: 6% من size.h top/bottom. مستقبلاً يمكن
 * قراءةُ `brand.placement.safeArea.vertical` إن أُضيف إلى BrandKit.
 */
export function getVerticalSafeArea(_brand: BrandKit, size: CanvasSize): SafeAreaMargins {
  const m = Math.round(size.h * 0.06);
  return { top: m, bottom: m };
}

/**
 * ارتفاعُ الشارةِ المحجوز فوق العنوان (shabka above-headline). يُقرأ من
 * `brand.badges.urgent` حين توجد الطبقة في القالب — وإلّا 0.
 */
export function badgeReserveAbove(template: Template, brand: BrandKit): number {
  const badge = template.layers.find(
    (l): l is Extract<typeof template.layers[number], { type: 'badge' }> =>
      l.type === 'badge' && (l.anchor === 'above-headline' || !l.anchor)
  );
  if (!badge) return 0;
  const gap = typeof badge.gap === 'string'
    ? (resolveGap(brand, badge.gap) ?? 0)
    : (badge.gap ?? 0);
  const urgent = brand.badges?.urgent;
  const h = urgent?.height ?? 72;
  return h + gap;
}

/**
 * ارتفاعُ المصدر المحجوز تحت العنوان. يُقدَّر بـgapFsRatio*fs +
 * source.size * 1.2 (fs العنوان، source.size من brand.typography.source).
 */
export function sourceReserveBelow(
  template: Template,
  brand: BrandKit,
  headlineFontSize: number
): number {
  const source = template.layers.find(
    (l): l is Extract<typeof template.layers[number], { type: 'source' }> =>
      l.type === 'source' && l.anchor === 'below-headline'
  );
  if (!source) return 0;
  const gapRatio = source.gapFsRatio ?? 1.4;
  const sourceFs = brand.typography?.source?.size ?? 34;
  return gapRatio * headlineFontSize + sourceFs * 1.2;
}

function resolveGap(brand: BrandKit, path: string): number | null {
  if (!path.startsWith('brand.')) return null;
  const parts = path.slice(6).split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = brand;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return typeof cur === 'number' ? cur : null;
}

export interface ClampResult {
  readonly firstBaseline: number;
  /** true حين الكتلةُ أطولُ من الهامش الآمن حتى بعد رفعِ anchor للحدّ. */
  readonly needsSmaller: boolean;
  /** للتشخيص فقط. */
  readonly blockTop: number;
  readonly blockBottom: number;
}

/**
 * يُثبِّتُ firstBaseline بحيث تقعُ الكتلةُ ضمن الهامش الآمن. يرفع anchor
 * (يُنقِص firstBaseline) حين الكتلةُ تطفحُ من الأسفل. إن ضرب الحدَّ العلويّ،
 * يُرجعُ needsSmaller=true (المستدعي ينبغي أن يُعيد الـwrap بـfs أصغر).
 */
export function clampHeadlineAnchorToSafeArea(
  desiredFirstBaseline: number,
  size: CanvasSize,
  nLines: number,
  lineHeight: number,
  fontSize: number,
  safeArea: SafeAreaMargins,
  reserveTop: number,
  reserveBottom: number
): ClampResult {
  const compute = (fb: number) => {
    const headlineTop = fb - fontSize;
    const headlineBottom = fb + (nLines - 1) * lineHeight;
    return {
      blockTop: headlineTop - reserveTop,
      blockBottom: headlineBottom + reserveBottom,
    };
  };
  let fb = desiredFirstBaseline;
  let { blockTop, blockBottom } = compute(fb);
  const maxBottom = size.h - safeArea.bottom;
  const overflowBottom = blockBottom - maxBottom;
  if (overflowBottom > 0) {
    fb -= overflowBottom;
    ({ blockTop, blockBottom } = compute(fb));
  }
  const needsSmaller = blockTop < safeArea.top;
  return { firstBaseline: fb, needsSmaller, blockTop, blockBottom };
}
