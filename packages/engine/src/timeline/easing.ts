// easing — دوال التسهيل المتاحة في `template.video.easing`.
//
// **العقد:** كل دالة تأخذ `t ∈ [0, 1]` وتُعيد قيمة ∈ `[0, 1]` تقريباً
// (بعضها كـ`easeOutBack` قد يخرج قليلاً عن النطاق للأثر البصري).
//
// **الاختيار:** الافتراضي `easeOutCubic` — يعطي حركة ظهور طبيعية:
// سرعة كاملة في البداية، تباطؤ نحو النهاية. مثالي للـfade + slideY.

import type { EasingName } from '@pf-mediakit/templates';

type EasingFn = (t: number) => number;

const linear: EasingFn = (t) => t;

const easeInQuad: EasingFn = (t) => t * t;
const easeOutQuad: EasingFn = (t) => t * (2 - t);
const easeInOutQuad: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const easeInCubic: EasingFn = (t) => t * t * t;
const easeOutCubic: EasingFn = (t) => {
  const p = t - 1;
  return p * p * p + 1;
};
const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

/**
 * `easeOutBack` — يتجاوز 1 قليلاً ثم يستقرّ. مفيد لتأثير النبض.
 * الثابت 1.70158 قياسي في مكتبات التسهيل (Penner).
 */
const easeOutBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

const EASINGS: Readonly<Record<EasingName, EasingFn>> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
};

export function ease(name: EasingName, t: number): number {
  return EASINGS[name](Math.max(0, Math.min(1, t)));
}

export function getEasingFn(name: EasingName): EasingFn {
  return EASINGS[name];
}
