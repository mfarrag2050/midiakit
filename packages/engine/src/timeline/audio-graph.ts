// timeline/audio-graph — buildAudioGraph(timeline, brand) → AudioPlan.
//
// **مبدأ معماري (docs/10 §هـ):** الصوت خطة منفصلة، لا يمرّ بـ
// drawTimelineAt. drawTimelineAt للصورة فقط وتبقى خالصة. AudioPlan
// قيمة قابلة للتسلسل، تُنفَّذ بأداة كل بيئة: WebAudio في المتصفح،
// filter_complex في FFmpeg على الخادم.
//
// **الفصل الحاسم:** خلط الصوت في drawTimelineAt يكسر النقاء الزمني —
// دالة الرسم يجب أن تُعطي نفس مخرج بصري لأيّ ترتيب استدعاء. الصوت
// له حالة داخلية (envelopes، عيّنات، ducking state) لا يمكن أن تكون
// idempotent لكل t.
//
// **النقاء:** buildAudioGraph دالة رياضية — تأخذ Timeline وBrandKit،
// تُعيد AudioPlan خالصة (لا مراجع، لا تواريخ، لا حالة). قابلة للتسلسل
// JSON — يمكن حفظها والاستهلاك من عملية أخرى (renderer job).
//
// **نطاق جلسة الصوت (3.7 §هـ):**
//   ✓ مسارات صوت متعددة (type: 'audio' في Timeline)
//   ✓ لكل عنصر: src, start, end, trimIn, trimOut, gain, loop
//   ✓ fadeIn, fadeOut
//   ✓ ducking بمرجع target track — الخفض التلقائي للموسيقى عند التعليق
//   ✗ الفلاتر المتقدمة (equalizer، pitch shift) — مؤجَّلة
//   ✗ التمويج الحيّ (side-chain متعدد المصادر) — مؤجَّل

import type { BrandKit, Timeline } from '@pf-mediakit/shared';

// ── نموذج الخطة ──────────────────────────────────────

/**
 * تعبير مصدر الصوت — إمّا مرجع أصل (assetKey) أو تعبير مصنوع
 * (synth: sine 220Hz للاختبار بلا ملفات خارجية).
 */
export type AudioSource =
  | { readonly type: 'asset'; readonly key: string }
  | { readonly type: 'synth-sine'; readonly frequency: number; readonly duration: number }
  | { readonly type: 'synth-noise'; readonly color: 'white' | 'pink' | 'brown'; readonly amplitude: number; readonly duration: number };

/**
 * عنصر صوتي داخل مسار — يحمل كل ما يحتاجه FFmpeg (أو WebAudio) لرسم
 * الخط الزمني الصوتي. **بلا حالة** — كل قيمة رقمية نهائية.
 */
export interface AudioItemPlan {
  readonly id: string;
  readonly source: AudioSource;
  /** بداية العنصر على الخط الزمني العام (ثانية). */
  readonly start: number;
  /** نهايته على الخط الزمني العام. */
  readonly end: number;
  /** قصّ داخل المصدر — الافتراضي من بداية المصدر. */
  readonly trimIn?: number;
  readonly trimOut?: number;
  /** كسب الصوت [0, 1]. الافتراضي 1. */
  readonly gain: number;
  /** بالثواني. */
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  /** لتكرار الأصل إن كان أقصر من (end - start). */
  readonly loop?: boolean;
}

/**
 * ducking — مسار A ينخفض حين يعمل مسار B.
 * `targetTrackId`: مسار الموسيقى (الذي سينخفض).
 * `triggerTrackId`: مسار التعليق (الذي يشغّل الخفض).
 * `amount ∈ [0, 1]`: كم ينخفض (0.7 = ينزل بـ70% من كسبه الأصلي).
 * `attack/release` بالثواني — سرعة الخفض/الرجوع.
 */
export interface DuckingRule {
  readonly targetTrackId: string;
  readonly triggerTrackId: string;
  readonly amount: number;
  readonly attack: number;
  readonly release: number;
}

export interface AudioTrackPlan {
  readonly id: string;
  readonly items: readonly AudioItemPlan[];
}

/**
 * الخطة الصوتية الكاملة. **قيمة خالصة** — لا مراجع، لا حالة، قابلة
 * للتسلسل JSON. المستدعي (renderer) يترجمها إلى أوامر filter_complex،
 * (studio في المتصفح) يترجمها إلى WebAudio graph.
 */
export interface AudioPlan {
  /** المدة الكلية — يجب أن تطابق timeline.duration للتزامن الدقيق. */
  readonly duration: number;
  readonly tracks: readonly AudioTrackPlan[];
  readonly duckings: readonly DuckingRule[];
}

