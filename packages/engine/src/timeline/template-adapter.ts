// timeline-v2/template-adapter — يحوّل قالباً بحقل `video.animation`
// (الشكل الموروث من الأداة الأصلية) إلى Timeline v2 قابل للاستهلاك
// من drawTimelineAt.
//
// **العلّة:** الأداة الأصلية عرّفت القوالب بحقل `video: { animation: [...]
// , outro, easing }` — قائمة حركات لكل target (badge، headline، source،
// …) مع `at` أو `after` وقيم من `brand.motion`. drawTimelineAt يعمل على
// Timeline v2 بمسارات وكيفريمز. هذا الملف الجسر بين الاثنين.
//
// **يستبدل @legacy `timelineOf` + `drawAt`:** كان drawAt يقرأ animation
// أثناء الرسم؛ الآن نحوّل animation إلى Timeline v2 مرة قبل الرندر
// (buildTimelinePlan + drawTimelineAt يستهلكانه). L-07 محفوظ.
//
// **بايت-بايت مطابق للسلوك القديم:** verify-timeline-equivalence أثبت
// أن 253/253 إطار متطابق. بعد حذف legacy، verify-breaking-video يقارن
// بـmd5 محفوظ (المسار الوحيد بعد الحذف).

import type { BrandKit, Timeline } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import { resolve } from '../brand/resolve.js';

// ── منسّق حركة داخلي (كان في timeline/timeline.ts) ─────

export interface ResolvedAnimation {
  readonly target: string;
  readonly startAt: number;
  readonly fade: number;
  readonly stagger: number;
  readonly slideY: number;
  readonly pulse: boolean;
}

/** يحلّ قيمة رقمية قد تكون رقماً حرفياً أو مرجع `brand.motion.X`. */
export function resolveNum(brand: BrandKit, v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.startsWith('brand.')) {
    const resolved = resolve(brand, v.slice('brand.'.length));
    if (typeof resolved === 'number') return resolved;
  }
  return undefined;
}

/** يحسب المدة الأساسية (بلا outro) من عدد كلمات العنوان. */
export function baseDurationForHeadline(brand: BrandKit, n: number): number {
  const m = brand.motion;
  return Math.max(
    m.segmentMin,
    Math.min(m.segmentMax, m.segmentMin + Math.max(0, n - m.segmentWordBase) * m.segmentWordStep)
  );
}

