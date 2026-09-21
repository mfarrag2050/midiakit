// مِحَكُّ الالتصاق ومنع التراكب — **يُكتَب قبل البناء.**
//
// هذه الاختبارات هي العقد. الموديلُ يكتب `timeline-snap.ts` حتّى تخضرّ،
// ولا يعدّل هذا الملفّ. أيُّ تعديلٍ هنا يُرَدّ.
//
// **الحكمُ الحاكم:** المسارُ **تسلسل** لا طبقة. قطعتان في مسارٍ واحدٍ
// لا تتراكبان أبداً. والتراكبُ بين المسارات مسموحٌ ومقصود (نصٌّ فوق صورة).

import { describe, it, expect } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import { snapTime, moveItemSafe, trimItemSafe, wouldOverlap } from './timeline-snap';

const BASE: Timeline = {
  duration: 30,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'tr_media', type: 'media', index: 0,
      items: [
        { id: 'a', start: 0,  end: 8,  src: 'asset:1' },
        { id: 'b', start: 10, end: 16, src: 'asset:2' },
        { id: 'c', start: 20, end: 26, src: 'asset:3' },
      ],
    },
    {
      id: 'tr_text', type: 'text', index: 1,
      items: [{ id: 't', start: 4, end: 12, template: 'lower-third', value: 'عاجل' }],
    },
  ],
};

const it_ = (tl: Timeline, tr: string, id: string) =>
  tl.tracks.find((x) => x.id === tr)!.items.find((i) => i.id === id)!;

// ── الالتصاق ───────────────────────────────────────────

describe('snapTime — يلتصق بأقرب مرساة داخل العتبة', () => {
  it('يلتصق بحافّة جارٍ حين يقترب', () => {
    expect(snapTime(BASE, 'tr_media', 'a', 9.85, { threshold: 0.3, playheadSec: 25 })).toBe(10);
  });

  it('لا يلتصق حين يتجاوز العتبة', () => {
    expect(snapTime(BASE, 'tr_media', 'a', 9.2, { threshold: 0.3, playheadSec: 25 })).toBe(9.2);
  });

  it('يلتصق برأس القراءة', () => {
    expect(snapTime(BASE, 'tr_media', 'a', 17.9, { threshold: 0.3, playheadSec: 18 })).toBe(18);
  });

  it('يلتصق بالصفر وبنهاية الخطّ', () => {
    expect(snapTime(BASE, 'tr_media', 'b', 0.15, { threshold: 0.3, playheadSec: 25 })).toBe(0);
    expect(snapTime(BASE, 'tr_media', 'b', 29.9, { threshold: 0.3, playheadSec: 25 })).toBe(30);
  });

  it('يتجاهل حوافَّ القطعةِ نفسِها — لا تلتصق بذاتها', () => {
    expect(snapTime(BASE, 'tr_media', 'b', 10.05, { threshold: 0.3, playheadSec: 25 })).toBe(10.05);
  });

  it('عند تساوي البُعد يختار الأصغر — نتيجةٌ حتميّة', () => {
    const r1 = snapTime(BASE, 'tr_media', 'a', 9.85, { threshold: 0.3, playheadSec: 25 });
    const r2 = snapTime(BASE, 'tr_media', 'a', 9.85, { threshold: 0.3, playheadSec: 25 });
    expect(r1).toBe(r2);
  });

  it('عتبةُ صفرٍ تُعطّل الالتصاق تماماً', () => {
    expect(snapTime(BASE, 'tr_media', 'a', 9.99, { threshold: 0, playheadSec: 10 })).toBe(9.99);
  });
});

// ── كشف التراكب ────────────────────────────────────────

describe('wouldOverlap', () => {
  it('يكشف التداخل داخل المسار الواحد', () => {
    expect(wouldOverlap(BASE, 'tr_media', 'a', 6, 14)).toBe(true);
  });

  it('التلامسُ عند نقطةٍ ليس تراكباً', () => {
    expect(wouldOverlap(BASE, 'tr_media', 'a', 2, 10)).toBe(false);
  });

  it('لا يعدّ القطعةَ نفسَها تراكباً', () => {
    expect(wouldOverlap(BASE, 'tr_media', 'b', 10, 16)).toBe(false);
  });

  it('لا ينظر إلى المسارات الأخرى', () => {
    expect(wouldOverlap(BASE, 'tr_text', 't', 0, 30)).toBe(false);
  });
});

// ── النقل الآمن ────────────────────────────────────────

describe('moveItemSafe — يقصّ عند الجار ولا يتراكب', () => {
  it('النقلُ الحرّ يمرّ كما هو', () => {
    const r = it_(moveItemSafe(BASE, 'tr_media', 'a', 1), 'tr_media', 'a');
    expect([r.start, r.end]).toEqual([1, 9]);
  });

  it('يقصّ عند حافّة الجار بدل أن يتراكب — والمدّةُ تُحفظ', () => {
    const r = it_(moveItemSafe(BASE, 'tr_media', 'a', 5), 'tr_media', 'a');
    expect(r.end).toBe(10);
    expect(r.end - r.start).toBe(8);
  });

  it('يقصّ عند الصفر', () => {
    const r = it_(moveItemSafe(BASE, 'tr_media', 'b', -20), 'tr_media', 'b');
    expect([r.start, r.end]).toEqual([0, 6]);
  });

  it('لا يُنتج تراكباً مهما كان الإزاحة', () => {
    for (const d of [-100, -7, -0.1, 0.1, 7, 100]) {
      const r = moveItemSafe(BASE, 'tr_media', 'a', d);
      const it = it_(r, 'tr_media', 'a');
      expect(wouldOverlap(r, 'tr_media', 'a', it.start, it.end)).toBe(false);
    }
  });

  it('لا يمسّ المسارات الأخرى', () => {
    const r = moveItemSafe(BASE, 'tr_media', 'a', 5);
    expect(it_(r, 'tr_text', 't')).toEqual(it_(BASE, 'tr_text', 't'));
  });

  it('نقيّ — لا تحوير للمدخل', () => {
    const snap = JSON.stringify(BASE);
    moveItemSafe(BASE, 'tr_media', 'a', 5);
    expect(JSON.stringify(BASE)).toBe(snap);
  });
});

// ── القصّ الآمن ────────────────────────────────────────

describe('trimItemSafe', () => {
  it('لا تعبر الحافّةُ جارَها', () => {
    const r = it_(trimItemSafe(BASE, 'tr_media', 'b', 'end', 25), 'tr_media', 'b');
    expect(r.end).toBeLessThanOrEqual(20);
  });

  it('لا تعبر الحافّةُ أختَها — تبقى مدّةٌ موجبة', () => {
    const r = it_(trimItemSafe(BASE, 'tr_media', 'b', 'start', 99), 'tr_media', 'b');
    expect(r.end - r.start).toBeGreaterThan(0);
  });

  it('نقيّ — كائنٌ جديدٌ دائماً', () => {
    expect(trimItemSafe(BASE, 'tr_media', 'b', 'end', 14)).not.toBe(BASE);
  });
});
