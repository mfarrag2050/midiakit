// timeline-v2/resolve-at — أي عنصر نشط الآن في كل مسار (docs/10 عقد المحرك).
//
// **العقد:** `resolveAt(timeline, t)` تعيد `ActiveState`:
//   • items: كل عنصر نشط عند t (بما فيه العناصر من مسارات مختلفة).
//   • transitions: كل انتقال جارٍ عند t.
//
// **دلالة النشاط:** عنصر نشط إذا `start ≤ t ≤ end`. النهاية شاملة —
// عند `t = item.end` بالضبط، العنصر نشط بـprogress=1. هذا يجنّب فراغات
// عند التوصيل المباشر بين عنصر ينتهي وآخر يبدأ (`prev.end == next.start`).
//
// **الترتيب:** items مرتّبة حسب `track.index` تصاعدياً (0 خلف، الأعلى
// أمام) — يمكن الرسم مباشرة بالترتيب. عناصر داخل نفس المسار عند نفس t
// (تراكب مقصود) تبقى بترتيب `items` كما هي.
//
// **الانتقال:** كل انتقال بين `[prevId, nextId]` مركّز عند حدّ العناصر
// (`prev.end`)، ممتد half-duration في كل اتجاه. progress = 0 عند
// (prev.end - duration/2) و 1 عند (prev.end + duration/2). المستدعي
// يستفيد من الانتقال لخلط عنصرَين في نفس المسار حين وجودهما معاً.
//
// **النقاء:** دالة رياضية. لا حالة، لا مؤقّتات — يمكن استدعاؤها بأيّ
// ترتيب زمني ولأيّ عدد من الأزمنة بلا تأثير جانبي.

import type {
  ActiveItem,
  ActiveState,
  ActiveTransition,
  Timeline,
  Track,
  TrackItem,
} from '@pf-mediakit/shared';

/** يستخرج نسبة تقدّم item عند الزمن العام t. */
function progressOf(item: TrackItem, t: number): number {
  const span = item.end - item.start;
  if (span <= 0) return 0;
  const p = (t - item.start) / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** يبحث في مسار عن العناصر النشطة عند t (start ≤ t ≤ end). */
function activeItemsInTrack(track: Track, t: number): ActiveItem[] {
  const out: ActiveItem[] = [];
  for (const item of track.items) {
    if (t >= item.start && t <= item.end) {
      out.push({
        trackId: track.id,
        item,
        progress: progressOf(item, t),
        localT: t - item.start,
      });
    }
  }
  return out;
}

/**
 * يستخرج الانتقالات الجارية في مسار عند t. الانتقال بين [prev, next]
 * جارٍ إذا كان t داخل النافذة (prev.end - duration/2, prev.end + duration/2).
 * نتخطّى الانتقالات التي لا تجد عنصرَيها.
 */
function activeTransitionsInTrack(track: Track, t: number): ActiveTransition[] {
  if (!track.transitions?.length) return [];
  const byId = new Map<string, TrackItem>();
  for (const item of track.items) byId.set(item.id, item);

  const out: ActiveTransition[] = [];
  for (const tr of track.transitions) {
    const prev = byId.get(tr.between[0]);
    const next = byId.get(tr.between[1]);
    if (!prev || !next) continue;
    // المركز عند حدّ العنصرَين — نستعمل prev.end (يفترض next.start قريبة).
    const half = tr.duration / 2;
    const startAt = prev.end - half;
    const endAt = prev.end + half;
    if (t < startAt || t > endAt) continue;
    const span = endAt - startAt;
    const p = span > 0 ? (t - startAt) / span : 0;
    out.push({
      trackId: track.id,
      transition: tr,
      progress: p < 0 ? 0 : p > 1 ? 1 : p,
    });
  }
  return out;
}

export function resolveAt(timeline: Timeline, t: number): ActiveState {
  // فرز المسارات حسب index تصاعدياً — الرسم يعتمد هذا الترتيب.
  const tracks = [...timeline.tracks].sort((a, b) => a.index - b.index);

  const items: ActiveItem[] = [];
  const transitions: ActiveTransition[] = [];
  for (const track of tracks) {
    for (const ai of activeItemsInTrack(track, t)) items.push(ai);
    for (const at of activeTransitionsInTrack(track, t)) transitions.push(at);
  }
  return { items, transitions };
}
