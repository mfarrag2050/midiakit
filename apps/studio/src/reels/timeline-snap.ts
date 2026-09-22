// timeline-snap — الالتصاقُ ومنعُ التراكب (reels/459 · صُحِّح في 460 · وُسِّع في 462).
//
// طبقةٌ خالصةٌ ثانية بجانب `timeline-ops`: لا حالة، لا تحويرٌ للمدخل،
// والأنواعُ كلُّها من `@pf-mediakit/shared`. المسارُ تسلسلٌ لا طبقة —
// **الجارُ أسبقُ من الحافّة:** القطعةُ تقفُ عند حافّةِ جارِها لا عند
// الصفر، ولا تعبرُه مهما بلغتِ الإزاحة.
//
// المصدر الوحيد للصحّة: `timeline-snap.test.ts` (٢١ اختباراً).
//
// (462) فوق العقدِ تصديران: `snapMove`/`snapTrim` — التصاقٌ ثمّ الآمن،
// مشتركُ مسارَي الفأرة والأسهم. تركيبٌ مباشرٌ للدوالّ الأربع المُحكَّمة،
// لا منطقَ جديد بجانبها.

import type { Timeline, TrackItem } from '@pf-mediakit/shared';
import { trimItem } from './timeline-ops';

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(v, hi));

// ── الالتصاق ────────────────────────────────────────────

/** خيارات الالتصاق: العتبةُ بالثواني، ورأسُ القراءة الحاليّ. */
export interface SnapOptions {
  readonly threshold: number;
  readonly playheadSec: number;
}

/**
 * يلتصق `t` بأقربِ مرساةٍ لا تتجاوزُها العتبة، وإلّا يُرجَع كما هو.
 *
 * المراسي: حوافُّ الجيران في المسار نفسه (لا حوافُّ القطعةِ نفسِها —
 * لا تلتصقُ بذاتها) · رأسُ القراءة · الصفر · `duration`.
 * عتبةٌ ≤ 0 تُعطّل الالتصاقَ تماماً. وعند تساوي البُعد تُختارُ
 * المرساةُ الأصغر — النتيجةُ حتميّة.
 */
export const snapTime = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  t: number,
  opts: SnapOptions,
): number => {
  const { threshold, playheadSec } = opts;
  if (threshold <= 0) return t;
  const track = tl.tracks.find((tr) => tr.id === trackId);
  const anchors = [0, tl.duration, playheadSec];
  if (track) {
    for (const o of track.items) {
      if (o.id === itemId) continue;
      anchors.push(o.start, o.end);
    }
  }
  anchors.sort((a, b) => a - b);
  let best = t;
  let bestDist = threshold;
  let found = false;
  for (const a of anchors) {
    const d = Math.abs(t - a);
    if (d <= threshold && (!found || d < bestDist)) {
      best = a;
      bestDist = d;
      found = true;
    }
  }
  return best;
};

// ── كشف التراكب ────────────────────────────────────────

/**
 * هل يتراكبُ `[start, end]` مع قطعةٍ أُخرى في المسار نفسه؟
 * التلامسُ عند نقطةٍ ليس تراكباً، والقطعةُ نفسُها لا تُعدّ،
 * والمساراتُ الأخرى لا تُنظَر إليها.
 */
export const wouldOverlap = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  start: number,
  end: number,
): boolean => {
  const track = tl.tracks.find((tr) => tr.id === trackId);
  if (!track) return false;
  return track.items.some(
    (o) => o.id !== itemId && start < o.end && o.start < end,
  );
};

// ── النقل الآمن ──────────────────────────────────────────

/**
 * نقلٌ يحصرُ القطعةَ في فجوتها: الجدارُ الأيسرُ نهايةُ أقربِ جارٍ
 * يساراً (أو الصفرُ حين لا جارَ)، والأيمنُ بدايةُ أقربِ جارٍ يميناً
 * (أو `duration`). القطعةُ لا تعبرُ جداراً مهما بلغتِ الإزاحة —
 * تقفُ عند جارِها لا عند الصفر — والمدّةُ محفوظةٌ دائماً.
 */
export const moveItemSafe = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  deltaSec: number,
): Timeline => {
  const track = tl.tracks.find((tr) => tr.id === trackId);
  const it = track?.items.find((i) => i.id === itemId);
  if (!track || !it) return tl;
  const dur = it.end - it.start;
  let leftWall = 0;
  let rightWall = tl.duration;
  for (const o of track.items) {
    if (o.id === itemId) continue;
    if (o.end <= it.start && o.end > leftWall) leftWall = o.end;
    if (o.start >= it.end && o.start < rightWall) rightWall = o.start;
  }
  const start = clamp(it.start + deltaSec, leftWall, rightWall - dur);
  const items = track.items.map((i): TrackItem =>
    i.id === itemId ? { ...i, start, end: start + dur } : i,
  );
  return {
    ...tl,
    tracks: tl.tracks.map((tr) =>
      tr.id === trackId ? { ...tr, items } : tr,
    ),
  };
};

