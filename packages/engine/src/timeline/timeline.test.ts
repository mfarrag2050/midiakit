// timeline.test — تأكيدان أساسيان:
//   (١) `timelineOf` يطبّق معادلة المدة الصحيحة من brand.motion.
//   (٢) **`drawAt` خالصة** — استدعاؤها بترتيب عشوائي يعطي نفس نتائج
//       الاستدعاء المتسلسل. أي فرق = تسرّب حالة بين الإطارات.
//
// **الطريقة:** نستعمل `createMockCtx` الذي يسجّل كل عملية رسم. لكل t،
// نسجّل كل الـops، ثم نقارن.

import { describe, it, expect } from 'vitest';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import { createMockCtx } from '../text/mock-ctx.js';
import { resolveBrand } from '../brand/resolve.js';
import { drawAt, type DrawAtArgs } from './draw-at.js';
import { timelineOf, baseDurationForHeadline, parseAnimations } from './timeline.js';

const SIZE = { w: 1080, h: 1350 };

const brand = resolveBrand(DEFAULT_BRAND);

const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};

function renderAtT(t: number): unknown[] {
  const ctx = createMockCtx();
  const args: DrawAtArgs = {
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: CONTENT,
    t,
  };
  drawAt(args);
  // نُعيد نسخة عميقة من الـops (بسيطة عبر JSON — كل الحقول primitives).
  // النسخ يمنع أي حالة داخلية من التسرّب بين المقارنات.
  return JSON.parse(JSON.stringify(ctx.ops));
}

// ── timelineOf ───────────────────────────────────────

describe('timelineOf', () => {
  it('يحسب المدة الأساسية من brand.motion لعدد الكلمات', () => {
    // brand.motion: segmentMin=7, segmentMax=10, segmentWordBase=8, segmentWordStep=0.3
    // n=8 ⇒ max(7, min(10, 7 + max(0, 0) × 0.3)) = 7
    expect(baseDurationForHeadline(brand, 8)).toBeCloseTo(7, 5);
    // n=13 ⇒ max(7, min(10, 7 + 5 × 0.3)) = max(7, min(10, 8.5)) = 8.5
    expect(baseDurationForHeadline(brand, 13)).toBeCloseTo(8.5, 5);
    // n=20 ⇒ max(7, min(10, 7 + 12 × 0.3)) = max(7, min(10, 10.6)) = 10
    expect(baseDurationForHeadline(brand, 20)).toBeCloseTo(10, 5);
    // n=5 ⇒ max(7, min(10, 7 + 0)) = 7 (لا ينزل تحت min)
    expect(baseDurationForHeadline(brand, 5)).toBeCloseTo(7, 5);
  });

  it('timelineOf يضيف outro إلى المدة الأساسية ويحمل fps', () => {
    const tl = timelineOf(BREAKING, brand, CONTENT);
    // CONTENT.headline = 11 كلمة
    // base = 7 + max(0, 11-8) × 0.3 = 7 + 0.9 = 7.9
    // duration = 7.9 + brand.motion.outro (0.5) = 8.4
    expect(tl.duration).toBeCloseTo(7.9 + brand.motion.outro, 5);
    expect(tl.fps).toBe(30);
    expect(tl.outro).toBe(brand.motion.outro);
  });
});

// ── parseAnimations ──────────────────────────────────

describe('parseAnimations — breaking video', () => {
  it('يحلّ مراجع brand.* في fade و stagger', () => {
    const anims = parseAnimations(BREAKING, brand, 3);
    expect(anims['badge']?.fade).toBe(0.35);
    expect(anims['badge']?.pulse).toBe(true);
    expect(anims['headline']?.fade).toBe(brand.motion.lineFade); // 0.42
    expect(anims['headline']?.stagger).toBe(brand.motion.lineStagger); // 0.12
    expect(anims['headline']?.slideY).toBe(26);
  });

  it("توقيت `after: 'headline'` يعتمد عدد الأسطر", () => {
    const a2 = parseAnimations(BREAKING, brand, 2);
    const a3 = parseAnimations(BREAKING, brand, 3);
    // source.startAt = headline.startAt (0.30) + fade (0.42) + stagger × (lines-1)
    // 2 lines: 0.30 + 0.42 + 0.12 × 1 = 0.84
    // 3 lines: 0.30 + 0.42 + 0.12 × 2 = 0.96
    expect(a2['source']?.startAt).toBeCloseTo(0.84, 5);
    expect(a3['source']?.startAt).toBeCloseTo(0.96, 5);
  });
});

// ── النقاء الزمني: الاختبار الحاسم لـADR-004 ──────

describe('drawAt — نقاء زمني', () => {
  it('استدعاء بترتيب عشوائي = استدعاء متسلسل (لا تسرّب حالة بين الإطارات)', () => {
    // ست لحظات تغطّي التحريكات المهمة:
    //   0.00 — badge بدأ فقط
    //   0.30 — headline بدأ
    //   1.00 — headline في منتصف الطريق (stagger لسطور)
    //   2.00 — كل شيء ظهر
    //   5.70 — قبل outro
    //   7.00 — خلال outro
    const times = [0, 0.30, 1.0, 2.0, 5.7, 7.0];

    // خط الأساس: مسلسل
    const sequential = new Map<number, unknown[]>();
    for (const t of times) sequential.set(t, renderAtT(t));

    // مُقلَّب: نفس الأوقات بترتيب عشوائي محدَّد (لا Math.random — تكراريّة)
    const shuffled = [5.7, 0.30, 7.0, 0, 2.0, 1.0];
    const random = new Map<number, unknown[]>();
    for (const t of shuffled) random.set(t, renderAtT(t));

    // لكل t: نتيجة المسلسل = نتيجة المُقلَّب
    for (const t of times) {
      const seq = sequential.get(t);
      const rnd = random.get(t);
      expect(rnd, `t=${t} غير موجود في random`).toBeDefined();
      expect(rnd, `t=${t} — عدد ops`).toHaveLength((seq as unknown[]).length);
      expect(rnd, `t=${t} — تسلسل ops`).toEqual(seq);
    }
  });

  it('drawAt(t) لا يحمل حالة إلى drawAt(t) الثانية بنفس t', () => {
    // نستدعي نفس t مرتين — يجب أن يكون النتيجتان متطابقتين تماماً
    const t = 1.4;
    const a = renderAtT(t);
    const b = renderAtT(t);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0); // نتأكّد أن الاختبار يفعل شيئاً
  });

  it('إطار عند t=0 ≠ إطار عند t=2 (التحريك يعمل)', () => {
    // ضمان أن الاختبار السابق ليس trivially-true
    const zero = renderAtT(0);
    const two = renderAtT(2.0);
    // على الأقل مختلفان في العدد أو المحتوى (إحداثيات مختلفة، شفافيات مختلفة)
    // نقارن الطول أو التسلسل — لا يجوز أن يكونا متطابقين
    const same =
      zero.length === two.length && JSON.stringify(zero) === JSON.stringify(two);
    expect(same).toBe(false);
  });
});
