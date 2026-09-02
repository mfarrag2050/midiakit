// اختبارات timeline-v2 — النواة الزمنية (resolveAt + interpolate +
// duration + easing). لا اختبار للرسم هنا — بوابة التكافؤ (script)
// تفحص drawTimelineAt.

import { describe, expect, it } from 'vitest';
import type {
  Keyframe,
  Timeline,
  Track,
  TrackItem,
} from '@pf-mediakit/shared';

import { ease, isTimelineEasingName } from './easing.js';
import { interpolate } from './interpolate.js';
import { resolveAt } from './resolve-at.js';
import { timelineDuration, timelineMaxItemEnd } from './duration.js';

// ── مساعد بناء ─────────────────────────────────────

const item = (over: Partial<TrackItem>): TrackItem => ({
  id: over.id ?? 'x',
  start: over.start ?? 0,
  end: over.end ?? 1,
  ...over,
});

const track = (over: Partial<Track>): Track => ({
  id: over.id ?? 't',
  type: over.type ?? 'media',
  index: over.index ?? 0,
  items: over.items ?? [],
  ...(over.transitions !== undefined && { transitions: over.transitions }),
});

const tl = (tracks: readonly Track[], duration = 10): Timeline => ({
  duration,
  fps: 30,
  size: 'reel',
  tracks,
});

// ── easing ─────────────────────────────────────────

describe('easing — الدوال الثمانية', () => {
  it('كل الأسماء الثمانية متاحة وقابلة للتحقق', () => {
    const names = [
      'linear', 'easeIn', 'easeOut', 'easeInOut',
      'easeOutCubic', 'easeOutBack', 'spring', 'step',
    ];
    for (const n of names) expect(isTimelineEasingName(n)).toBe(true);
    expect(isTimelineEasingName('unknown')).toBe(false);
  });

  it('linear يعطي الهوية', () => {
    expect(ease('linear', 0)).toBe(0);
    expect(ease('linear', 0.5)).toBe(0.5);
    expect(ease('linear', 1)).toBe(1);
  });

  it('easeOutCubic: 0→0، 1→1، منتصف > 0.5', () => {
    expect(ease('easeOutCubic', 0)).toBe(0);
    expect(ease('easeOutCubic', 1)).toBe(1);
    expect(ease('easeOutCubic', 0.5)).toBeGreaterThan(0.5);
  });

  it('step قفزة عند 0.5', () => {
    expect(ease('step', 0.49)).toBe(0);
    expect(ease('step', 0.5)).toBe(1);
    expect(ease('step', 0.51)).toBe(1);
  });

  it('t يُقصَّ إلى [0, 1]', () => {
    expect(ease('linear', -1)).toBe(0);
    expect(ease('linear', 2)).toBe(1);
  });
});

// ── interpolate ────────────────────────────────────

describe('interpolate — الحالات الحدّية', () => {
  it('0 مفاتيح → افتراضيات', () => {
    const r = interpolate([], 0.5);
    expect(r).toEqual({ opacity: 1, x: 0, y: 0, scale: 1, rotation: 0 });
  });

  it('مفتاح واحد → قيمه للجميع', () => {
    const kfs: Keyframe[] = [{ t: 0, opacity: 0.3, y: 10 }];
    // t قبل، عند، بعد كلها تعطي نفس القيمة (مفتاح مصلّب)
    for (const t of [-1, 0, 5]) {
      const r = interpolate(kfs, t);
      expect(r.opacity).toBe(0.3);
      expect(r.y).toBe(10);
      expect(r.x).toBe(0); // افتراضي
    }
  });

  it('استيفاء خطي بين مفتاحين — linear', () => {
    const kfs: Keyframe[] = [
      { t: 0, opacity: 0, ease: 'linear' },
      { t: 1, opacity: 1 },
    ];
    expect(interpolate(kfs, 0)).toMatchObject({ opacity: 0 });
    expect(interpolate(kfs, 0.5)).toMatchObject({ opacity: 0.5 });
    expect(interpolate(kfs, 1)).toMatchObject({ opacity: 1 });
  });

  it('استيفاء easeOutCubic — منتصف > خطي', () => {
    const kfs: Keyframe[] = [
      { t: 0, opacity: 0, ease: 'easeOutCubic' },
      { t: 1, opacity: 1 },
    ];
    const midEased = interpolate(kfs, 0.5).opacity;
    expect(midEased).toBeGreaterThan(0.5); // ease-out يتقدّم أسرع
    expect(midEased).toBeLessThan(1);
  });

  it('اقتصاص خارج مدى المفاتيح', () => {
    const kfs: Keyframe[] = [
      { t: 1, opacity: 0.2 },
      { t: 2, opacity: 0.8 },
    ];
    expect(interpolate(kfs, 0).opacity).toBe(0.2); // قبل الأول = الأول
    expect(interpolate(kfs, 5).opacity).toBe(0.8); // بعد الأخير = الأخير
  });

  it('وراثة قيمة غير مذكورة من مفتاح سابق', () => {
    // opacity في المفتاح 1، y فقط في المفتاح 2.
    const kfs: Keyframe[] = [
      { t: 0, opacity: 0.5, y: 20 },
      { t: 1, y: 0 }, // opacity غير مذكورة → تبقى 0.5
    ];
    const r = interpolate(kfs, 0.5);
    expect(r.opacity).toBe(0.5); // مورَّثة
    expect(r.y).toBe(10);        // نصف الطريق من 20 إلى 0
  });

  it('استيفاء عدة خصائص متزامنة على نفس ease', () => {
    const kfs: Keyframe[] = [
      { t: 0, opacity: 0, y: 26, ease: 'easeOutCubic' },
      { t: 0.42, opacity: 1, y: 0 },
    ];
    const r = interpolate(kfs, 0.21); // منتصف الجيب
    // كلاهما eased بنفس النسبة
    const easeMid = ease('easeOutCubic', 0.5);
    expect(r.opacity).toBeCloseTo(easeMid, 5);
    expect(r.y).toBeCloseTo(26 * (1 - easeMid), 5);
  });
});

