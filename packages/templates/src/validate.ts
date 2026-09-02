// validate — متحقق قوالب يُستدعى **وقت التحميل** (docs/04).
//
// **قرار (يدوي بلا Ajv):** نُبقي شجرة التبعيات نظيفة. المخطط في
// `schema.ts` مكتوب بشكل درافت-07 القياسي، فمشروع خارجي يستطيع
// تمريره لـ Ajv عند الحاجة. متحققنا يفحص:
//   • الحقول المطلوبة موجودة.
//   • قيم enum ضمن المسموح (نوع القالب، نوع الطبقة، onlyIf).
//   • بنية كل طبقة تُطابق نوعها (discriminated union).
//   • recursion داخل `fallback`.
//
// كل خطأ يحمل مساراً كاملاً (مثل `layers[2].badge.gap`) للتشخيص السريع.

import type {
  AttributionLayer,
  BadgeLayer,
  GradientLayer,
  HeadlineLayer,
  ImageLayer,
  KickerLayer,
  AccentLayer,
  Layer,
  LayerOnlyIf,
  LogoLayer,
  SolidLayer,
  SourceLayer,
  Template,
  TemplateField,
  WatermarkLayer,
} from './types.js';

// ── خطأ التحقق ────────────────────────────────────────

export class TemplateValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`[${path}] ${message}`);
    this.name = 'TemplateValidationError';
  }
}

const bail = (path: string, msg: string): never => {
  throw new TemplateValidationError(path, msg);
};

// ── مساعدات ───────────────────────────────────────────

const ONLY_IF_VALUES: readonly LayerOnlyIf[] = [
  'hasImage',
  'isSquare',
  'isPortrait',
];

const LAYER_TYPES = [
  'solid',
  'image',
  'gradient',
  'headline',
  'badge',
  'source',
  'logo',
  'watermark',
  'kicker',
  'accent',
  'attribution',
] as const;

const PLATFORM_KEYS = [
  'tiktok',
  'x',
  'instagram',
  'youtube',
  'telegram',
  'facebook',
] as const;

const ATTRIBUTION_MODES = ['handle', 'name', 'both'] as const;

const ATTRIBUTION_ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

const ATTRIBUTION_LOGO_MODES = ['none', 'generic', 'official'] as const;

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ── تحقق حقول الإدخال ─────────────────────────────────

function validateField(raw: unknown, path: string): TemplateField {
  if (!isObj(raw)) bail(path, 'حقل يجب أن يكون object');
  const o = raw as Record<string, unknown>;
  if (!isString(o['key'])) bail(`${path}.key`, 'يجب أن يكون string');
  const type = o['type'];
  if (
    !isString(type) ||
    !['text', 'richtext', 'image', 'range', 'medialist'].includes(type)
  ) {
    bail(`${path}.type`, `غير معروف: ${String(type)}`);
  }
  if (o['required'] !== undefined && !isBool(o['required'])) {
    bail(`${path}.required`, 'يجب أن يكون boolean');
  }
  if (o['hint'] !== undefined && !isString(o['hint'])) {
    bail(`${path}.hint`, 'يجب أن يكون string');
  }
  if (type === 'richtext' && o['wordRange'] !== undefined) {
    const wr = o['wordRange'];
    if (
      !Array.isArray(wr) ||
      wr.length !== 2 ||
      !isNumber(wr[0]) ||
      !isNumber(wr[1])
    ) {
      bail(`${path}.wordRange`, 'يجب أن يكون [number, number]');
    }
  }
  if (type === 'range') {
    if (!isNumber(o['min'])) bail(`${path}.min`, 'range يتطلب min');
    if (!isNumber(o['max'])) bail(`${path}.max`, 'range يتطلب max');
  }
  return raw as TemplateField;
}

// ── تحقق حقول الطبقة المشتركة ─────────────────────────

function validateLayerCommon(o: Record<string, unknown>, path: string): void {
  if (o['onlyIf'] !== undefined) {
    if (!isString(o['onlyIf']) || !ONLY_IF_VALUES.includes(o['onlyIf'] as LayerOnlyIf)) {
      bail(
        `${path}.onlyIf`,
        `يجب أن يكون واحداً من: ${ONLY_IF_VALUES.join(', ')}`
      );
    }
  }
  if (o['fallback'] !== undefined) {
    if (!Array.isArray(o['fallback'])) {
      bail(`${path}.fallback`, 'يجب أن يكون array');
    }
    o['fallback'].forEach((fb, i) => {
      validateLayer(fb, `${path}.fallback[${i}]`);
    });
  }
}