// ── القصّ الآمن ──────────────────────────────────────────

/**
 * قصُّ حافّةٍ واحدة كما في الطبقة (أ)، ثم سدُّ الجيران: حافّةُ
 * `end` لا تعبرَ بدايةَ الجارِ الأيمن، وحافّةُ `start` لا تعبرَ
 * نهايةَ الجارِ الأيسر — وتبقى مدّةٌ دنيا موجبةٌ دائماً (إطارٌ واحد).
 */
export const trimItemSafe = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  edge: 'start' | 'end',
  newTimeSec: number,
): Timeline => {
  const base = trimItem(tl, trackId, itemId, edge, newTimeSec);
  const track = base.tracks.find((tr) => tr.id === trackId);
  const it = track?.items.find((i) => i.id === itemId);
  if (!track || !it) return base;
  const minDur = 1 / base.fps;
  const items = track.items;
  if (edge === 'end') {
    let wall = base.duration;
    for (const o of items) {
      if (o.id === itemId) continue;
      if (o.start >= it.start && o.start < wall) wall = o.start;
    }
    const end = Math.max(Math.min(it.end, wall), it.start + minDur);
    if (end === it.end) return base;
    const nextItems = items.map((i): TrackItem =>
      i.id === itemId ? { ...i, end } : i,
    );
    return {
      ...base,
      tracks: base.tracks.map((tr) =>
        tr.id === trackId ? { ...tr, items: nextItems } : tr,
      ),
    };
  }
  let wall = 0;
  for (const o of items) {
    if (o.id === itemId) continue;
    if (o.end <= it.end && o.end > wall) wall = o.end;
  }
  const start = Math.min(Math.max(it.start, wall), it.end - minDur);
  if (start === it.start) return base;
  const nextItems = items.map((i): TrackItem =>
    i.id === itemId ? { ...i, start } : i,
  );
  return {
    ...base,
    tracks: base.tracks.map((tr) =>
      tr.id === trackId ? { ...tr, items: nextItems } : tr,
    ),
  };
};

// ── التصاقٌ ثمّ الآمن — مشتركُ الفأرة واللوحة (462) ──────

/** نتيجةُ التصاقٍ ثمّ عمليةٍ آمنة: الخطُّ الجديد + المرساةُ إن وقع. */
export interface SnapResult {
  readonly timeline: Timeline;
  /** المرساةُ التي حُرِّف الالتصاقُ القيمةَ إليها — وإلا null. */
  readonly anchor: number | null;
}

/** التصاقٌ ثمّ النقلُ الآمن. الحدّان يُجرَّبان وتفوز أقربُ مرساة —
 *  الالتصاقُ بالجار من الجهتين لا بالبداية وحدها. `thresholdSec`
 *  عتبةُ snapTime نفسها: و0 تُعطّل الالتصاقَ فتمرُّ القيمةُ خاماً. */
export const snapMove = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  deltaSec: number,
  thresholdSec: number,
  playheadSec: number,
): SnapResult => {
  const it = tl.tracks
    .find((tr) => tr.id === trackId)
    ?.items.find((i) => i.id === itemId);
  if (!it) return { timeline: tl, anchor: null };
  const snap = (raw: number): number =>
    snapTime(tl, trackId, itemId, raw, {
      threshold: thresholdSec,
      playheadSec,
    });
  const dur = it.end - it.start;
  const rawStart = it.start + deltaSec;
  const rawEnd = it.end + deltaSec;
  const sn = snap(rawStart);
  const en = snap(rawEnd);
  const dStart = sn !== rawStart ? Math.abs(sn - rawStart) : Infinity;
  const dEnd = en !== rawEnd ? Math.abs(en - rawEnd) : Infinity;
  const useEnd = dEnd < dStart;
  const anchor = useEnd ? en : sn;
  const start = useEnd ? en - dur : sn;
  const raw = useEnd ? rawEnd : rawStart;
  return {
    timeline: moveItemSafe(tl, trackId, itemId, start - it.start),
    anchor: anchor !== raw ? anchor : null,
  };
};

/** التصاقٌ ثمّ القصُّ الآمن — حافّةٌ واحدة إلى الزمن المقترَح.
 *  `thresholdSec` عتبةُ snapTime نفسها: و0 تُعطّل الالتصاقَ. */
export const snapTrim = (
  tl: Timeline,
  trackId: string,
  itemId: string,
  edge: 'start' | 'end',
  newTimeSec: number,
  thresholdSec: number,
  playheadSec: number,
): SnapResult => {
  const t = snapTime(tl, trackId, itemId, newTimeSec, {
    threshold: thresholdSec,
    playheadSec,
  });
  return {
    timeline: trimItemSafe(tl, trackId, itemId, edge, t),
    anchor: t !== newTimeSec ? t : null,
  };
};