// ── الواجهة العامة ────────────────────────────────────

/**
 * يبني AudioPlan من Timeline. **يقرأ فقط مسارات type='audio'** —
 * مسارات media/text تُتجاهل تماماً.
 *
 * **الـducking:** حالياً يُقرأ من `item.ducking` على العنصر. نحوّله
 * إلى DuckingRule على مستوى الخطة لأن ducking بين مسارَين مفهوم أشمل
 * من عنصر واحد.
 *
 * **`brand` غير مستهلك حالياً** — يبقى في التوقيع لتوحيد الشكل مع
 * buildRenderPlan/templateToTimeline، ولاستعمال قيم مستقبلية (default
 * gain للموسيقى مثلاً من brand.audio).
 */
export function buildAudioGraph(
  timeline: Timeline,
  _brand: BrandKit
): AudioPlan {
  const tracks: AudioTrackPlan[] = [];
  const duckings: DuckingRule[] = [];

  for (const track of timeline.tracks) {
    if (track.type !== 'audio') continue;
    const items: AudioItemPlan[] = [];
    for (const item of track.items) {
      const source = resolveSource(item.src);
      if (!source) continue; // عنصر بلا src صالح — يُتجاهل صامتاً
      items.push({
        id: item.id,
        source,
        start: item.start,
        end: item.end,
        ...(item.trimIn !== undefined && { trimIn: item.trimIn }),
        ...(item.trimOut !== undefined && { trimOut: item.trimOut }),
        gain: item.gain ?? 1,
        ...(item.fadeIn !== undefined && { fadeIn: item.fadeIn }),
        ...(item.fadeOut !== undefined && { fadeOut: item.fadeOut }),
        ...(item.loop !== undefined && { loop: item.loop }),
      });

      // ducking على العنصر: item.ducking.target هو معرّف مسار الموسيقى
      // الذي سينخفض عند تنشيط مسار هذا العنصر (المعلّق).
      if (item.ducking) {
        duckings.push({
          targetTrackId: item.ducking.target,
          triggerTrackId: track.id,
          amount: item.ducking.amount,
          attack: item.ducking.attack,
          release: item.ducking.release,
        });
      }
    }
    tracks.push({ id: track.id, items });
  }

  return {
    duration: timeline.duration,
    tracks,
    duckings,
  };
}

// ── مساعدات ──────────────────────────────────────────

/**
 * يحلّ `item.src` النصّي إلى AudioSource. القواعد:
 *   • `asset:<key>` → { type: 'asset', key }
 *   • `synth:sine:<Hz>:<sec>` → { type: 'synth-sine', frequency, duration }
 *   • `synth:noise:<color>:<amp>:<sec>` → { type: 'synth-noise', ... }
 *
 * أيّ صيغة غير معروفة تُعاد null (المستدعي يتجاهل العنصر).
 */
function resolveSource(src: string | undefined): AudioSource | null {
  if (!src) return null;
  if (src.startsWith('asset:')) {
    return { type: 'asset', key: src.slice('asset:'.length) };
  }
  if (src.startsWith('synth:sine:')) {
    // synth:sine:220:8 → 220Hz لمدة 8 ثواني
    const rest = src.slice('synth:sine:'.length).split(':');
    const frequency = parseFloat(rest[0] ?? '440');
    const duration = parseFloat(rest[1] ?? '1');
    if (!Number.isFinite(frequency) || !Number.isFinite(duration)) return null;
    return { type: 'synth-sine', frequency, duration };
  }
  if (src.startsWith('synth:noise:')) {
    // synth:noise:pink:0.3:2 → pink noise بشدة 0.3 لمدة 2s
    const rest = src.slice('synth:noise:'.length).split(':');
    const color = (rest[0] ?? 'pink') as 'white' | 'pink' | 'brown';
    const amplitude = parseFloat(rest[1] ?? '0.3');
    const duration = parseFloat(rest[2] ?? '1');
    if (!Number.isFinite(amplitude) || !Number.isFinite(duration)) return null;
    return { type: 'synth-noise', color, amplitude, duration };
  }
  return null;
}

/** يستخرج قائمة مسارات audio من timeline — مساعد للمستدعي. */
export function collectAudioTracks(
  timeline: Timeline
): readonly { readonly trackId: string; readonly itemCount: number }[] {
  const out: { trackId: string; itemCount: number }[] = [];
  for (const track of timeline.tracks) {
    if (track.type !== 'audio') continue;
    out.push({ trackId: track.id, itemCount: track.items.length });
  }
  return out;
}