// ── تحقق الطبقة بحسب نوعها ─────────────────────────────

function validateLayer(raw: unknown, path: string): Layer {
  if (!isObj(raw)) bail(path, 'طبقة يجب أن تكون object');
  const o = raw as Record<string, unknown>;
  const type = o['type'];
  if (!isString(type) || !LAYER_TYPES.includes(type as (typeof LAYER_TYPES)[number])) {
    bail(`${path}.type`, `غير معروف: ${String(type)}`);
  }
  validateLayerCommon(o, path);

  switch (type as (typeof LAYER_TYPES)[number]) {
    case 'solid': {
      if (!isString(o['fill'])) bail(`${path}.fill`, 'يجب أن يكون string');
      return raw as SolidLayer;
    }
    case 'image': {
      if (o['field'] !== undefined && !isString(o['field'])) {
        bail(`${path}.field`, 'يجب أن يكون string');
      }
      if (o['fit'] !== undefined && !['cover', 'contain'].includes(o['fit'] as string)) {
        bail(`${path}.fit`, 'يجب أن يكون cover أو contain');
      }
      return raw as ImageLayer;
    }
    case 'gradient': {
      const dir = o['direction'];
      if (!isString(dir) || !['top', 'bottom', 'center'].includes(dir)) {
        bail(`${path}.direction`, `يجب أن يكون top|bottom|center، وُجد ${String(dir)}`);
      }
      if (o['from'] !== undefined && !isString(o['from'])) {
        bail(`${path}.from`, 'يجب أن يكون مرجع string');
      }
      return raw as GradientLayer;
    }
    case 'headline': {
      if (!isString(o['field'])) bail(`${path}.field`, 'headline يتطلب field');
      const wrap = o['wrap'];
      if (!isString(wrap) || !['uniform', 'alternating', 'balanced'].includes(wrap)) {
        bail(`${path}.wrap`, `يجب أن يكون uniform|alternating|balanced، وُجد ${String(wrap)}`);
      }
      const align = o['align'];
      if (!isString(align) || !['right', 'center'].includes(align)) {
        bail(`${path}.align`, 'يجب أن يكون right أو center');
      }
      const anchor = o['anchor'];
      if (
        !isString(anchor) ||
        !['centerLower', 'bottom', 'top', 'middle', 'below-kicker'].includes(anchor)
      ) {
        bail(
          `${path}.anchor`,
          `يجب أن يكون centerLower|bottom|top|middle|below-kicker، وُجد ${String(anchor)}`
        );
      }
      if (anchor === 'centerLower' && !isNumber(o['verticalAnchor'])) {
        bail(`${path}.verticalAnchor`, 'centerLower يتطلب verticalAnchor:number');
      }
      if (!isString(o['font'])) bail(`${path}.font`, 'يجب أن يكون مرجع brand.*');
      if (o['justify'] !== undefined && !isString(o['justify'])) {
        bail(`${path}.justify`, 'يجب أن يكون مرجع brand.*');
      }
      return raw as HeadlineLayer;
    }
    case 'badge': {
      if (!isString(o['use'])) bail(`${path}.use`, 'badge يتطلب use (مرجع brand.badges.*)');
      const anchor = o['anchor'];
      if (!isString(anchor) || !['above-headline', 'below-headline'].includes(anchor)) {
        bail(`${path}.anchor`, 'يجب أن يكون above-headline أو below-headline');
      }
      if (!isString(o['gap']) && !isNumber(o['gap'])) {
        bail(`${path}.gap`, 'يجب أن يكون رقم أو مرجع brand.*');
      }
      if (o['field'] !== undefined && !isString(o['field'])) {
        bail(`${path}.field`, 'يجب أن يكون string');
      }
      return raw as BadgeLayer;
    }
    case 'source': {
      if (!isString(o['field'])) bail(`${path}.field`, 'source يتطلب field');
      const anchor = o['anchor'];
      if (anchor !== 'below-headline') {
        bail(`${path}.anchor`, 'source يدعم below-headline فقط حالياً');
      }
      if (!isNumber(o['gapFsRatio'])) {
        bail(`${path}.gapFsRatio`, 'يجب أن يكون رقم (نسبة من fs)');
      }
      if (!isString(o['font'])) bail(`${path}.font`, 'يجب أن يكون مرجع brand.*');
      return raw as SourceLayer;
    }
    case 'logo': {
      if (o['from'] !== undefined && !isString(o['from'])) {
        bail(`${path}.from`, 'يجب أن يكون مرجع brand.*');
      }
      return raw as LogoLayer;
    }
    case 'watermark': {
      if (!isString(o['from'])) bail(`${path}.from`, 'watermark يتطلب from');
      return raw as WatermarkLayer;
    }
    case 'kicker': {
      if (!isString(o['field'])) bail(`${path}.field`, 'kicker يتطلب field');
      if (!isString(o['font'])) bail(`${path}.font`, 'يجب أن يكون مرجع brand.*');
      if (o['verticalAnchor'] !== undefined && !isNumber(o['verticalAnchor'])) {
        bail(`${path}.verticalAnchor`, 'يجب أن يكون رقم (نسبة من ارتفاع القماش)');
      }
      return raw as KickerLayer;
    }
    case 'accent': {
      const mode = o['mode'];
      if (
        !isString(mode) ||
        !['span', 'underline', 'above-first-line'].includes(mode)
      ) {
        bail(`${path}.mode`, 'يجب أن يكون span|underline|above-first-line');
      }
      return raw as AccentLayer;
    }
    case 'attribution': {
      const platform = o['platform'];
      if (
        !isString(platform) ||
        !(PLATFORM_KEYS as readonly string[]).includes(platform)
      ) {
        bail(
          `${path}.platform`,
          `يجب أن يكون واحداً من: ${PLATFORM_KEYS.join(', ')}`
        );
      }
      const attrMode = o['mode'];
      if (
        !isString(attrMode) ||
        !(ATTRIBUTION_MODES as readonly string[]).includes(attrMode)
      ) {
        bail(`${path}.mode`, `يجب أن يكون handle|name|both`);
      }
      const anchor = o['anchor'];
      if (
        !isString(anchor) ||
        !(ATTRIBUTION_ANCHORS as readonly string[]).includes(anchor)
      ) {
        bail(
          `${path}.anchor`,
          `يجب أن يكون top-left|top-right|bottom-left|bottom-right`
        );
      }
      if (o['handleField'] !== undefined && !isString(o['handleField'])) {
        bail(`${path}.handleField`, 'يجب أن يكون string');
      }
      if (o['nameField'] !== undefined && !isString(o['nameField'])) {
        bail(`${path}.nameField`, 'يجب أن يكون string');
      }
      if (o['prefixLabel'] !== undefined && !isString(o['prefixLabel'])) {
        bail(`${path}.prefixLabel`, 'يجب أن يكون string');
      }
      if (o['logoModeOverride'] !== undefined) {
        const lm = o['logoModeOverride'];
        if (!isString(lm) || !(ATTRIBUTION_LOGO_MODES as readonly string[]).includes(lm)) {
          bail(`${path}.logoModeOverride`, 'يجب أن يكون none|generic|official');
        }
      }
      if (o['margin'] !== undefined && !isNumber(o['margin'])) {
        bail(`${path}.margin`, 'يجب أن يكون رقم (px)');
      }
      // فحص اتساق: mode + الحقول المطلوبة
      if ((attrMode === 'handle' || attrMode === 'both') && !isString(o['handleField'])) {
        bail(
          `${path}.handleField`,
          `mode='${attrMode}' يتطلب handleField (مفتاح content)`
        );
      }
      if ((attrMode === 'name' || attrMode === 'both') && !isString(o['nameField'])) {
        bail(
          `${path}.nameField`,
          `mode='${attrMode}' يتطلب nameField (مفتاح content)`
        );
      }
      return raw as AttributionLayer;
    }
  }
}

