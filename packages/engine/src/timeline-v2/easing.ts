// timeline-v2/easing — دوال التسهيل الثمانية (docs/10 §دوال التسهيل).
//
// **العقد:** كل دالة تأخذ `t ∈ [0, 1]` وتعيد `[0, 1]` تقريباً.
// `easeOutBack` و`spring` قد يتجاوزا النطاق قليلاً بقصد بصري.
//
// **مستقلة عن easing.ts القديم:** الأسماء تختلف (`easeIn` vs `easeInQuad`)،
// المجموعة تختلف (`spring` و`step` جديدان). القديم يبقى لخدمة
// @legacy drawAt، الجديد يخدم drawTimelineAt.

import type { TimelineEasingName } from '@pf-mediakit/shared';

type EasingFn = (t: number) => number;

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

const linear: EasingFn = (t) => t;

/** easeIn (quadratic) — بطيء أول، أسرع نهاية. */
const easeIn: EasingFn = (t) => t * t;

/** easeOut (quadratic) — سريع أول، أبطأ نهاية. */
const easeOut: EasingFn = (t) => t * (2 - t);

/** easeInOut (quadratic) — بطء، سرعة، بطء. */
const easeInOut: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/** easeOutCubic — الأكثر استعمالاً للظهور الطباعي. */
const easeOutCubic: EasingFn = (t) => {
  const p = t - 1;
  return p * p * p + 1;
};

/** easeOutBack — يتجاوز 1 قليلاً ثم يستقر (ثابت Penner 1.70158). */
const easeOutBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

/**
 * spring — نموذج نابض مبسّط (Underdamped). المعادلة:
 *   1 - e^(-6t) × cos(12t) — قد يتجاوز 1 ثم يعود.
 * ليست فيزيائية دقيقة، لكنها تعطي إحساساً «نابضاً» بلا معاملات إضافية.
 */
const spring: EasingFn = (t) => {
  const decay = Math.exp(-6 * t);
  const osc = Math.cos(12 * t);
  return 1 - decay * osc;
};

/**
 * step — قفزة صلبة عند t=0.5. مفيد للـsnap على الفوريّ (revealing badge،
 * قصّ حادّ). قبل النصف = 0، من النصف فما بعد = 1.
 */
const step: EasingFn = (t) => (t < 0.5 ? 0 : 1);

const REGISTRY: Readonly<Record<TimelineEasingName, EasingFn>> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeOutCubic,
  easeOutBack,
  spring,
  step,
};

/**
 * يُعيد قيمة الدالة عند `t`. `t` يُقصَّ إلى [0, 1] أولاً.
 * الاسم غير المعروف — استثناء (بدلاً من صمت رياضي).
 */
export function ease(name: TimelineEasingName, t: number): number {
  const fn = REGISTRY[name];
  if (!fn) throw new Error(`easing غير معروف: ${name}`);
  return fn(clamp01(t));
}

export function getEasingFn(name: TimelineEasingName): EasingFn {
  const fn = REGISTRY[name];
  if (!fn) throw new Error(`easing غير معروف: ${name}`);
  return fn;
}

/** فحص من التسع أسماء المعتمدة. */
export function isTimelineEasingName(s: string): s is TimelineEasingName {
  return s in REGISTRY;
}
