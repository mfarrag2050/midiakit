// timeline-v2 — النموذج والمحرك الزمني الجديد.
//
// **قرار المالك (2026-09-02):** بناء من الصفر بمفهوم المسارات المتوازية،
// لا توسيع نموذج المقاطع المتتابعة (timeline/ القديم = @legacy).
//
// **الأنواع** في `@pf-mediakit/shared/timeline-types` — types-only،
// لا تعتمد على المحرك. **الاستدعاءات** هنا خالصة، بلا حالة.

export { ease, getEasingFn, isTimelineEasingName } from './easing.js';
export { interpolate } from './interpolate.js';
export { resolveAt } from './resolve-at.js';
export { timelineDuration, timelineMaxItemEnd } from './duration.js';
export {
  drawTimelineAt,
  type DrawTimelineAtArgs,
} from './draw-timeline-at.js';
export {
  buildTimelinePlan,
  collectTextItems,
  type TimelinePlan,
  type BuildTimelinePlanArgs,
  type PreparedTextItem,
} from './plan.js';
