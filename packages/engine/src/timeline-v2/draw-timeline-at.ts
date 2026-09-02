// timeline-v2/draw-timeline-at — الرسم من نموذج جديد. **دالة خالصة**.
//
// **العقد (docs/10):** `drawTimelineAt` تأخذ زمناً `t` وتنتج الإطار
// دون حالة متراكمة. أي ترتيب استدعاءات (t=5.7 قبل t=1.4) يعطي نفس
// النتائج. الاختبار: purity.test.ts.
//
// **مبدأ الاستدعاء:** لا نعيد بناء طبقات الرسم — نستدعي الموجودة
// (executeLayer، drawHeadlineLine، ctx.fillRect). البنية الجديدة هي
// **الأوركسترا الزمنية** فقط.
//
// **بنية العنصر (item):**
//   1. `keyframes` تُستوفى إلى `props` (opacity, x, y, scale, rotation).
//   2. `ctx.save()` مرة واحدة لكل العنصر.
//   3. تُطبَّق `props` كتحويل قاعدي (globalAlpha، translate).
//   4. `effects` تُنفَّذ بالترتيب — منها ما يعدّل ctx (transforms) ومنها
//      ما يرسم (draws). ترتيب المصفوفة يقرّر التركيب.
//   5. `ctx.restore()` — كل التحويلات المؤقتة تنقض معاً.
//
// **جلسة 1 — سجل مؤثّرات مصغّر** يكفي لبوابة التكافؤ مع قالب breaking:
//   • `template-layer`         — يستدعي executeLayer لطبقة قالب محددة
//   • `template-headline`      — يستدعي drawHeadlineLine لكل سطر مع
//                                stagger (يطابق سلوك @legacy)
//   • `pulse-around-center`    — يطبّق scale نبضة حول مركز القماش
//                                (transform-only، يسبق draw-effect)
//   • `outro-black-overlay`    — fillRect أسود بشفافية متزايدة
//
// المؤثرات القياسية من docs/10 (kenBurns، crossfade…) للجلسات القادمة
// — يُضاف مفتاحها هنا بلا لمس بنية drawTimelineAt.

import type { BrandKit } from '@pf-mediakit/shared';
import type {
  EffectRef,
  InterpolatedProps,
  Timeline,
} from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';

import type {
  CanvasDrawContext,
  CanvasFontContext,
  ImageLike,
} from '../text/index.js';
import type { CanvasSize, ImageCrop } from '../layers/image.js';
import {
  drawHeadlineLine,
  executeLayer,
  type RenderFrameArgs,
  type RenderState,
  type PreparedHeadline,
} from '../render.js';

import { resolveAt } from './resolve-at.js';
import { interpolate } from './interpolate.js';
import { getEasingFn } from './easing.js';

// ── مدخلات الاستدعاء ──────────────────────────────────

export interface DrawTimelineAtArgs {
  readonly ctx: CanvasDrawContext & CanvasFontContext;
  readonly size: CanvasSize;
  readonly timeline: Timeline;
  readonly brand: BrandKit;
  /** القالب المرجعي — طبقاته يُشار إليها بالفهرس من مؤثّرات الإطار. */
  readonly template: Template;
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets?: {
    readonly images?: Readonly<Record<string, ImageLike>>;
    readonly imageCrops?: Readonly<Record<string, ImageCrop>>;
  };
  /**
   * PreparedHeadline مبنية مسبقاً — يستهلكها مؤثّر `template-headline`.
   * حين مُمرَّرة، drawTimelineAt يتجنّب قياس النص لكل إطار (L-07).
   */
  readonly headlinePrep?: PreparedHeadline;
  /** الزمن بالثواني — 0 هو أول إطار. */
  readonly t: number;
}

// ── معلَمات مؤثّرات معروفة ──────────────────────────

interface TemplateLayerEffect extends EffectRef {
  readonly type: 'template-layer';
  readonly layerIndex: number;
}

interface TemplateHeadlineEffect extends EffectRef {
  readonly type: 'template-headline';
  readonly layerIndex: number;
  /** stagger بين السطور بالثواني — 0 = بلا تدرّج. */
  readonly stagger: number;
  /** مدة الفيد لكل سطر. */
  readonly fade: number;
  /** إزاحة رأسية بدء (بكسل). */
  readonly slideY: number;
  /** تعديل زمن بدء الحركة نسبياً إلى item.start. */
  readonly startOffset: number;
}

interface PulseEffect extends EffectRef {
  readonly type: 'pulse-around-center';
  readonly amount: number;
  readonly duration: number;
  readonly startOffset: number;
}

interface OutroOverlayEffect extends EffectRef {
  readonly type: 'outro-black-overlay';
  readonly startOffset: number;
  readonly duration: number;
}

// ── الدالة الرئيسية ──────────────────────────────────

const DEFAULTS: InterpolatedProps = Object.freeze({
  opacity: 1, x: 0, y: 0, scale: 1, rotation: 0,
});

