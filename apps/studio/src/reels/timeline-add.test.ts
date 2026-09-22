// مِحَكُّ الإضافة — **يُكتَب قبل البناء.**
//
// هذه الاختبارات هي العقد. الموديلُ يكتب `timeline-add.ts` حتّى تخضرّ،
// ولا يعدّل هذا الملفّ. أيُّ تعديلٍ هنا يُرَدّ — أبلغْ ولا تعدّلْ.
//
// ── ثلاثةُ أحكامٍ حاكمة ───────────────────────────────
//
// (١) **المسارُ تسلسل.** قطعتان في مسارٍ واحدٍ لا تتراكبان أبداً —
//     حتّى بعد الإضافة. والتراكبُ بين المسارات مسموحٌ ومقصود.
//     ومَن أراد طبقةً فوق طبقةٍ **يضيف مساراً**، كما في محرّرات
//     المونتاج: V1 وV2 وV3.
//
// (٢) **قطعةٌ بلا مؤثّرٍ غيرُ موجودة.** المؤثّرُ ليس زينةً تُضاف
//     لاحقاً — هو ما يجعل القطعةَ مرئيّة. فـ`addItem` تُلحق المؤثّرَ
//     الافتراضيَّ بنوع المسار حين لا يأتي المستدعي بواحد. قطعةٌ تظهر
//     في الشريط ولا تظهر في المعاينة **محرّرٌ يكذب**.
//
// (٣) **الترتيب: `kenBurns` قبل `draw-media`.** التحويلُ بعد الرسم
//     لا يحوّل شيئاً — قِيس بالبايت في reels/466. فالمؤثّرُ الافتراضيُّ
//     يُبنى بالترتيب الصحيح.
//
// ── الفعلان ──────────────────────────────────────────
// `insert`    — تنزل عند `start`، وتدفع ما بعدها في **المسار نفسِه
//               وحدَه**. لا شيءَ يُمحى. و`duration` يطول.
// `overwrite` — تنزل عند `start` وتمحو ما تحتها. لا شيءَ يتحرّك.
//
// قرارُ المالك (2026-09-22): **`insert` هو الافتراضيّ** في الواجهة.
// والدفعُ في المسار الواحد لا في المسارات كلِّها — البريمير يدفعها
// جميعاً بحكم sync lock، وجمهورُنا محرّرو سوشيال لا مونتيرو أخبار.

import { describe, it, expect } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import { addTrack, addItem } from './timeline-add';

const BASE: Timeline = {
  duration: 30,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'tr_media', type: 'media', index: 0,
      items: [
        { id: 'a', start: 0,  end: 8,  src: 'asset:1',
          effects: [{ type: 'kenBurns', from: 1, to: 1.08 },
                    { type: 'draw-media', assetKey: 'asset:1' }] },
        { id: 'c', start: 20, end: 26, src: 'asset:3',
          effects: [{ type: 'kenBurns', from: 1, to: 1.08 },
                    { type: 'draw-media', assetKey: 'asset:3' }] },
      ],
    },
    {
      id: 'tr_text', type: 'text', index: 1,
      items: [{ id: 't', start: 4, end: 12, value: 'عنوانٌ قائم',
                effects: [{ type: 'text-item-lines' }] }],
    },
  ],
};

const trk = (tl: Timeline, id: string) => tl.tracks.find((x) => x.id === id)!;
const it_ = (tl: Timeline, tr: string, id: string) =>
  trk(tl, tr).items.find((i) => i.id === id)!;
const spans = (tl: Timeline, tr: string) =>
  trk(tl, tr).items.map((i) => [i.start, i.end]);

// ── addTrack ──────────────────────────────────────────

