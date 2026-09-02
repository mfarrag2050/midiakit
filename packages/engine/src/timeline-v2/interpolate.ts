// timeline-v2/interpolate — استيفاء المفاتيح المفتاحية (docs/10 عقد المحرك).
//
// **العقد:** `interpolate(keyframes, t)` تعيد `InterpolatedProps` كاملة —
// كل خاصية محسومة (لا اختيار). t نسبي إلى بداية العنصر (0 = start).
//
// **دلالة الحقول الاختيارية في Keyframe:** المفتاح الذي لا يذكر خاصية
// **يورث** آخر قيمة صريحة لتلك الخاصية من مفتاح سابق. إن لم يكن هناك
// مفتاح سابق يذكرها، يُستعمل الافتراضي (opacity=1, x=0, y=0, scale=1,
// rotation=0). هذا يسمح بتحريك حقل واحد بلا إعادة كتابة الحقول.
//
// **ترتيب المفاتيح:** يُفترض تصاعدي في `t`. غير ذلك سلوك غير محدَّد.
// المدعو مسؤول عن الفرز — نتفادى نسخ مصفوفة داخل الحلقة.
//
// **حالات حدّية:**
//   • 0 مفاتيح       → الافتراضيات
//   • 1 مفتاح        → قيمه الصريحة + الافتراضيات للباقي
//   • t < first.t    → قيم first (اقتصاص إلى البداية)
//   • t > last.t     → قيم last (اقتصاص إلى النهاية)
//   • t بين مفتاحين  → استيفاء بـease من المفتاح **السابق** (docs/10)
//
// **النقاء:** دالة رياضية بحتة. لا حالة، لا وقت، لا عشوائية.

import type {
  InterpolatedProps,
  Keyframe,
} from '@pf-mediakit/shared';
import { getEasingFn } from './easing.js';

const DEFAULTS: InterpolatedProps = Object.freeze({
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
});

type PropKey = 'opacity' | 'x' | 'y' | 'scale' | 'rotation';
const PROP_KEYS: readonly PropKey[] = ['opacity', 'x', 'y', 'scale', 'rotation'];

/** يجمع القيم الصريحة لكل خاصية من كل المفاتيح — لدعم الوراثة. */
function collectExplicit(keyframes: readonly Keyframe[]): Record<PropKey, (number | undefined)[]> {
  const out: Record<PropKey, (number | undefined)[]> = {
    opacity: [],
    x: [],
    y: [],
    scale: [],
    rotation: [],
  };
  for (const kf of keyframes) {
    for (const key of PROP_KEYS) {
      out[key].push(kf[key]);
    }
  }
  return out;
}

/** أعطِ آخر قيمة صريحة قبل index (أو نفسه إن كان صريحاً). */
function lastExplicitAt(
  values: readonly (number | undefined)[],
  index: number,
  fallback: number
): number {
  for (let i = index; i >= 0; i--) {
    const v = values[i];
    if (v !== undefined) return v;
  }
  return fallback;
}

/** أول قيمة صريحة من index إلى الأمام (أو نفسه إن كان صريحاً). */
function nextExplicitFrom(
  values: readonly (number | undefined)[],
  index: number,
  fallback: number
): number {
  for (let i = index; i < values.length; i++) {
    const v = values[i];
    if (v !== undefined) return v;
  }
  return fallback;
}

export function interpolate(
  keyframes: readonly Keyframe[],
  t: number
): InterpolatedProps {
  const n = keyframes.length;
  if (n === 0) return DEFAULTS;

  // اقتصاص إلى مدى المفاتيح — قبل الأول و بعد الأخير يُصلّبان.
  const first = keyframes[0]!;
  const last = keyframes[n - 1]!;
  if (t <= first.t) {
    return propsAt(keyframes, 0);
  }
  if (t >= last.t) {
    return propsAt(keyframes, n - 1);
  }

  // ابحث عن الجيب [prev, next] الذي يحوي t.
  let prevIdx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (keyframes[i]!.t <= t && t <= keyframes[i + 1]!.t) {
      prevIdx = i;
      break;
    }
  }
  const nextIdx = prevIdx + 1;
  const prev = keyframes[prevIdx]!;
  const next = keyframes[nextIdx]!;

  const span = next.t - prev.t;
  const localProgress = span > 0 ? (t - prev.t) / span : 0;
  // ease مرتبط بالمفتاح السابق — يصف انتقال prev→next.
  const easing = prev.ease ? getEasingFn(prev.ease) : (x: number) => x;
  const eased = easing(localProgress);

  const explicit = collectExplicit(keyframes);
  const outMut: Record<PropKey, number> = { ...DEFAULTS };
  for (const key of PROP_KEYS) {
    const values = explicit[key];
    // القيمة عند prev = آخر قيمة صريحة ≤ prevIdx.
    const fromV = lastExplicitAt(values, prevIdx, DEFAULTS[key]);
    // القيمة عند next = أول قيمة صريحة ≥ nextIdx إن وُجدت،
    // وإلا تبقى fromV (لا تغيير على هذا الجيب).
    const toV = nextExplicitFrom(values, nextIdx, fromV);
    outMut[key] = fromV + (toV - fromV) * eased;
  }
  return outMut;
}

/**
 * القيم عند مفتاح محدد — كل خاصية = آخر قيمة صريحة ≤ index،
 * أو الافتراضي إن لا توجد صريحة قبله.
 */
function propsAt(keyframes: readonly Keyframe[], index: number): InterpolatedProps {
  const outMut: Record<PropKey, number> = { ...DEFAULTS };
  for (const key of PROP_KEYS) {
    for (let i = index; i >= 0; i--) {
      const v = keyframes[i]![key];
      if (v !== undefined) {
        outMut[key] = v;
        break;
      }
    }
  }
  return outMut;
}