// ── الواجهة العامة ─────────────────────────────────────

/**
 * يتحقق من قالب ويعيده مصنَّفاً بالنوع الصحيح، أو يرمي
 * `TemplateValidationError` مع مسار الخطأ.
 *
 * **يُستدعى وقت التحميل** — قبل تخزين القالب في السجل، لا في مسار الرندر.
 */
export function validateTemplate(raw: unknown): Template {
  if (!isObj(raw)) bail('', 'القالب يجب أن يكون object');
  const o = raw as Record<string, unknown>;

  if (!isString(o['id'])) bail('id', 'يجب أن يكون string');
  if (!/^[a-z][a-z0-9_-]*$/.test(o['id'])) {
    bail('id', 'يجب أن يبدأ بحرف صغير ويحوي [a-z0-9_-] فقط');
  }
  if (!isString(o['name']) || o['name'].length === 0) {
    bail('name', 'يجب أن يكون string غير فارغ');
  }
  const kind = o['kind'];
  if (!isString(kind) || !['static', 'video'].includes(kind)) {
    bail('kind', 'يجب أن يكون static أو video');
  }
  if (!Array.isArray(o['sizes']) || o['sizes'].length === 0) {
    bail('sizes', 'يجب أن يكون array غير فارغ من strings');
  }
  o['sizes'].forEach((s, i) => {
    if (!isString(s)) bail(`sizes[${i}]`, 'يجب أن يكون string');
  });

  if (o['fields'] !== undefined) {
    if (!Array.isArray(o['fields'])) bail('fields', 'يجب أن يكون array');
    o['fields'].forEach((f, i) => validateField(f, `fields[${i}]`));
  }

  if (!Array.isArray(o['layers']) || o['layers'].length === 0) {
    bail('layers', 'يجب أن يكون array غير فارغ');
  }
  o['layers'].forEach((l, i) => validateLayer(l, `layers[${i}]`));

  if (o['video'] !== undefined) validateVideo(o['video'], 'video');

  return raw as Template;
}