describe('addTrack — مسارٌ جديدٌ من أيِّ نوع', () => {
  it('يضيف مساراً فارغاً بالنوع المطلوب', () => {
    const r = addTrack(BASE, { id: 'tr_text2', type: 'text' });
    expect(r.tracks).toHaveLength(3);
    expect(trk(r, 'tr_text2').type).toBe('text');
    expect(trk(r, 'tr_text2').items).toEqual([]);
  });

  it('مساران من نوعٍ واحدٍ مسموحان — هذه هي الطبقيّة', () => {
    const r = addTrack(addTrack(BASE, { id: 'm2', type: 'media' }),
                       { id: 'm3', type: 'media' });
    expect(r.tracks.filter((t) => t.type === 'media')).toHaveLength(3);
  });

  it('الجديدُ يعلو الكلَّ حين لا يُذكَر موضع', () => {
    const r = addTrack(BASE, { id: 'top', type: 'text' });
    const max = Math.max(...BASE.tracks.map((t) => t.index));
    expect(trk(r, 'top').index).toBeGreaterThan(max);
  });

  it('الإدراجُ عند فهرسٍ يزحزح ما فوقه ولا يترك فهرسَين متساويَين', () => {
    const r = addTrack(BASE, { id: 'mid', type: 'audio', index: 1 });
    expect(trk(r, 'mid').index).toBe(1);
    const idx = r.tracks.map((t) => t.index).sort((x, y) => x - y);
    expect(new Set(idx).size).toBe(idx.length);
    expect(trk(r, 'tr_text').index).toBeGreaterThan(1);
  });

  it('لا يمسّ المساراتِ القائمةَ في محتواها', () => {
    const r = addTrack(BASE, { id: 'x', type: 'audio' });
    expect(trk(r, 'tr_media').items).toEqual(trk(BASE, 'tr_media').items);
  });

  it('نقاءٌ تامّ — المدخلُ لا يُحوَّر', () => {
    const before = JSON.stringify(BASE);
    addTrack(BASE, { id: 'y', type: 'text' });
    expect(JSON.stringify(BASE)).toBe(before);
  });

  it('مُعرِّفٌ مكرَّرٌ يُرَدّ — الخطُّ يعود كما هو', () => {
    expect(addTrack(BASE, { id: 'tr_media', type: 'media' })).toEqual(BASE);
  });
});

// ── addItem · insert ──────────────────────────────────

describe('addItem · insert — يُفسح ولا يمحو', () => {
  it('يدفع ما بعده في المسار نفسِه', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 8, end: 10, src: 'asset:9' }, 'insert');
    expect(spans(r, 'tr_media')).toEqual([[0, 8], [8, 10], [22, 28]]);
  });

  it('يطيل `duration` بمقدار المُدرَج', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 8, end: 10, src: 'asset:9' }, 'insert');
    expect(r.duration).toBe(32);
  });

  it('لا يمسّ المساراتِ الأخرى — لا sync lock', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 8, end: 10, src: 'asset:9' }, 'insert');
    expect(trk(r, 'tr_text').items).toEqual(trk(BASE, 'tr_text').items);
  });

  it('الإدراجُ داخل قطعةٍ يشطرها ويدفع ذيلَها', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 4, end: 6, src: 'asset:9' }, 'insert');
    expect(spans(r, 'tr_media')).toEqual([[0, 4], [4, 6], [6, 10], [22, 28]]);
  });

  it('الإدراجُ في مسارٍ فارغٍ ينزل كما هو', () => {
    const empty = addTrack(BASE, { id: 'e', type: 'text' });
    const r = addItem(empty, 'e',
      { id: 'n', start: 5, end: 9, value: 'نصٌّ جديد' }, 'insert');
    expect(spans(r, 'e')).toEqual([[5, 9]]);
  });

  it('صفرُ تراكبٍ بعد الإدراج مهما كان الموضع', () => {
    for (const s of [0, 3, 8, 19.5, 25, 29]) {
      const r = addItem(BASE, 'tr_media',
        { id: 'n', start: s, end: s + 2, src: 'asset:9' }, 'insert');
      const xs = [...trk(r, 'tr_media').items].sort((p, q) => p.start - q.start);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]!.start).toBeGreaterThanOrEqual(xs[i - 1]!.end);
      }
    }
  });
});

// ── addItem · overwrite ───────────────────────────────