export function drawTimelineAt(args: DrawTimelineAtArgs): void {
  const { ctx, size, timeline, brand, template, content, assets, t } = args;

  const state: RenderState = {};
  if (args.headlinePrep) state.headline = args.headlinePrep.bounds;

  const rfArgs: RenderFrameArgs = {
    ctx, size, template, brand, content,
    ...(assets && { assets }),
  };

  const active = resolveAt(timeline, t);

  for (const activeItem of active.items) {
    const item = activeItem.item;
    if (!item.effects || item.effects.length === 0) continue;

    const props =
      item.keyframes && item.keyframes.length > 0
        ? interpolate(item.keyframes, activeItem.localT)
        : DEFAULTS;

    // save واحد لكل عنصر — كل التحويلات تنقض معاً.
    ctx.save();
    // تطبيق props قاعدياً (يطابق legacy: alpha ثم translateY داخل save واحد).
    if (props.opacity !== 1) ctx.globalAlpha = ctx.globalAlpha * props.opacity;
    if (props.x !== 0 || props.y !== 0) ctx.translate(props.x, props.y);

    // تنفيذ المؤثرات بالترتيب — transforms قبل draws.
    for (const effect of item.effects) {
      dispatchEffect(effect, {
        ctx, size, brand, template, content, rfArgs, state,
        headlinePrep: args.headlinePrep,
        t, itemLocalT: activeItem.localT, props,
      });
    }

    ctx.restore();
  }
}

// ── تنفيذ المؤثرات ──────────────────────────────────

interface EffectContext {
  ctx: CanvasDrawContext & CanvasFontContext;
  size: CanvasSize;
  brand: BrandKit;
  template: Template;
  content: Readonly<Record<string, unknown>>;
  rfArgs: RenderFrameArgs;
  state: RenderState;
  headlinePrep: PreparedHeadline | undefined;
  t: number;
  itemLocalT: number;
  props: InterpolatedProps;
}

function dispatchEffect(effect: EffectRef, ectx: EffectContext): void {
  switch (effect.type) {
    case 'template-layer':
      return applyTemplateLayer(effect as TemplateLayerEffect, ectx);
    case 'template-headline':
      return applyTemplateHeadline(effect as TemplateHeadlineEffect, ectx);
    case 'pulse-around-center':
      return applyPulseAroundCenter(effect as PulseEffect, ectx);
    case 'outro-black-overlay':
      return applyOutroOverlay(effect as OutroOverlayEffect, ectx);
    default:
      // مؤثر غير معروف — تجاهل صامت في جلسة 1.
      return;
  }
}

/** طبقة قالب عادية — يُستدعى executeLayer داخل save/restore الحاضن. */
function applyTemplateLayer(effect: TemplateLayerEffect, ectx: EffectContext): void {
  if (ectx.props.opacity <= 0) return;
  const layer = ectx.template.layers[effect.layerIndex];
  if (!layer) return;
  executeLayer(layer, ectx.rfArgs, ectx.state);
}

/**
 * headline — كل سطر بحسابه المستقل. **يطابق @legacy drawHeadlineAnimated
 * بالضبط:**
 *   lineStart = startOffset + i × stagger
 *   إن كان localT < lineStart: تخطَّ السطر
 *   progress = min(1, (localT - lineStart) / fade)
 *   eased = easeOutCubic(progress)
 *   alpha = eased ; dy = slideY × (1 - eased)
 *   ctx.save + globalAlpha × alpha + translate(0, dy) + drawHeadlineLine + restore
 */
function applyTemplateHeadline(
  effect: TemplateHeadlineEffect,
  ectx: EffectContext
): void {
  const prep = ectx.headlinePrep;
  if (!prep) return;
  const easing = getEasingFn('easeOutCubic');
  const { ctx, brand } = ectx;

  for (let i = 0; i < prep.linesJustified.length; i++) {
    const lineStart = effect.startOffset + i * effect.stagger;
    if (ectx.itemLocalT < lineStart) continue;
    const localT = ectx.itemLocalT - lineStart;
    const progress = effect.fade > 0 ? Math.min(1, localT / effect.fade) : 1;
    const eased = easing(progress);
    const alpha = eased;
    const dy = effect.slideY * (1 - eased);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    if (dy !== 0) ctx.translate(0, dy);
    drawHeadlineLine(ctx, brand, prep, i);
    ctx.restore();
  }
}

/**
 * pulse — نبضة scale حول مركز القماش. **transform-only** — يعدّل ctx
 * الحالي (المحاط بالفعل بـsave/restore للعنصر) بلا رسم. المؤثر التالي
 * (template-layer عادةً) يرسم داخل التحويل، ثم item's restore يزيل كل شيء.
 *
 * **يطابق @legacy computeLayerAnim:** scale = 1 + amount × sin(p × π)
 * حيث p = localT/duration ضمن نافذة [0, duration]. خارج النافذة scale=1.
 */
function applyPulseAroundCenter(effect: PulseEffect, ectx: EffectContext): void {
  const local = ectx.itemLocalT - effect.startOffset;
  if (local < 0 || local >= effect.duration) return;
  const p = local / effect.duration;
  const bell = Math.sin(p * Math.PI);
  const scale = 1 + effect.amount * bell;
  if (scale === 1) return;
  const { ctx, size } = ectx;
  ctx.translate(size.w / 2, size.h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size.w / 2, -size.h / 2);
}

/** تراكب أسود بشفافية متزايدة عند نهاية المسار. */
function applyOutroOverlay(effect: OutroOverlayEffect, ectx: EffectContext): void {
  const local = ectx.itemLocalT - effect.startOffset;
  if (local <= 0 || effect.duration <= 0) return;
  const outroAlpha = Math.min(1, local / effect.duration);
  const { ctx, size } = ectx;
  ctx.save();
  ctx.globalAlpha = outroAlpha;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.restore();
}