// ── resolveAt ──────────────────────────────────────

describe('resolveAt — الحدود والمسارات المتوازية', () => {
  it('t = item.start ⇒ نشط بـprogress = 0', () => {
    const t = tl([track({ items: [item({ start: 1, end: 5 })] })]);
    const s = resolveAt(t, 1);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.progress).toBe(0);
    expect(s.items[0]!.localT).toBe(0);
  });

  it('t = item.end ⇒ نشط بـprogress = 1 (شامل)', () => {
    const t = tl([track({ items: [item({ start: 1, end: 5 })] })]);
    const s = resolveAt(t, 5);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.progress).toBe(1);
    expect(s.items[0]!.localT).toBe(4);
  });

  it('بين start وend ⇒ progress نسبي', () => {
    const t = tl([track({ items: [item({ start: 2, end: 4 })] })]);
    const s = resolveAt(t, 3);
    expect(s.items[0]!.progress).toBe(0.5);
  });

  it('خارج المدى ⇒ صفر عناصر نشطة', () => {
    const t = tl([track({ items: [item({ start: 1, end: 5 })] })]);
    expect(resolveAt(t, 0.5).items).toHaveLength(0);
    expect(resolveAt(t, 5.1).items).toHaveLength(0);
  });

  it('مسارات متوازية: نص فوق وسائط، كلاهما نشط عند t واحد', () => {
    const t = tl([
      track({
        id: 'media', type: 'media', index: 0,
        items: [item({ id: 'bg', start: 0, end: 10 })],
      }),
      track({
        id: 'text', type: 'text', index: 10,
        items: [item({ id: 'headline', start: 0, end: 6 })],
      }),
    ]);
    const s = resolveAt(t, 3);
    expect(s.items).toHaveLength(2);
    // بترتيب index تصاعدياً: media أولاً (خلف)، ثم text (أمام)
    expect(s.items[0]!.trackId).toBe('media');
    expect(s.items[1]!.trackId).toBe('text');
  });

  it('توصيل مباشر: item ينتهي وآخر يبدأ عند نفس t ⇒ كلاهما نشط', () => {
    const t = tl([
      track({
        items: [
          item({ id: 'a', start: 0, end: 3 }),
          item({ id: 'b', start: 3, end: 6 }),
        ],
      }),
    ]);
    const s = resolveAt(t, 3);
    expect(s.items.map((i) => i.item.id).sort()).toEqual(['a', 'b']);
  });

  it('انتقال crossfade عند حدّ العنصرَين', () => {
    const t = tl([
      track({
        items: [
          item({ id: 'a', start: 0, end: 3 }),
          item({ id: 'b', start: 3, end: 6 }),
        ],
        transitions: [
          { between: ['a', 'b'], type: 'crossfade', duration: 0.6 },
        ],
      }),
    ]);
    // مركز الانتقال عند t=3 (prev.end)
    const s = resolveAt(t, 3);
    expect(s.transitions).toHaveLength(1);
    expect(s.transitions[0]!.progress).toBeCloseTo(0.5, 5);
    // خارج نافذة الانتقال
    expect(resolveAt(t, 2.5).transitions).toHaveLength(0);
    expect(resolveAt(t, 3.5).transitions).toHaveLength(0);
  });
});

// ── duration ───────────────────────────────────────

describe('timelineDuration — قيمة معلنة، ليست مشتقّة', () => {
  it('يعيد timeline.duration كما هو', () => {
    const t = tl([track({})], 12.5);
    expect(timelineDuration(t)).toBe(12.5);
  });

  it('timelineMaxItemEnd يعيد أقصى نهاية عبر المسارات', () => {
    const t = tl([
      track({ id: 'a', items: [item({ end: 5 })] }),
      track({ id: 'b', items: [item({ end: 8 })] }),
      track({ id: 'c', items: [item({ end: 3 })] }),
    ], 10);
    expect(timelineMaxItemEnd(t)).toBe(8);
  });
});

// ── نقاء زمني: ترتيب عشوائي = متسلسل ─────────────

