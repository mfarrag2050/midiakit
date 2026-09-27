// مِحَكُّ القبول لسطح تحرير الريلز — **يُكتَب قبل البناء، لا بعده.**
//
// هذه الاختبارات هي العقد. الموديل المنفّذ يكتب `timeline-ops.ts`
// حتى تخضرّ، ولا يعدّل هذا الملفّ. أيُّ تعديلٍ هنا يُرَدّ.
//
// **لماذا هنا لا في Playwright:** الواجهةُ بلا مِحَكٍّ آليّ، أمّا
// **منطقُ التحرير** فخالصٌ تماماً: يأخذ Timeline ويعيد Timeline.
// فُصل المنطقُ عن الرسم ليكون له مِحَكّ. الرسمُ وحده يُحكَم بالعين.
//
// المصدر الحقيقيّ للأنواع: packages/shared/src/timeline-types.ts
// (Timeline · Track · TrackItem · start/end بالثواني).

import { describe, it, expect } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import {
  moveItem,
  trimItem,
  splitItem,
  removeItem,
  createHistory,
  apply,
  undo,
  redo,
} from './timeline-ops';

const BASE: Timeline = {
  duration: 30,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'tr_media',
      type: 'media',
      index: 0,
      items: [
        { id: 'it_a', start: 0, end: 10, src: 'asset:clip1' },
        { id: 'it_b', start: 12, end: 20, src: 'asset:clip2' },
      ],
    },
    {
      id: 'tr_text',
      type: 'text',
      index: 1,
      items: [
        { id: 'it_t', start: 2, end: 6, template: 'lower-third', value: 'عاجل' },
      ],
    },
  ],
};

const item = (tl: Timeline, trackId: string, itemId: string) =>
  tl.tracks.find((t) => t.id === trackId)!.items.find((i) => i.id === itemId)!;

// ── النقاء ─────────────────────────────────────────────

describe('النقاء — لا تحوير للمدخل', () => {
  it('moveItem لا يمسّ الأصل', () => {
    const snapshot = JSON.stringify(BASE);
    moveItem(BASE, 'tr_media', 'it_a', 3);
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });

  it('كلّ عمليّة تُرجع كائناً جديداً', () => {
    expect(moveItem(BASE, 'tr_media', 'it_a', 1)).not.toBe(BASE);
  });
});

// ── النقل ──────────────────────────────────────────────

describe('moveItem', () => {
  it('يزيح الطرفين معاً ويحفظ المدّة', () => {
    const r = item(moveItem(BASE, 'tr_media', 'it_a', 3), 'tr_media', 'it_a');
    expect(r.start).toBe(3);
    expect(r.end).toBe(13);
  });

  it('يقصّ عند الصفر ولا يُنتج بدايةً سالبة — والمدّة تُحفظ', () => {
    const r = item(moveItem(BASE, 'tr_media', 'it_a', -5), 'tr_media', 'it_a');
    expect(r.start).toBe(0);
    expect(r.end).toBe(10);
  });

  it('يقصّ عند duration ولا يتجاوز نهاية الخطّ', () => {
    const r = item(moveItem(BASE, 'tr_media', 'it_b', 99), 'tr_media', 'it_b');
    expect(r.end).toBe(30);
    expect(r.start).toBe(22);
  });

  it('لا يمسّ عناصر المسارات الأخرى', () => {
    const r = moveItem(BASE, 'tr_media', 'it_a', 3);
    expect(item(r, 'tr_text', 'it_t')).toEqual(item(BASE, 'tr_text', 'it_t'));
  });
});

// ── القصّ ──────────────────────────────────────────────

describe('trimItem', () => {
  it('يحرّك الحافّة اليسرى وحدها', () => {
    const r = item(trimItem(BASE, 'tr_media', 'it_a', 'start', 4), 'tr_media', 'it_a');
    expect(r.start).toBe(4);
    expect(r.end).toBe(10);
  });

  it('يحرّك الحافّة اليمنى وحدها', () => {
    const r = item(trimItem(BASE, 'tr_media', 'it_a', 'end', 7), 'tr_media', 'it_a');
    expect(r.start).toBe(0);
    expect(r.end).toBe(7);
  });

  it('لا تعبر الحافّةُ أختَها — تبقى مدّةٌ دنيا موجبة', () => {
    const r = item(trimItem(BASE, 'tr_media', 'it_a', 'start', 99), 'tr_media', 'it_a');
    expect(r.start).toBeLessThan(r.end);
    expect(r.end - r.start).toBeGreaterThan(0);
  });
});