describe('addItem · overwrite — يمحو ولا يُزحزح', () => {
  it('لا يغيّر `duration` ولا مواضعَ الجيران', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 21, end: 23, src: 'asset:9' }, 'overwrite');
    expect(r.duration).toBe(30);
    expect(it_(r, 'tr_media', 'a')).toEqual(it_(BASE, 'tr_media', 'a'));
  });

  it('يقصّ الجارَ الذي يقع تحته جزئيّاً', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 6, end: 9, src: 'asset:9' }, 'overwrite');
    expect(it_(r, 'tr_media', 'a').end).toBe(6);
    expect(spans(r, 'tr_media')).toEqual([[0, 6], [6, 9], [20, 26]]);
  });

  it('يحذف الجارَ الذي يغطّيه تماماً', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 19, end: 27, src: 'asset:9' }, 'overwrite');
    expect(trk(r, 'tr_media').items.find((i) => i.id === 'c')).toBeUndefined();
    expect(spans(r, 'tr_media')).toEqual([[0, 8], [19, 27]]);
  });

  it('صفرُ تراكبٍ بعد الدهس مهما كان الموضع', () => {
    for (const s of [0, 5, 7.5, 19, 24, 27]) {
      const r = addItem(BASE, 'tr_media',
        { id: 'n', start: s, end: s + 3, src: 'asset:9' }, 'overwrite');
      const xs = [...trk(r, 'tr_media').items].sort((p, q) => p.start - q.start);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]!.start).toBeGreaterThanOrEqual(xs[i - 1]!.end);
      }
    }
  });
});

// ── المؤثّرات — الحكمُ الثاني والثالث ──────────────────

describe('المؤثّرُ يُلحَق بنوع المسار', () => {
  it('قطعةُ وسائطٍ تولد بـkenBurns ثمّ draw-media — بهذا الترتيب', () => {
    const r = addItem(BASE, 'tr_media',
      { id: 'n', start: 8, end: 10, src: 'asset:9' }, 'insert');
    const fx = it_(r, 'tr_media', 'n').effects!;
    expect(fx.map((f) => f.type)).toEqual(['kenBurns', 'draw-media']);
    expect((fx[1] as { assetKey: string }).assetKey).toBe('asset:9');
  });

  it('قطعةُ نصٍّ تولد بـtext-item-lines', () => {
    const r = addItem(BASE, 'tr_text',
      { id: 'n', start: 14, end: 18, value: 'نصٌّ جديد' }, 'insert');
    expect(it_(r, 'tr_text', 'n').effects!.map((f) => f.type))
      .toEqual(['text-item-lines']);
  });

  it('مؤثّراتُ المستدعي تُحترَم ولا تُستبدَل', () => {
    const mine = [{ type: 'text-item-typewriter', charStagger: 0.04 }];
    const r = addItem(BASE, 'tr_text',
      { id: 'n', start: 14, end: 18, value: 'ن', effects: mine }, 'insert');
    expect(it_(r, 'tr_text', 'n').effects).toEqual(mine);
  });

  it('لا تُنتَج قطعةٌ بلا مؤثّرٍ أبداً', () => {
    for (const [tr, extra] of [['tr_media', { src: 'asset:9' }],
                               ['tr_text', { value: 'ن' }]] as const) {
      const r = addItem(BASE, tr, { id: 'n', start: 28, end: 29, ...extra },
        'insert');
      expect(it_(r, tr, 'n').effects!.length).toBeGreaterThan(0);
    }
  });
});

// ── الحراسة ───────────────────────────────────────────

describe('الحراسة والنقاء', () => {
  it('مسارٌ مجهولٌ يُرَدّ — الخطُّ يعود كما هو', () => {
    expect(addItem(BASE, 'nope',
      { id: 'n', start: 1, end: 2 }, 'insert')).toEqual(BASE);
  });

  it('مدّةٌ غيرُ موجبةٍ تُرَدّ', () => {
    expect(addItem(BASE, 'tr_media',
      { id: 'n', start: 5, end: 5, src: 'asset:9' }, 'insert')).toEqual(BASE);
  });

  it('مُعرِّفٌ مكرَّرٌ في المسار يُرَدّ', () => {
    expect(addItem(BASE, 'tr_media',
      { id: 'a', start: 28, end: 29, src: 'asset:9' }, 'insert')).toEqual(BASE);
  });

  it('نقاءٌ تامّ في الفعلَين — المدخلُ لا يُحوَّر', () => {
    const before = JSON.stringify(BASE);
    addItem(BASE, 'tr_media', { id: 'n', start: 8, end: 10, src: 'x' }, 'insert');
    addItem(BASE, 'tr_media', { id: 'm', start: 8, end: 10, src: 'x' }, 'overwrite');
    expect(JSON.stringify(BASE)).toBe(before);
  });
});
