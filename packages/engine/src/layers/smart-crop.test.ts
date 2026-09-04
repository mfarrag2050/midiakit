import { describe, expect, it } from 'vitest';
import { smartCrop, type FaceBox, type Rect } from './smart-crop.js';

const HD: { w: number; h: number } = { w: 1920, h: 1080 };
const PORTRAIT: { w: number; h: number } = { w: 1080, h: 1920 };
const SQUARE: { w: number; h: number } = { w: 1080, h: 1080 };

describe('smartCrop — نسبة العرض إلى الارتفاع (cover)', () => {
  it('صورة عريضة إلى قالب مربّع: sw = sh = image.h', () => {
    const r = smartCrop(HD, SQUARE);
    expect(r.w).toBe(1080);
    expect(r.h).toBe(1080);
    // بلا معلومات → التمركز الأعمى: مركز الصورة (960, 540).
    // sx = 960 - 540 = 420, sy = 540 - 540 = 0.
    expect(r.x).toBe(420);
    expect(r.y).toBe(0);
  });

  it('صورة مربّعة إلى قالب طولي: sw = sh × ratio', () => {
    const r = smartCrop(SQUARE, PORTRAIT);
    // targetRatio = 1080/1920 = 0.5625. imageRatio = 1.
    // imageRatio > targetRatio ⇒ sh = 1080, sw = 1080 × 0.5625 = 607.5.
    expect(r.h).toBe(1080);
    expect(r.w).toBeCloseTo(607.5, 1);
  });
});

describe('smartCrop — أولوية override (L-13)', () => {
  it('override يتقدّم حتى مع وجود وجوه', () => {
    const face: FaceBox = { x: 100, y: 100, w: 200, h: 200, score: 0.99 };
    const override: Rect = { x: 500, y: 500, w: 400, h: 400 };
    const r = smartCrop(HD, SQUARE, { faces: [face], override });
    expect(r).toEqual(override);
  });

  it('override خارج الحدود يُقصّ إلى الصورة', () => {
    const override: Rect = { x: -100, y: -100, w: 2000, h: 2000 };
    const r = smartCrop(HD, SQUARE, { override });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBeLessThanOrEqual(HD.w);
    expect(r.h).toBeLessThanOrEqual(HD.h);
  });
});

describe('smartCrop — تركيز على الوجه', () => {
  it('وجه في اليسار ⇒ الإطار ينزلق يساراً', () => {
    const face: FaceBox = { x: 100, y: 400, w: 200, h: 300 };
    const r = smartCrop(HD, SQUARE, { faces: [face] });
    // مركز الوجه = (200, 550). الإطار المفضّل مركزه (200, 550) ⇒ sx = 200 - 540 = -340
    // يُقصّ إلى 0. لكن بعد shiftToKeepFaces، لا حاجة للإزاحة لأن الوجه (100..300, 400..700)
    // يقع داخل [0..1080, 0..1080].
    expect(r.x).toBe(0);
    // مركز الإطار عمودياً بحدود (540) — بعد قصّ [0, image.h - sh] = [0, 0] لأن sh=1080=image.h.
    expect(r.y).toBe(0);
    // الوجه داخل الإطار.
    expect(face.x + face.w).toBeLessThanOrEqual(r.x + r.w);
    expect(face.y + face.h).toBeLessThanOrEqual(r.y + r.h);
  });

  it('وجه في اليمين ⇒ الإطار ينزلق يميناً (مقارنة مع الأعمى)', () => {
    const face: FaceBox = { x: 1600, y: 400, w: 200, h: 300 };
    const smart = smartCrop(HD, SQUARE, { faces: [face] });
    const blind = smartCrop(HD, SQUARE);
    // الإطار الذكي أقرب إلى اليمين من الأعمى.
    expect(smart.x).toBeGreaterThan(blind.x);
    // الوجه داخل الإطار الذكي.
    expect(face.x).toBeGreaterThanOrEqual(smart.x);
    expect(face.x + face.w).toBeLessThanOrEqual(smart.x + smart.w);
  });
});

describe('smartCrop — تراجع صامت', () => {
  it('لا وجوه ولا override ⇒ تمركز أعمى (لا فشل)', () => {
    const r = smartCrop(HD, SQUARE);
    expect(r).toBeDefined();
    expect(r.w).toBe(1080);
    expect(r.h).toBe(1080);
    expect(r.x).toBe(420);
    expect(r.y).toBe(0);
  });

  it('مصفوفة وجوه فارغة ⇒ نفس التراجع', () => {
    const rEmpty = smartCrop(HD, SQUARE, { faces: [] });
    const rBlind = smartCrop(HD, SQUARE);
    expect(rEmpty).toEqual(rBlind);
  });
});

describe('smartCrop — الأولوية للوجه الأكبر', () => {
  it('وجهان: كبير في اليمين، صغير في اليسار ⇒ الإطار يميل يميناً', () => {
    const big: FaceBox = { x: 1500, y: 400, w: 300, h: 400 };
    const small: FaceBox = { x: 100, y: 400, w: 100, h: 120 };
    const r = smartCrop(HD, SQUARE, { faces: [big, small] });
    // مركز الوجه الكبير = (1650, 600) بمساحة 120000. الصغير (150, 460) مساحة 12000.
    // مركز الثقل المرجَّح ≈ (1500, 587). ثم shiftToKeepFaces يعتني بضمان
    // احتواء الكبير أولاً — لأن الأولوية له.
    expect(r.x + r.w).toBeGreaterThanOrEqual(big.x + big.w);
    expect(r.x).toBeLessThanOrEqual(big.x);
  });
});

describe('smartCrop — ثبات (نفس المدخل ⇒ نفس المخرج)', () => {
  it('عشر استدعاءات متتالية تُعطي نفس المخرج', () => {
    const face: FaceBox = { x: 300, y: 300, w: 200, h: 250 };
    const first = smartCrop(HD, SQUARE, { faces: [face] });
    for (let i = 0; i < 10; i++) {
      const r = smartCrop(HD, SQUARE, { faces: [face] });
      expect(r).toEqual(first);
    }
  });
});

describe('smartCrop — أربعة مقاسات مختلفة تحوي الوجه', () => {
  it('نفس الوجه، 4 قوالب مختلفة ⇒ كلها تحوي الوجه', () => {
    const face: FaceBox = { x: 700, y: 400, w: 200, h: 250 };
    const image = HD;
    const targets = [
      { w: 1080, h: 1080 }, // square
      { w: 1080, h: 1920 }, // portrait
      { w: 1080, h: 1350 }, // 4:5
      { w: 1920, h: 1080 }, // landscape
    ];
    for (const t of targets) {
      const r = smartCrop(image, t, { faces: [face] });
      // الوجه داخل الإطار.
      expect(face.x).toBeGreaterThanOrEqual(r.x);
      expect(face.y).toBeGreaterThanOrEqual(r.y);
      expect(face.x + face.w).toBeLessThanOrEqual(r.x + r.w);
      expect(face.y + face.h).toBeLessThanOrEqual(r.y + r.h);
    }
  });
});