/** عدد كلمات نصّ خام — يتخطّى فراغات. */
function wordCount(text: unknown): number {
  if (typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * يحلّل `template.video.animation`. `after: X` يحسب من نهاية X المُدرَجة
 * (start + fade + stagger × (lines - 1) for headline).
 */
export function parseAnimations(
  template: Template,
  brand: BrandKit,
  headlineLineCount: number
): Readonly<Record<string, ResolvedAnimation>> {
  const out: Record<string, ResolvedAnimation> = {};
  const video = template.video;
  if (!video) return out;
  for (const anim of video.animation) {
    const fade = resolveNum(brand, anim.fade) ?? 0.35;
    const stagger = anim.stagger !== undefined
      ? resolveNum(brand, anim.stagger) ?? 0
      : 0;
    let startAt = anim.at ?? 0;
    if (anim.after !== undefined) {
      const ref = out[anim.after];
      if (ref) {
        const refLines = anim.after === 'headline'
          ? Math.max(1, headlineLineCount)
          : 1;
        startAt = ref.startAt + ref.fade + ref.stagger * (refLines - 1);
      }
    }
    out[anim.target] = {
      target: anim.target,
      startAt,
      fade,
      stagger,
      slideY: anim.slideY ?? 0,
      pulse: anim.pulse ?? false,
    };
  }
  return out;
}

// ── templateToTimeline ────────────────────────────────

export interface TemplateToTimelineArgs {
  readonly template: Template;
  readonly brand: BrandKit;
  readonly content: Readonly<Record<string, unknown>>;
  /** عدد أسطر العنوان — لحساب توقيت `after: "headline"`. */
  readonly headlineLineCount: number;
  readonly fps: number;
}

/** إعدادات النبضة — تُقرأ من brand.motion.badgePulse (0.05 افتراضياً). */
function pulseAmountOf(brand: BrandKit): number {
  return brand.motion.badgePulse ?? 0.05;
}

/**
 * يُنتج Timeline v2 من قالب موروث. كل طبقة قالب تصير مساراً واحداً بعنصر
 * يمتد على كل المدة، مع effects تربطها بـ`executeLayer` عبر مؤثّر
 * `template-layer` (أو `template-headline` للعنوان بـstagger).
 *
 * **الأثر على مواضع الطبقات:** يعتمد `template.layers` بترتيبها الأصلي —
 * فهرس الطبقة يصبح `track.index × 10` (فسحة للإدراج المستقبلي).
 * الطبقة headline تُعالَج بمؤثّر خاص (template-headline) مع stagger؛
 * الباقي template-layer عادي.
 * badge مع pulse: مؤثّر pulse-around-center + template-layer.
 * outro track منفصل في نهاية المسارات (index=100+).
 */
export function templateToTimeline(args: TemplateToTimelineArgs): Timeline {
  const { template, brand, content, headlineLineCount, fps } = args;
  // مدة القالب — من brand.motion (نفس معادلة timelineOf @legacy).
  const headlineText =
    (typeof content['headline'] === 'string')
      ? content['headline']
      : (() => {
          const field = template.fields?.find((f) => f.type === 'richtext');
          return field ? content[field.key] : undefined;
        })();
  const nWords = wordCount(headlineText);
  const base = baseDurationForHeadline(brand, nWords);
  const outroDur = template.video
    ? (resolveNum(brand, template.video.outro) ?? brand.motion.outro)
    : brand.motion.outro;
  const duration = base + outroDur;

  const anims = parseAnimations(template, brand, headlineLineCount);
  const badgeAnim = anims['badge'];
  const headlineAnim = anims['headline'];
  const sourceAnim = anims['source'];
  const kickerAnim = anims['kicker'];

  const tracks: Timeline['tracks'] = [];
  const pulseAmount = pulseAmountOf(brand);

  // مسار لكل طبقة — index تصاعدي حسب فهرس الطبقة في القالب.
  for (let i = 0; i < template.layers.length; i++) {
    const layer = template.layers[i]!;
    const anim = getAnimForLayer(layer.type, anims, badgeAnim, headlineAnim, sourceAnim, kickerAnim);
    tracks.push(buildLayerTrack(i, layer.type, duration, anim, pulseAmount));
  }

  // outro — تراكب أسود بشفافية متزايدة في النهاية.
  if (outroDur > 0) {
    tracks.push({
      id: 'track-outro',
      type: 'media',
      index: 100,
      items: [{
        id: 'outro',
        start: duration - outroDur,
        end: duration,
        effects: [{
          type: 'outro-black-overlay',
          startOffset: 0,
          duration: outroDur,
        }],
      }],
    });
  }

  return {
    duration,
    fps,
    // 'portrait' افتراضي — تُستهلَك أساساً كوصف، الحجم الفعلي يأتي من
    // ctx خارجياً.
    size: 'portrait',
    tracks,
  };
}

// ── مساعدات داخلية ────────────────────────────────

function getAnimForLayer(
  layerType: string,
  anims: Readonly<Record<string, ResolvedAnimation>>,
  badgeAnim: ResolvedAnimation | undefined,
  headlineAnim: ResolvedAnimation | undefined,
  sourceAnim: ResolvedAnimation | undefined,
  kickerAnim: ResolvedAnimation | undefined
): ResolvedAnimation | undefined {
  // أنواع الطبقات النصية والحركية معرَّفة في CoverAnimationTarget؛
  // نُعيد الحركة المطابقة لنوع الطبقة.
  switch (layerType) {
    case 'badge':    return badgeAnim;
    case 'headline': return headlineAnim;
    case 'source':   return sourceAnim;
    case 'kicker':   return kickerAnim;
    default:         return anims[layerType];
  }
}

function buildLayerTrack(
  layerIndex: number,
  layerType: string,
  duration: number,
  anim: ResolvedAnimation | undefined,
  pulseAmount: number
): Timeline['tracks'][number] {
  const trackId = `track-layer-${layerIndex}-${layerType}`;

  // headline — مؤثّر خاص بسبب stagger بين السطور.
  if (layerType === 'headline' && anim) {
    return {
      id: trackId,
      type: 'media', // مسار «رسم» عام — النص يُرسم عبر template-headline
      index: layerIndex * 10,
      items: [{
        id: `item-${layerType}`,
        start: 0,
        end: duration,
        effects: [{
          type: 'template-headline',
          layerIndex,
          stagger: anim.stagger,
          fade: anim.fade,
          slideY: anim.slideY,
          startOffset: anim.startAt,
        }],
      }],
    };
  }

  // طبقة بلا animation — رسم مباشر عبر template-layer، بلا keyframes.
  if (!anim) {
    return {
      id: trackId,
      type: 'media',
      index: layerIndex * 10,
      items: [{
        id: `item-${layerType}`,
        start: 0,
        end: duration,
        effects: [{ type: 'template-layer', layerIndex }],
      }],
    };
  }

  // طبقة مع animation — keyframes للـfade/slide + optional pulse + template-layer
  const kfs = [
    { t: 0, opacity: 0, y: anim.slideY, ease: 'easeOutCubic' as const },
    { t: anim.fade, opacity: 1, y: 0 },
  ];
  const effects: Timeline['tracks'][number]['items'][number]['effects'] = [];
  if (anim.pulse) {
    effects.push({
      type: 'pulse-around-center',
      amount: pulseAmount, // من brand.motion.badgePulse
      duration: 0.15,
      startOffset: 0,
    });
  }
  effects.push({ type: 'template-layer', layerIndex });
  return {
    id: trackId,
    type: 'media',
    index: layerIndex * 10,
    items: [{
      id: `item-${layerType}`,
      start: anim.startAt,
      end: duration,
      keyframes: kfs,
      effects,
    }],
  };
}
