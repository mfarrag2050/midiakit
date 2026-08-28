// layers/badge — شارة (عاجل / موقع / …).
// المرجع: reference/aa-media-kit.html:1852–1865 (`cvBadge`،
// `cvRoundRect`).
//
// كل القياسات (fontSize, height, paddingX, radius, fill, textColor,
// label) تأتي من `brand.badges.urgent` (أو أي `BadgeConfig` مطابق).
// لا نصوص ولا ألوان مثبتة.
//
// موضع الشارة:
//   • تُرسم بحافّة يمنى `rx` وحافّة سفلى `bottomY` — للاستعمال في
//     البطاقات ذات المحاذاة اليمنى (`brk`) حيث تُوضع فوق العنوان.

import type { BrandKit, UrgentBadge } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

/**
 * أي شارة تحمل نفس بنية `UrgentBadge` (fontSize, height, paddingX,
 * radius, fill, textColor, label). المرجع الحالي `brand.badges.urgent`
 * ومكافئاته لاحقاً.
 */
export type BadgeConfig = UrgentBadge;

export interface BadgeParams {
  readonly badge: BadgeConfig;
  /** الحافة اليمنى للشارة. */
  readonly rx: number;
  /** الحافة السفلى للشارة. */
  readonly bottomY: number;
}

const familyOf = (brand: BrandKit): string =>
  `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;

/**
 * يرسم مستطيلاً مدوّراً. يستعمل `ctx.roundRect` إن توفّر (المتصفحات
 * الحديثة و skia-canvas ≥ 1.0)، وإلا يبني المسار عبر `arcTo` — نفس
 * أسلوب الأصل (INVENTORY 1852–1856).
 */
function roundedRectPath(
  ctx: CanvasDrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBadge(
  ctx: CanvasDrawContext,
  _size: CanvasSize,
  brand: BrandKit,
  params: BadgeParams
): void {
  const { badge, rx, bottomY } = params;
  const family = familyOf(brand);

  // قياس عرض التسمية بعد ضبط الخط — نفس تسلسل الأصل.
  ctx.font = `700 ${badge.fontSize}px ${family}`;
  const tw = ctx.measureText(badge.label).width;
  const w = tw + badge.paddingX * 2;
  const x = rx - w;
  const y = bottomY - badge.height;

  ctx.fillStyle = badge.fill;
  roundedRectPath(ctx, x, y, w, badge.height, badge.radius);
  ctx.fill();

  ctx.fillStyle = badge.textColor;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
  // الإزاحة +3 لضبط بصريّ للخط العربي — منقولة كما هي من الأصل
  // (السطر 1864). ليست هوية.
  ctx.fillText(badge.label, x + w / 2, y + badge.height / 2 + 3);
}