// ── تحقق كتلة الفيديو ────────────────────────────────

const EASING_NAMES = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutBack',
];

function validateVideo(raw: unknown, path: string): void {
  if (!isObj(raw)) bail(path, 'video يجب أن يكون object');
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o['animation'])) {
    bail(`${path}.animation`, 'يجب أن يكون array');
  }
  o['animation'].forEach((a, i) => validateAnimation(a, `${path}.animation[${i}]`));

  const outro = o['outro'];
  if (!isString(outro) && !isNumber(outro)) {
    bail(`${path}.outro`, 'يجب أن يكون رقم أو مرجع brand.*');
  }
  const easing = o['easing'];
  if (!isString(easing) || !EASING_NAMES.includes(easing)) {
    bail(`${path}.easing`, `يجب أن يكون واحداً من: ${EASING_NAMES.join(', ')}`);
  }
}

function validateAnimation(raw: unknown, path: string): void {
  if (!isObj(raw)) bail(path, 'animation يجب أن تكون object');
  const o = raw as Record<string, unknown>;
  if (!isString(o['target'])) bail(`${path}.target`, 'يجب أن يكون string');
  if (o['at'] !== undefined && !isNumber(o['at'])) {
    bail(`${path}.at`, 'يجب أن يكون رقم');
  }
  if (o['after'] !== undefined && !isString(o['after'])) {
    bail(`${path}.after`, 'يجب أن يكون string (اسم target آخر)');
  }
  if (o['at'] === undefined && o['after'] === undefined) {
    bail(path, 'يجب تحديد at أو after');
  }
  const fade = o['fade'];
  if (!isString(fade) && !isNumber(fade)) {
    bail(`${path}.fade`, 'يجب أن يكون رقم أو مرجع brand.*');
  }
  if (
    o['stagger'] !== undefined &&
    !isString(o['stagger']) &&
    !isNumber(o['stagger'])
  ) {
    bail(`${path}.stagger`, 'يجب أن يكون رقم أو مرجع brand.*');
  }
  if (o['slideY'] !== undefined && !isNumber(o['slideY'])) {
    bail(`${path}.slideY`, 'يجب أن يكون رقم');
  }
  if (o['pulse'] !== undefined && !isBool(o['pulse'])) {
    bail(`${path}.pulse`, 'يجب أن يكون boolean');
  }
}
