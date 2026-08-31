// @pf-mediakit/templates — تعريفات القوالب ومتحققها.
//
// **الواجهة الخارجية:**
//   • Template + Layer + TemplateField أنواع TS.
//   • TEMPLATE_SCHEMA كائن JSON Schema draft-07 (بيانات، للاستهلاك الخارجي).
//   • validateTemplate(raw) → Template — يرمي عند فشل، يُستدعى وقت التحميل.
//   • registry القوالب الجاهزة (breaking، card_*، reel، plain، …) —
//     كلها مُتحقَّق منها عند الاستيراد الأول.

import breakingRaw from './templates/breaking.json' with { type: 'json' };
import cardCenteredRaw from './templates/card-centered.json' with { type: 'json' };
import cardBottomRaw from './templates/card-bottom.json' with { type: 'json' };
import cardKickerRaw from './templates/card-kicker.json' with { type: 'json' };
import reelRaw from './templates/reel.json' with { type: 'json' };
import plainRaw from './templates/plain.json' with { type: 'json' };

import { validateTemplate, TemplateValidationError } from './validate.js';
import type { Template } from './types.js';

// ── تحقق وقت الاستيراد (مرة واحدة) ────────────────────
//
// إن كسر JSON للـ schema، الحزمة تفشل في التحميل — لا مخرَج معطوب صامتاً.
export const BREAKING: Template = validateTemplate(breakingRaw);
export const CARD_CENTERED: Template = validateTemplate(cardCenteredRaw);
export const CARD_BOTTOM: Template = validateTemplate(cardBottomRaw);
export const CARD_KICKER: Template = validateTemplate(cardKickerRaw);
export const REEL: Template = validateTemplate(reelRaw);
export const PLAIN: Template = validateTemplate(plainRaw);

/** سجل القوالب الجاهزة — يُستعمل كتراجع أو للاختبار. */
export const TEMPLATES: Readonly<Record<string, Template>> = Object.freeze({
  breaking: BREAKING,
  card_centered: CARD_CENTERED,
  card_bottom: CARD_BOTTOM,
  card_kicker: CARD_KICKER,
  reel: REEL,
  plain: PLAIN,
});

export { validateTemplate, TemplateValidationError };
export { TEMPLATE_SCHEMA } from './schema.js';
export * from './types.js';
