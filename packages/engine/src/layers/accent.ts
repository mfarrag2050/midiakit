// layers/accent — قضيب التمييز الأفقي.
// المرجع: reference/aa-media-kit.html:1767 (`cvAccent`) و 1768
// (`cvAccentSpan`).
//
// شكلان:
//   • drawAccentBar(cx, y, w) — متمركز حول cx بعرض w، للاحتياط عندما
//     لا توجد كلمة مميّزة داخل السطر.
//   • drawAccentSpan(x0, x1, y) — يمتد من x0 إلى x1، للتغطية حول
//     الكلمات المميّزة (`_..._`) وحدودها تُحسب من `drawLine*`.
//
// اللون من `brand.colors.accent`. الارتفاع من
// `brand.typography.accentBar.height`. لا مثبتات.

import type { BrandKit } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

export interface AccentBarParams {
  readonly cx: number;
  readonly y: number;
  readonly w: number;
}

export interface AccentSpanParams {
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
}

export function drawAccentBar(
  ctx: CanvasDrawContext,
  _size: CanvasSize,
  brand: BrandKit,
  params: AccentBarParams
): void {
  const { cx, y, w } = params;
  const h = brand.typography.accentBar.height;
  ctx.fillStyle = brand.colors.accent;
  ctx.fillRect(Math.round(cx - w / 2), Math.round(y), Math.round(w), h);
}

export function drawAccentSpan(
  ctx: CanvasDrawContext,
  _size: CanvasSize,
  brand: BrandKit,
  params: AccentSpanParams
): void {
  const { x0, x1, y } = params;
  const h = brand.typography.accentBar.height;
  ctx.fillStyle = brand.colors.accent;
  ctx.fillRect(Math.round(x0), Math.round(y), Math.round(x1 - x0), h);
}
