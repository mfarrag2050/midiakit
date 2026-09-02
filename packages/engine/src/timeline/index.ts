// timeline — النموذج والمحرك الزمني.
//
// **التاريخ:** بُني من الصفر بمفهوم المسارات المتوازية (2026-09-02،
// المرحلة 3.7). @legacy السابق (timelineOf + drawAt + parseAnimations
// على شكل مقاطع متتابعة) حُذف بعد إثبات التكافؤ 253/253 إطاراً وتحويل
// كل المستدعين إلى `templateToTimeline` + `drawTimelineAt`.
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
  type KenBurnsOrigin,
} from './draw-timeline-at.js';
export {
  buildTimelinePlan,
  collectTextItems,
  type TimelinePlan,
  type BuildTimelinePlanArgs,
  type PreparedTextItem,
} from './plan.js';
export {
  drawTextItemLines,
  drawTextItemByWordRTL,
  drawTextItemTypewriterRTL,
  totalWordCount,
} from './text-effects.js';
export {
  applyTransitionFrame,
  resolveDirection,
  type TransitionRole,
} from './transitions.js';
export {
  templateToTimeline,
  parseAnimations,
  baseDurationForHeadline,
  resolveNum,
  type TemplateToTimelineArgs,
  type ResolvedAnimation,
} from './template-adapter.js';
export {
  buildAudioGraph,
  collectAudioTracks,
  type AudioPlan,
  type AudioTrackPlan,
  type AudioItemPlan,
  type AudioSource,
  type DuckingRule,
} from './audio-graph.js';
