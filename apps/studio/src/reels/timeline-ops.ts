// timeline-ops — منطقُ التحرير الخالص للريلز (الطبقة أ).
//
// كلُّ دالةٍ هنا تأخذ `Timeline` وتُعيد `Timeline` جديداً تماماً: لا تحويرٌ
// للمدخل، لا مشاركةٌ في المرجع. الأنواعُ كلُّها من `@pf-mediakit/shared`
// (Timeline · Track · TrackItem) — لا إعادةُ تعريفٍ محليّاً، ولا توسيعٌ.
//
// المصدر الوحيد للصحّة: `timeline-ops.test.ts` (٢١ اختباراً).

import type { Timeline, Track, TrackItem } from '@pf-mediakit/shared';

// ── أدوات داخلية ────────────────────────────────────────

/** الحدّ الأدنى للمدّة بعد القصّ — إطارٌ واحد، فلا قطعةٌ معدومة. */
const minDuration = (tl: Timeline): number => 1 / tl.fps;

/** يستبدل مساراً واحداً بنسخةٍ محدَّثة، ويعيد خطّاً زمنيّاً جديداً. */
const replaceTrack = (
  tl: Timeline,
  trackId: string,
  update: (track: Track) => Track,
): Timeline => ({
  ...tl,
  tracks: tl.tracks.map((t) => (t.id === trackId ? update(t) : t)),
});

/** يستبدل عنصراً واحداً داخل مسار، ويعيد مساراً جديداً. */
const replaceItem = (
  track: Track,
  itemId: string,
  next: TrackItem,
): Track => ({
  ...track,
  items: track.items.map((i) => (i.id === itemId ? next : i)),
});

/** يُولّد معرّفاً فريداً داخل المسار لا يتكرّر مع العناصر القائمة. */
const uniqueId = (track: Track, base: string): string => {
  const taken = new Set(track.items.map((i) => i.id));
  let n = 1;
  let candidate = `${base}__split_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base}__split_${n}`;
  }
  return candidate;
};

// ── النقل ────────────────────────────────────────────────

/** يزيح طرفَي العنصر معاً بمقدار `deltaSec` ويحفظ المدّة، مع القصّ عند 0
 *  و`duration` بحيث لا تخرج القطعةُ عن الخطّ الزمني. */
export const moveItem = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  deltaSec: number,
): Timeline => {
  const len = tl.duration;
  return replaceTrack(tl, trackId, (track) => {
    const it = track.items.find((i) => i.id === itemId);
    if (!it) return track;
    const dur = it.end - it.start;
    let start = it.start + deltaSec;
    if (start < 0) start = 0;
    let end = start + dur;
    if (end > len) {
      end = len;
      start = Math.max(0, end - dur);
    }
    return replaceItem(track, itemId, { ...it, start, end });
  });
};

// ── القصّ ────────────────────────────────────────────────

/** يحرّك حافّةً واحدة (start أو end) إلى `newTimeSec` دون أن تعبر أختَها،
 *  مع إبقاء مدّةٍ دنيا موجبة (إطارٌ واحد). */
export const trimItem = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  edge: 'start' | 'end',
  newTimeSec: number,
): Timeline => {
  const min = minDuration(tl);
  const len = tl.duration;
  return replaceTrack(tl, trackId, (track) => {
    const it = track.items.find((i) => i.id === itemId);
    if (!it) return track;
    if (edge === 'start') {
      let s = Math.max(0, newTimeSec);
      const ceiling = it.end - min;
      if (s > ceiling) s = ceiling;
      return replaceItem(track, itemId, { ...it, start: s });
    }
    let e = Math.min(len, newTimeSec);
    const floor = it.start + min;
    if (e < floor) e = floor;
    return replaceItem(track, itemId, { ...it, end: e });
  });
};

// ── الشطر ────────────────────────────────────────────────

/** يشطر عنصراً إلى قطعتين متلاصقتين عند `atSec` بلا فجوةٍ ولا تداخل،
 *  ويحفظ حقول النوع. الشطرُ على حافّةٍ بالضبط لا يُنتج قطعةً صفريّة —
 *  يُرجَع الخطّ كما هو. */
export const splitItem = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  atSec: number,
): Timeline => {
  const min = minDuration(tl);
  return replaceTrack(tl, trackId, (track) => {
    const idx = track.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return track;
    const it = track.items[idx];
    if (it === undefined) return track;
    if (atSec <= it.start + min || atSec >= it.end - min) return track;
    const first: TrackItem = { ...it, end: atSec };
    const secondId = uniqueId(track, it.id);
    const second: TrackItem = { ...it, id: secondId, start: atSec };
    const items = [
      ...track.items.slice(0, idx),
      first,
      second,
      ...track.items.slice(idx + 1),
    ];
    return { ...track, items };
  });
};

// ── الحذف ────────────────────────────────────────────────

/** يحذف عنصراً واحداً. المسارُ يبقى ولو فرغ — لا يُحذف مسارٌ أبداً. */
export const removeItem = (
  tl: Timeline,
  trackId: string,
  itemId: string,
): Timeline =>
  replaceTrack(tl, trackId, (track) => ({
    ...track,
    items: track.items.filter((i) => i.id !== itemId),
  }));

// ── التاريخ ──────────────────────────────────────────────

export interface History {
  readonly present: Timeline;
  readonly past: readonly Timeline[];
  readonly future: readonly Timeline[];
}

/** يُنشئ سجلّاً عند الجذر. */
export const createHistory = (tl: Timeline): History => ({
  present: tl,
  past: [],
  future: [],
});

/** يطبّق عمليّةً ويدفع الحالةَ الحاليّة إلى الماضي، ويمسح مسارَ الإعادة. */
export const apply = (
  h: History,
  fn: (tl: Timeline) => Timeline,
): History => ({
  present: fn(h.present),
  past: [...h.past, h.present],
  future: [],
});

/** يتراجع خطوةً. عند الجذر لا يرمي — يُرجَع السجلّ كما هو. */
export const undo = (h: History): History => {
  if (h.past.length === 0) return h;
  const past = [...h.past];
  const previous = past[past.length - 1];
  if (previous === undefined) return h;
  return {
    present: previous,
    past: past.slice(0, -1),
    future: [h.present, ...h.future],
  };
};

/** يُعيد خطوةً. عند نهاية مسار الإعادة لا يرمي — يُرجَع السجلّ كما هو. */
export const redo = (h: History): History => {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  if (next === undefined) return h;
  const rest = h.future.slice(1);
  return {
    present: next,
    past: [...h.past, h.present],
    future: rest,
  };
};
