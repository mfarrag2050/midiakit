// (474 §٣ · 474b) موضعٌ لا يتصادم ولا يتلاصق — عند إضافةِ نصٍّ جديد.
//
// **العلّة (474 §١):** `withDefaultEffects` تُلحقُ مؤثّراً ولا تُلحقُ
// موضعاً، و`mapItemAnchor(undefined)` في المحرّك تُرجعُ المنتصفَ — فكلُّ
// نصَّين متداخلَين زمنيّاً بلا anchor يتراكبان **حتماً**.
//
// **العلّة الثانية (474b):** المحرّكُ يُنذرُ عند `yOverlap > 0` فحسب —
// فصندوقانِ متجاورانِ بفُرجةٍ 36px على قماشةِ 1920 يعطيانِ صفراً
// رياضيّاً صادقاً وكذباً بصريّاً تامّاً: على معاينةِ 270px تصيرُ الفُرجةُ
// خمسةَ بكسلاتٍ لا تُميّزُها العين، وقرأها المالكُ كتلةً واحدة. **التلاصقُ
// ليس سلامة.** فُرجةٌ دنيا صريحة: ≥ نصفِ ارتفاعِ سطرٍ واحدٍ للصندوقِ
// الأكبرِ (`MIN_TEXT_GAP_LINE_RATIO`) — مشتقّةٌ من القياسِ لا رقمٌ
// مبثوث، وارتفاعُ السطرِ دالّةٌ مباشرةٌ لـfontSize (صندوقُ سطرٍ واحدٍ
// يساوي سطرَه). تعريفُ «التصادم» في المحرّك ليس لي (474b: علّةُ التعريفِ
// إلى mediakit) — أمّا بحثي فيرفضُ المتلاصقَ حتّى قبلَ أن يتعلّمَهُ
// المحرّك.
//
// **مكانُ المنطق:** طبقةُ الواجهةِ لا `addItem` نفسُها — التصادمُ بينَ
// المساراتِ وaddItem لا ترى إلّا مساراً واحداً، فلا يُفسدَ نقاءُها.
// الفحصُ عبرَ خطّةٍ كاملةٍ يبنيها المستدعي بالـctx نفسِه الذي يستعملُه
// العرض (prep.bounds لا تُولَدُ إلّا من ctx قياس).
//
// **الترتيب (كما ورد في التذكرة):** 'top' ← 'bottom' ← 'center' ← 0.3
// ← 0.7 — أوّلُ قيمةٍ لا تُصدرُ **تحذيراً جديداً** ولا **تلاصقاً
// جديداً** تُثبَّت. نفدتِ الكلُّ: 'center' والشريطُ التحذيريُّ (472)
// يقولُ — الإخبارُ أشرفُ من التخمين.

import type { Timeline, TrackItem } from '@pf-mediakit/shared';

import { addItem, type AddMode } from './timeline-add';

/** أصغرُ ما يحتاجه الفحصُ من الخطة — تصادماتُ المحرّك كما حسبها
 *  `buildTimelinePlan` (CollisionWarning يوافق بنيويّاً). */
export interface ProbeCollision {
  readonly a: { readonly itemId: string };
  readonly b: { readonly itemId: string };
}

/** صندوقُ نصٍّ واحدٍ كما تحتاجهُ فُرجةُ السلامة — نسبيّاً بعدَ الإزاحة،
 *  مع نافذته الزمنيّة وعددِ سطورِه (لاشتقاقِ ارتفاعِ السطر). */
export interface ProbeTextItem {
  readonly itemId: string;
  readonly start: number;
  readonly end: number;
  readonly top: number;
  readonly bottom: number;
  readonly lines: number;
}

/** نتيجةُ فحصِ خطّةٍ واحدة: تصادماتُ المحرّك + صناديقُ النصوص. */
export interface ProbeFrame {
  readonly collisions: readonly ProbeCollision[];
  readonly texts: readonly ProbeTextItem[];
}

/** يفحصُ خطّةً كاملةً للخطّ الزمنيّ المُعطى — المستدعي (الصفحة/الاختبار)
 *  يزوّدُ ctx وbrand وtemplate. */
export type CollisionProbe = (timeline: Timeline) => ProbeFrame;

/** ترتيبُ المباحثة — ثابتٌ معلنٌ لأنّه قرارُ تصميمٍ لا تفصيل. */
export const ANCHOR_CANDIDATES: readonly NonNullable<TrackItem['anchor']>[] = [
  'top',
  'bottom',
  'center',
  0.3,
  0.7,
];