describe('نقاء زمني — resolveAt(t) لا يعتمد على استدعاءات سابقة', () => {
  const t = tl([
    track({ items: [item({ id: 'a', start: 0, end: 5 })] }),
    track({ id: 't2', index: 10, type: 'text', items: [item({ id: 'b', start: 2, end: 7 })] }),
  ], 10);

  it('نفس الزمن يعطي نفس النتيجة بغضّ النظر عن ترتيب الاستدعاءات', () => {
    const sequential = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => resolveAt(t, v));
    const shuffled = [7, 0, 5, 3, 6, 1, 2, 4].map((v) => resolveAt(t, v));
    // نجمع {t → snapshot} من كلا الاتجاهين ونطابقهما
    const snap = (arr: ReturnType<typeof resolveAt>[]): string =>
      arr.map((s) => JSON.stringify({
        n: s.items.length,
        ids: s.items.map((i) => i.item.id).sort(),
        progs: s.items.map((i) => i.progress).sort(),
      })).join('|');
    const seqOrdered = [0,1,2,3,4,5,6,7].map((v) => sequential[v]!);
    const shufOrdered = [7,0,5,3,6,1,2,4].map((v, idx) => shuffled[idx]!);
    // نبني map من t إلى نتيجة، ونقارن حسب t
    const seqMap = new Map([0,1,2,3,4,5,6,7].map((tv, i) => [tv, seqOrdered[i]!] as const));
    const shufMap = new Map([7,0,5,3,6,1,2,4].map((tv, i) => [tv, shufOrdered[i]!] as const));
    for (const tv of [0,1,2,3,4,5,6,7]) {
      expect(snap([seqMap.get(tv)!])).toBe(snap([shufMap.get(tv)!]));
    }
  });

  it('interpolate لا يعتمد على استدعاءات سابقة', () => {
    const kfs: Keyframe[] = [
      { t: 0, opacity: 0, y: 20, ease: 'easeOutCubic' },
      { t: 1, opacity: 1, y: 0 },
    ];
    const a = interpolate(kfs, 0.3);
    interpolate(kfs, 0.9); // نداء أوسط لا يجب أن يترك أثراً
    interpolate(kfs, 0.1);
    const b = interpolate(kfs, 0.3);
    expect(a).toEqual(b);
  });
});

// ── buildTimelinePlan — تحضير النصوص مسبقاً (L-07) ──

import { buildTimelinePlan, collectTextItems } from './plan.js';
import { BREAKING } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '../brand/resolve.js';
import { createSyntheticMeasurer } from './../text/measurer.js';

describe('buildTimelinePlan — تحضير عناصر text مسبقاً', () => {
  const brand = resolveBrand(DEFAULT_BRAND);
  // ctx وهمي يكفي لـprepareHeadline على مقاس ثابت — تفادينا skia-canvas
  // في اختبارات vitest، نستخدم واجهة اصطناعية.
  const mockCtx = {
    font: '',
    measureText: (s: string) => ({
      width: s.length * 10,
      actualBoundingBoxAscent: 30,
      actualBoundingBoxDescent: 10,
    }),
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
    fillRect: () => {}, fillText: () => {}, drawImage: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {}, arc: () => {}, arcTo: () => {},
    clip: () => {}, rect: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
    globalAlpha: 1, fillStyle: '', strokeStyle: '',
    textAlign: 'right' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'rtl' as CanvasDirection,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high' as ImageSmoothingQuality,
  };

  it('عنصر text بلا value ⇒ لا تحضير', () => {
    const timeline = tl([
      track({ type: 'text', items: [item({ id: 'empty' })] }),
    ]);
    const plan = buildTimelinePlan({
      timeline, brand,
      template: BREAKING,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx: mockCtx as any,
      size: { w: 1080, h: 1350 },
    });
    expect(plan.textPreps.size).toBe(0);
  });

  it('عنصر text بـvalue ⇒ prep موجود في الخريطة بمفتاح trackId:itemId', () => {
    const timeline = tl([
      track({
        id: 'txt', type: 'text',
        items: [item({ id: 'h1', value: 'عنوان قصير للاختبار' })],
      }),
    ]);
    const plan = buildTimelinePlan({
      timeline, brand,
      template: BREAKING,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx: mockCtx as any,
      size: { w: 1080, h: 1350 },
    });
    expect(plan.textPreps.has('txt:h1')).toBe(true);
    const p = plan.textPreps.get('txt:h1')!;
    expect(p.trackId).toBe('txt');
    expect(p.itemId).toBe('h1');
    expect(p.prep.linesJustified.length).toBeGreaterThan(0);
  });

  it('collectTextItems يعيد كل عناصر text عبر المسارات', () => {
    const timeline = tl([
      track({ id: 'm', type: 'media', items: [item({ id: 'bg' })] }),
      track({ id: 't1', type: 'text', items: [item({ id: 'a' }), item({ id: 'b' })] }),
      track({ id: 't2', type: 'text', items: [item({ id: 'c' })] }),
    ]);
    const items = collectTextItems(timeline);
    expect(items).toHaveLength(3);
    expect(items.map((i) => `${i.trackId}:${i.item.id}`)).toEqual(['t1:a', 't1:b', 't2:c']);
  });
});