// ── الشطر ──────────────────────────────────────────────

describe('splitItem', () => {
  it('يشطر إلى قطعتين متلاصقتين بلا فجوة ولا تداخل', () => {
    const tr = splitItem(BASE, 'tr_media', 'it_a', 4)
      .tracks.find((t) => t.id === 'tr_media')!;
    expect(tr.items).toHaveLength(3);
    const [first, second] = tr.items;
    expect(first.end).toBe(4);
    expect(second.start).toBe(4);
  });

  it('تبقى المدّةُ الكلّيّة للقطعتين مساويةً للأصل', () => {
    const tr = splitItem(BASE, 'tr_media', 'it_a', 4)
      .tracks.find((t) => t.id === 'tr_media')!;
    const [a, b] = tr.items;
    expect((a.end - a.start) + (b.end - b.start)).toBe(10);
  });

  it('المعرّفان مختلفان ولا يتكرّر معرّفٌ في المسار', () => {
    const tr = splitItem(BASE, 'tr_media', 'it_a', 4)
      .tracks.find((t) => t.id === 'tr_media')!;
    const ids = tr.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('الشطرُ على حافّةٍ بالضبط لا يُنتج قطعةً صفريّة', () => {
    const tr = splitItem(BASE, 'tr_media', 'it_a', 0)
      .tracks.find((t) => t.id === 'tr_media')!;
    expect(tr.items.every((i) => i.end > i.start)).toBe(true);
  });

  it('الشطرُ يحفظ حقول النوع (text يحفظ value و template)', () => {
    const tr = splitItem(BASE, 'tr_text', 'it_t', 4)
      .tracks.find((t) => t.id === 'tr_text')!;
    expect(tr.items.every((i) => i.value === 'عاجل')).toBe(true);
    expect(tr.items.every((i) => i.template === 'lower-third')).toBe(true);
  });
});

// ── الحذف ──────────────────────────────────────────────

describe('removeItem', () => {
  it('يحذف العنصر المقصود وحده', () => {
    const tr = removeItem(BASE, 'tr_media', 'it_a')
      .tracks.find((t) => t.id === 'tr_media')!;
    expect(tr.items.map((i) => i.id)).toEqual(['it_b']);
  });

  it('لا يترك مساراً مفقوداً حتّى لو فرغ', () => {
    const r = removeItem(BASE, 'tr_text', 'it_t');
    expect(r.tracks.map((t) => t.id)).toEqual(['tr_media', 'tr_text']);
  });
});

// ── التراجع ────────────────────────────────────────────

describe('التاريخ — تراجع وإعادة', () => {
  it('التراجعُ يعيد الحالةَ السابقةَ بعينها', () => {
    let h = createHistory(BASE);
    h = apply(h, (tl) => moveItem(tl, 'tr_media', 'it_a', 3));
    h = undo(h);
    expect(h.present).toEqual(BASE);
  });

  it('ثلاث عمليّاتٍ ثمّ ثلاثُ تراجعاتٍ تعود إلى الأصل', () => {
    let h = createHistory(BASE);
    h = apply(h, (tl) => moveItem(tl, 'tr_media', 'it_a', 3));
    h = apply(h, (tl) => trimItem(tl, 'tr_media', 'it_b', 'end', 18));
    h = apply(h, (tl) => removeItem(tl, 'tr_text', 'it_t'));
    h = undo(undo(undo(h)));
    expect(h.present).toEqual(BASE);
  });

  it('الإعادةُ بعد التراجع تستردّ التغيير', () => {
    let h = createHistory(BASE);
    h = apply(h, (tl) => moveItem(tl, 'tr_media', 'it_a', 3));
    const after = h.present;
    expect(redo(undo(h)).present).toEqual(after);
  });

  it('عمليّةٌ جديدةٌ بعد التراجع تمسح مسارَ الإعادة', () => {
    let h = createHistory(BASE);
    h = apply(h, (tl) => moveItem(tl, 'tr_media', 'it_a', 3));
    h = undo(h);
    h = apply(h, (tl) => moveItem(tl, 'tr_media', 'it_a', 5));
    expect(redo(h).present).toEqual(h.present);
  });

  it('التراجعُ عند الجذر لا يرمي ولا يُفرغ', () => {
    const h = createHistory(BASE);
    expect(undo(h).present).toEqual(BASE);
  });
});
