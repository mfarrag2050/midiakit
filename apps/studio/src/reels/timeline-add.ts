// timeline-add — الإنشاءُ الذي كان ناقصاً (reels/467).
//
// الطبقةُ (أ) تكملُ أفعالها: كانت تحرّكُ وتقصَّ وتشطرَ وتحذف، ولا تعرفُ
// أن تُنشئ. هذان الفعلان يغلقان النقص: `addTrack` مساراً و`addItem` قطعة.
//
// القواعدُ الثلاثُ الحاكمة (راجع رأسَ المِحَكّ):
//   (١) المسارُ تسلسل — صفرُ تراكبٍ داخلَ المسار الواحد بعد الإضافة،
//       والتراكبُ بين المسارات مقصود. مَن أراد طبقةً يضيف مساراً.
//   (٢) قطعةٌ بلا مؤثّرٍ غيرُ موجودة — المؤثّرُ الافتراضيُّ يُلحَقُ
//       بنوعِ المسار حين لا يأتي به المستدعي.
//   (٣) الترتيبُ kenBurns قبل draw-media — التحويلُ قبل الرسم
//       (قِيس بالبايت في 466).
//
// `insert`    — تنزلُ عند `start` وتدفعُ ما بعدها في المسار نفسِه وحدَه،
//               وتشطرُ ما تقعُ داخلَه وتدفعُ ذيلَه، وتُطيلُ `duration`.
// `overwrite` — تمحو ما تحتها ولا تُزحزحُ شيئاً ولا تُغيّرُ `duration`.
//
// المصدرُ الوحيدُ للصحّة: `timeline-add.test.ts` (٢٥ اختباراً).

import type {
  EffectRef,
  Timeline,
  Track,
  TrackItem,
  TrackType,
} from '@pf-mediakit/shared';

// ── أدوات داخلية ────────────────────────────────────────

/** يُولّد معرّفاً فريداً للشطر/الفتات لا يصطدم بالقائم ولا بالمولَّد
 *  قبله — القطعةُ المشتقةُ تُنسبُ للفعل الذي أنشأها. */
const deriveId = (taken: Set<string>, base: string): string => {
  let n = 1;
  let candidate = `${base}__add_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base}__add_${n}`;
  }
  taken.add(candidate);
  return candidate;
};

/** معرّفاتُ المسار كلُّها + معرّفُ القطعة الجديدة — لاشتقاقٍ بلا تصادم. */
const takenIds = (track: Track, born: TrackItem): Set<string> =>
  new Set<string>([...track.items.map((i) => i.id), born.id]);

// ── المؤثّرُ الافتراضيّ — الحكمُ الثاني والثالث ──────────

/** يُلحقُ المؤثّرَ الافتراضيَّ بنوعِ المسار حين لا يأتي المستدعي بواحد
 *  (أو يأتي بقائمةٍ فارغة — قطعةٌ بلا مؤثّرٍ غيرُ موجودة). مؤثّراتُ
 *  المستدعي غيرُ الفارغة تُحترَمُ كما هي ولا تُستبدَل.
 *
 * الوسائط: kenBurns ثمّ draw-media — بهذا الترتيب، والرسمُ يستندُ إلى
 * `src` القطعة. النصُّ: text-item-lines. الصوتُ لا يُرسَم فلا مؤثّرَ
 * افتراضيَّ له معروف — يبقى على ما أتاه. */
const withDefaultEffects = (track: Track, item: TrackItem): TrackItem => {
  if (item.effects && item.effects.length > 0) return item;
  if (track.type === 'media') {
    const effects: readonly EffectRef[] = [
      { type: 'kenBurns', from: 1, to: 1.08 },
      { type: 'draw-media', assetKey: item.src },
    ];
    return { ...item, effects };
  }
  if (track.type === 'text') {
    return { ...item, effects: [{ type: 'text-item-lines' }] };
  }
  return item;
};

// ── وضعا الإضافة ────────────────────────────────────────

/** يُفسحُ ولا يمحو: كلُّ قطعةٍ تبدأُ عند `born.start` أو بعده تُدفَعُ
 *  بمقدارِ طولِ المُدرَجة، وما تقعُ `born.start` داخلَه يُشطرُ —
 *  الرأسُ يبقى، والذيلُ يُدفَع. النتيجةُ مرتَّبةٌ بـ`start` فلا
 *  تراكبَ في المسار أبداً. */
