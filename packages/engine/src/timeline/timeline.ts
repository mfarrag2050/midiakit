// timeline — نموذج المدة والحركة للفيديو.
//
// **timelineOf(template, brand, content)** يحسب مدة القالب:
//   duration = clamp(n_words, brand.motion.segmentMin..segmentMax)
//   بالمعادلة الأصلية: max(min, min(max, min + max(0, n - base) × step))
//   حيث الثوابت من brand.motion.
//
// **parseAnimations** يحوّل `template.video.animation` إلى خريطة موحّدة
// (بحسب `target`) مع حلّ مراجع brand.* وحساب توقيت `after`. **يتطلّب
// عدد الأسطر** لحساب توقيت `after: "headline"` بدقّة (staggered end).

import type {
  BrandKit,
  Token,
} from '@pf-mediakit/shared';
import type { Template, VideoAnimation } from '@pf-mediakit/templates';
import { resolve } from '../brand/resolve.js';

// ── نموذج الزمن ────────────────────────────────────────

export interface Timeline {
  /** المدة الكلية بالثواني (بما فيها outro). */
  readonly duration: number;
  /** إطارات في الثانية — نطبع 30 كافتراضي طباعي. */
  readonly fps: number;
  /** مدة تلاشي الخروج — تُطرح من `duration` عند رسم fade-out. */
  readonly outro: number;
}

/**
 * يحسب المدة الأساسية (بلا outro) بناءً على عدد كلمات العنوان.
 * الثوابت الأربعة (min, max, base, step) من `brand.motion`.
 */
export function baseDurationForHeadline(brand: BrandKit, n: number): number {
  const m = brand.motion;
  return Math.max(
    m.segmentMin,
    Math.min(m.segmentMax, m.segmentMin + Math.max(0, n - m.segmentWordBase) * m.segmentWordStep)
  );
}

function wordCount(text: unknown): number {
  if (typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * يبني Timeline لقالب. يعتمد `content.headline` (أو أول حقل من نوع
 * headline في `template.fields`) لعدد الكلمات.
 */
export function timelineOf(
  template: Template,
  brand: BrandKit,
  content: Readonly<Record<string, unknown>>,
  fps = 30
): Timeline {
  // نصّ العنوان — نحاول `headline` أولاً، ثم أول حقل headline في fields.
  let headlineText: unknown = content['headline'];
  if (headlineText === undefined && template.fields) {
    const headlineField = template.fields.find((f) => f.type === 'richtext');
    if (headlineField) headlineText = content[headlineField.key];
  }
  const n = wordCount(headlineText);
  const base = baseDurationForHeadline(brand, n);
  const outro = template.video
    ? (resolveNum(brand, template.video.outro) ?? brand.motion.outro)
    : brand.motion.outro;
  return {
    duration: base + outro,
    fps,
    outro,
  };
}

// ── تحريكات الطبقات ────────────────────────────────────

/**
 * حركة مُحلَّلة جاهزة للاستهلاك من drawAt — كل الأرقام مُطلقة (لا مراجع
 * `brand.*`)، وتوقيت `after` مُستَبْدَل بـ`startAt` رقمي.
 */
export interface ResolvedAnimation {
  readonly target: string;
  readonly startAt: number;
  readonly fade: number;
  readonly stagger: number;
  readonly slideY: number;
  readonly pulse: boolean;
}

export function resolveNum(brand: BrandKit, v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.startsWith('brand.')) {
    const resolved = resolve(brand, v.slice('brand.'.length));
    if (typeof resolved === 'number') return resolved;
  }
  return undefined;
}

/**
 * يحلّل `template.video.animation` مع معرفة عدد أسطر العنوان (لحساب
 * توقيت `after: "headline"`).
 */
export function parseAnimations(
  template: Template,
  brand: BrandKit,
  headlineLineCount: number
): Readonly<Record<string, ResolvedAnimation>> {
  const out: Record<string, ResolvedAnimation> = {};
  const video = template.video;
  if (!video) return out;

  // ترتيب المعالجة: كل animation تُعالج حسب ورودها؛ إن رجعت إلى
  // `after: X`، فـX يجب أن يكون قد عولج سابقاً.
  for (const anim of video.animation) {
    const fade = resolveNum(brand, anim.fade) ?? 0.35;
    const stagger = anim.stagger !== undefined
      ? resolveNum(brand, anim.stagger) ?? 0
      : 0;
    let startAt = anim.at ?? 0;
    if (anim.after !== undefined) {
      const ref = out[anim.after];
      if (ref) {
        // اكتمال الطبقة المرجعية = startAt + fade + stagger × (lines-1 for headline, 0 otherwise)
        const refLines = anim.after === 'headline' ? Math.max(1, headlineLineCount) : 1;
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

// ── مساعد للاختبارات ─────────────────────────────────

export function tokensWordCount(tokens: readonly Token[]): number {
  return tokens.filter((t) => !('br' in t)).length;
}
