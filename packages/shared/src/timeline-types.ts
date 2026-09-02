// timeline-types — نموذج بيانات الخط الزمني v2 (docs/10 §نموذج البيانات).
//
// **قرار المالك:** نموذج جديد بمفهوم **المسارات المتوازية** — لا يرث
// timelineOf/segmentMin/segmentMax القديمة. الملف مستقل تماماً، وأي
// ما يرد فيه بمصطلحات جديدة: track, item, keyframe, transition — لا
// «segment» أبداً.
//
// **الفصل:** هذا الملف types-only. لا استيرادات، لا اعتماديات — يوفّر
// شكل البيانات لكل من المحرك (timeline-v2) وأي أداة تحرير مستقبلية.
//
// **مصطلحات مقصودة:**
//   • Timeline    — الجذر: مدة كلية + fps + مقاس + مسارات.
//   • Track       — قناة زمنية مستقلة (وسائط، نص، صوت). تُرسم بترتيب
//                    index تصاعدياً (0 خلف، الأعلى أمام).
//   • TrackItem   — عنصر داخل مسار له start/end على الخط الزمني العام.
//   • Keyframe    — قيمة خاصية عند وقت داخل العنصر (نسبي إلى start).
//   • Transition  — انتقال بين عنصرَين متجاورَين في نفس المسار.
//
// **الملكية:** ملف جديد يخصّ main (docs/11 §ملفات مقفلة لا يذكره).
// timeline-v2 يستهلكه بلا لمس brand-kit أو default-brand.

// ── حجم القماش ─────────────────────────────────────────

export type TimelineSize = 'square' | 'portrait' | 'reel';

// ── دوال التسهيل (docs/10 §دوال التسهيل) ──────────────

/**
 * ثمانية أسماء دوال تسهيل معتمدة في الخط الزمني v2. تختلف عن
 * `EasingName` القديم في `packages/templates` — الجديد يتّبع docs/10
 * حرفياً، والقديم يبقى للتوافق مع مسار @legacy.
 */
export type TimelineEasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutCubic'
  | 'easeOutBack'
  | 'spring'
  | 'step';

// ── المفاتيح المفتاحية ─────────────────────────────────

/**
 * لحظة خاصية داخل عنصر — `t` نسبي إلى بداية العنصر (0 عند start).
 * كل حقل خاصية اختياري؛ ما لم يُذكر يبقى على قيمة المفتاح السابق
 * (أو الافتراضي إن كان الأول).
 *
 * **الافتراضيّات:** opacity=1، x=0، y=0، scale=1، rotation=0.
 *
 * `ease` يطبَّق على الانتقال **من هذا المفتاح إلى التالي**، وليس منه
 * كنقطة نهاية. المفتاح الأخير لا يستعمل `ease` (لا شيء بعده).
 */
export interface Keyframe {
  /** الزمن النسبي بالثواني منذ بداية العنصر. يجب أن يكون تصاعدياً. */
  readonly t: number;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly ease?: TimelineEasingName;
}

// ── الانتقالات ─────────────────────────────────────────

export type TransitionType =
  | 'crossfade'
  | 'slide'
  | 'wipe'
  | 'zoom'
  | 'blurIn';

/**
 * انتقال بين عنصرَين متجاورَين في نفس المسار — يُحسب زمنه من نهاية
 * الأول (`prev.end - duration/2`) إلى بداية الثاني (`next.start +
 * duration/2`). لا انتقال يجاور عنصراً لا يشترك معه في `between`.
 */
export interface Transition {
  readonly between: readonly [string, string];
  readonly type: TransitionType;
  /** بالثواني. */
  readonly duration: number;
}

// ── العنصر داخل المسار ─────────────────────────────────

/** قصّ داخل مصدر وسائط — إحداثيات وحدود مصدر. */
export interface SourceCrop {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * وصف مؤثّر مسجَّل — البيانات فقط، الدالة تحلّها registry في المحرك.
 * `type` يطابق مفتاح registry (kenBurns, crossfade…).
 */
export interface EffectRef {
  readonly type: string;
  readonly [param: string]: unknown;
}

/**
 * عنصر عام داخل مسار — start/end بالثواني على الخط الزمني العام.
 * الحقول الاختيارية تعتمد على نوع المسار الحاضن (media يستعمل src،
 * text يستعمل template+value، audio يستعمل src+gain).
 */
export interface TrackItem {
  readonly id: string;
  /** بداية العنصر على الخط الزمني العام (ثانية). */
  readonly start: number;
  /** نهاية العنصر على الخط الزمني العام (ثانية). */
  readonly end: number;