/** (474b) الفُرجةُ الدنيا بينَ صندوقَين كنسبةٍ من ارتفاعِ سطرٍ واحدٍ
 *  للصندوقِ الأكبر. قِيسَت: فُرجةُ 36px بجوارِ صندوقِ سطرٍ واحدٍ
 *  بارتفاعِ 76px قُرِئتْ كتلةً واحدة (الملك، 474b) — فالنصفُ العتبةُ
 *  الدنيا: أقلُّ من نصفِ سطرٍ = تلاصقٌ بصريّ. ثابتٌ مسمّىً، لا رقمٌ
 *  مبثوث. */
export const MIN_TEXT_GAP_LINE_RATIO = 0.5;

const perLineHeight = (t: ProbeTextItem): number =>
  (t.bottom - t.top) / Math.max(1, t.lines);

/** عتبةُ الفُرجةِ بينَ صندوقَين — من ارتفاعِ سطرِ الصندوقِ الأكبر. */
export const gapThresholdFor = (a: ProbeTextItem, b: ProbeTextItem): number =>
  MIN_TEXT_GAP_LINE_RATIO * Math.max(perLineHeight(a), perLineHeight(b));

/** الفُرجةُ الرأسيّةُ بينَ صندوقَين (سالبٌ = تقاطع). */
const yGap = (a: ProbeTextItem, b: ProbeTextItem): number =>
  Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);

/** هل الزوجُ يتداخلُ زمنيّاً؟ — التلاصقُ لا يُؤثّرُ إلّا في الإطارِ
 *  نفسِه (شرطُ المحرّكِ نفسُه). */
const timeOverlap = (a: ProbeTextItem, b: ProbeTextItem): boolean =>
  Math.min(a.end, b.end) - Math.max(a.start, b.start) > 0;

/** هل التصادمُ «جديدٌ»؟ — زوجٌ فيه القطعةُ الجديدة. القطعةُ الجديدةُ لا
 *  تستطيعُ تغييرَ هندسةِ غيرِها، فكلُّ زوجٍ لا يذكرُها كان قائماً قبلَ
 *  الإضافةِ وليس على عاتقها. */
const isNewCollisionFor = (
  collisions: readonly ProbeCollision[],
  itemId: string,
): boolean =>
  collisions.some((c) => c.a.itemId === itemId || c.b.itemId === itemId);

/** هل للقطعةِ الجديدةِ تلاصقٌ جديدٌ بجارٍ متداخلٍ زمنيّاً؟ (474b) —
 *  فُرجةٌ أقلُّ من العتبة (يشملُ التقاطعَ نفسَه). الجارُ المتلاصقُ
 *  سلفاً مع ثالثٍ ليس على عاتقِ القطعةِ الجديدة. */
const isNewAdjacencyFor = (
  frame: ProbeFrame,
  itemId: string,
): boolean => {
  const self = frame.texts.find((t) => t.itemId === itemId);
  if (!self) return false;
  return frame.texts.some((other) => {
    if (other.itemId === itemId) return false;
    if (!timeOverlap(self, other)) return false;
    return yGap(self, other) < gapThresholdFor(self, other);
  });
};

/** يضيفُ قطعةَ نصٍّ بأوّلِ موضعٍ لا يُصدرُ تحذيراً جديداً ولا تلاصقاً
 *  جديداً. `base` بلا `anchor` — الموضعُ هنا يُقرَّر، والمؤثّرُ
 *  الافتراضيُّ يُلحقُهُ addItem كما كانت (كلُّ مرشَّحٍ يمرُّ عبرَ addItem
 *  نفسِها فلا يُقاسُ شيءٌ لا يُبنى). يعيدُ الخطَّ الزمنيَّ الجديدَ — أو
 *  `present` نفسَهُ إن رُفضَ الإدراجُ (مسارٌ مجهولٌ ونحوُه، حراسةُ
 *  addItem). */
export function addTextItemPlaced(
  present: Timeline,
  trackId: string,
  base: TrackItem,
  probe: CollisionProbe,
  mode: AddMode = 'insert',
): Timeline {
  for (const anchor of ANCHOR_CANDIDATES) {
    const next = addItem(present, trackId, { ...base, anchor }, mode);
    if (next === present) return present; // رُفضَ الإدراجُ — لا موضعَ يُبحَث.
    const frame = probe(next);
    if (
      !isNewCollisionFor(frame.collisions, base.id) &&
      !isNewAdjacencyFor(frame, base.id)
    ) {
      return next;
    }
  }
  // نفدتِ المرشَّحاتُ: المنتصفُ والإنذارُ — لا منع، إخبار (472).
  // (قد يتلاصق: الإخبارُ يشملُ ما لا يراهُ المحرّكُ بعد — 474b.)
  return addItem(present, trackId, { ...base, anchor: 'center' }, mode);
}