const insertItems = (
  track: Track,
  born: TrackItem,
): readonly TrackItem[] => {
  const len = born.end - born.start;
  const taken = takenIds(track, born);
  const sequence: TrackItem[] = [];
  for (const it of track.items) {
    if (it.end <= born.start) {
      sequence.push(it);
    } else if (it.start >= born.start) {
      sequence.push({ ...it, start: it.start + len, end: it.end + len });
    } else {
      sequence.push({ ...it, end: born.start });
      sequence.push({
        ...it,
        id: deriveId(taken, it.id),
        start: born.end,
        end: it.end + len,
      });
    }
  }
  sequence.push(born);
  return sequence.sort((a, b) => a.start - b.start);
};

/** يمحو ولا يُزحزح: ما يقعُ تحتَ المُدرَجة يُمحى من الجيران —
 *  المغطّى تماماً يُحذف، والمغطّى جزئيّاً يبقى منه ما خرجَ عن
 *  المدى (الشطرُ الأيسرُ يحفظُ المعرّف). لا duration ولا مواضعَ
 *  تتبدّل. النتيجةُ مرتَّبةٌ بـ`start`. */
const overwriteItems = (
  track: Track,
  born: TrackItem,
): readonly TrackItem[] => {
  const taken = takenIds(track, born);
  const sequence: TrackItem[] = [];
  for (const it of track.items) {
    const clear = it.end <= born.start || it.start >= born.end;
    const covered = it.start >= born.start && it.end <= born.end;
    if (clear) {
      sequence.push(it);
    } else if (!covered) {
      if (it.start < born.start) {
        sequence.push({ ...it, end: born.start });
      }
      if (it.end > born.end) {
        sequence.push({ ...it, id: deriveId(taken, it.id), start: born.end });
      }
    }
  }
  sequence.push(born);
  return sequence.sort((a, b) => a.start - b.start);
};

// ── الفعلان ─────────────────────────────────────────────

/** مسارٌ جديد: فارغٌ بالنوع المطلوب. بلا موضعٍ يعلو الكلَّ؛ وعند
 *  فهرسٍ يزحزحُ من يساويه أو يعلوه درجةً واحدةً فلا يتكرّ فهرسٌ.
 *  معرّفٌ مكرَّرٌ يُرَدُّ — الخطُّ يعود كما هو. */
export interface NewTrack {
  readonly id: string;
  readonly type: TrackType;
  readonly index?: number;
}

export const addTrack = (tl: Timeline, spec: NewTrack): Timeline => {
  if (tl.tracks.some((t) => t.id === spec.id)) return tl;
  const atIndex = spec.index;
  const index =
    atIndex !== undefined
      ? atIndex
      : Math.max(-1, ...tl.tracks.map((t) => t.index)) + 1;
  const fresh: Track = { id: spec.id, type: spec.type, index, items: [] };
  const tracks =
    atIndex === undefined
      ? [...tl.tracks, fresh]
      : [
          ...tl.tracks.map((t): Track =>
            t.index >= atIndex ? { ...t, index: t.index + 1 } : t,
          ),
          fresh,
        ];
  return { ...tl, tracks };
};

/** قطعةٌ جديدة في مسارٍ قائم. `insert` هو الافتراضيُّ (قرارُ المالك
 *  2026-09-22). الحراسة: مسارٌ مجهولٌ يُرَدّ، ومدّةٌ غيرُ موجبةٍ
 *  تُرَدّ، ومعرّفٌ مكرَّرٌ في المسار يُرَدّ — والخطُّ يعود كما هو.
 *  `insert` تُطيلُ `duration` بمقدارِ المُدرَجة (ولا تسقطَ تحتَ
 *  نهايةِ أقصى قطعة)؛ و`overwrite` لا تمسّها. */
export type AddMode = 'insert' | 'overwrite';

export const addItem = (
  tl: Timeline,
  trackId: string,
  item: TrackItem,
  mode: AddMode = 'insert',
): Timeline => {
  const track = tl.tracks.find((t) => t.id === trackId);
  if (!track) return tl;
  if (item.end <= item.start) return tl;
  if (track.items.some((i) => i.id === item.id)) return tl;
  const born = withDefaultEffects(track, item);
  const items =
    mode === 'insert' ? insertItems(track, born) : overwriteItems(track, born);
  const duration =
    mode === 'insert'
      ? Math.max(tl.duration + (born.end - born.start), ...items.map((i) => i.end))
      : tl.duration;
  return {
    ...tl,
    duration,
    tracks: tl.tracks.map((t) => (t.id === trackId ? { ...t, items } : t)),
  };
};