  // ── حقول media ───────────────────────────
  /** مرجع أصل: `asset:name` أو `clip:id`. */
  readonly src?: string;
  /** بداية القص داخل المصدر (ثانية). */
  readonly trimIn?: number;
  /** نهاية القص داخل المصدر (ثانية). */
  readonly trimOut?: number;
  /** معامل السرعة (1.0 = طبيعي). */
  readonly speed?: number;
  readonly crop?: SourceCrop;

  // ── حقول text ────────────────────────────
  /** معرّف قالب النص — يُحلّ من registry القوالب. */
  readonly template?: string;
  /** النص كما حرّره العميل (docs/09 §التشكيل). */
  readonly value?: string;
  /** نمط اللف — 'uniform' أو 'alternating'. */
  readonly wrap?: 'uniform' | 'alternating';
  /**
   * موضع النص الرأسي على القماش. **لكل عنصر نص موضع خاص** — لا يرث
   * الموضع من طبقة القالب. صيغتان:
   *   • ثابتة: `'top'` (15% من الارتفاع) · `'center'` (50%) · `'bottom'` (85%)
   *   • نسبة: عدد ∈ [0, 1] — مركز الكتلة عند `size.h × ratio`
   * الافتراضي حين لا يُذكَر: 'center' (يُحذّر buildTimelinePlan عند
   * تصادم عناصر بلا موضع صريح).
   */
  readonly anchor?: 'top' | 'center' | 'bottom' | number;
  /**
   * إزاحة إضافية عن نقطة `anchor` بالبكسل. تُطبَّق كـctx.translate
   * فوق أيّ keyframe y-translate. مفيدة للفروق الطفيفة (تحريك سطر إلى
   * الأسفل قليلاً بلا تغيير التصنيف الرأسي).
   */
  readonly offset?: {
    readonly x?: number;
    readonly y?: number;
  };
  /** كشف النص تدريجياً — كلمة/حرف بحرف. */
  readonly reveal?: {
    readonly mode: 'byWord' | 'byChar';
    readonly direction: 'rtl' | 'ltr';
    readonly stagger: number;
  };

  // ── حقول audio ───────────────────────────
  /** كسب الصوت (0..1). */
  readonly gain?: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly loop?: boolean;
  /** خفض تلقائي — عند نشاط target ينخفض كسب هذا العنصر. */
  readonly ducking?: {
    readonly target: string;
    readonly amount: number;
    readonly attack: number;
    readonly release: number;
  };

  // ── مشتركة ───────────────────────────────
  readonly effects?: readonly EffectRef[];
  readonly keyframes?: readonly Keyframe[];
}

// ── المسار ─────────────────────────────────────────────

export type TrackType = 'media' | 'text' | 'audio';

export interface Track {
  readonly id: string;
  readonly type: TrackType;
  /**
   * ترتيب الرسم/الخلط — 0 خلفي، الأعلى أمامي (media/text). للـaudio
   * لا معنى بصرياً لكن يبقى للاتّساق.
   */
  readonly index: number;
  readonly items: readonly TrackItem[];
  readonly transitions?: readonly Transition[];
}

// ── الجذر ─────────────────────────────────────────────

export interface Timeline {
  /** المدة الكلية بالثواني — تشمل outro إن وُجد. */
  readonly duration: number;
  /** إطارات في الثانية. */
  readonly fps: number;
  /** حجم القماش. */
  readonly size: TimelineSize;
  readonly tracks: readonly Track[];
}

// ── حالة نشاط لحظية (مخرج resolveAt) ──────────────────

/**
 * وصف حالة العنصر عند لحظة زمنية — النسبة `progress` هي
 * `(t - start) / (end - start)` مُقصَّة إلى [0, 1].
 */
export interface ActiveItem {
  readonly trackId: string;
  readonly item: TrackItem;
  /** نسبة تقدّم داخل العنصر [0, 1]. */
  readonly progress: number;
  /** زمن نسبي داخل العنصر بالثواني (t - item.start). */
  readonly localT: number;
}

/** انتقال جارٍ عند لحظة — مع نسبة تقدّمه [0, 1]. */
export interface ActiveTransition {
  readonly trackId: string;
  readonly transition: Transition;
  readonly progress: number;
}

export interface ActiveState {
  /** كل العناصر النشطة عند t، مرتّبة حسب track.index تصاعدياً. */
  readonly items: readonly ActiveItem[];
  /** الانتقالات الجارية عند t. */
  readonly transitions: readonly ActiveTransition[];
}

// ── خصائص مُستوفاة من مفاتيح ──────────────────────────

/**
 * نتيجة `interpolate(keyframes, t)` — كل الحقول قيم مُحسمة (لا اختيار).
 * القيم الافتراضية عند غياب مفاتيح: opacity=1, x=0, y=0, scale=1,
 * rotation=0.
 */
export interface InterpolatedProps {
  readonly opacity: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
}
