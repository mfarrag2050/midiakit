import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { layoutBalanced } from './layout-balanced.js';
import { createSyntheticMeasurer } from './measurer.js';
import { isWord } from '@pf-mediakit/shared';

const measure = createSyntheticMeasurer();

describe('layoutBalanced', () => {
  it('كلمة واحدة ⇒ سطر واحد', () => {
    const tokens = parseTokens('عنوان');
    const r = layoutBalanced(tokens, 1000, 96, 40, false, 1.34, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toHaveLength(1);
  });

  it('لا كلمات ⇒ صفر أسطر', () => {
    const r = layoutBalanced([], 1000, 96, 40, false, 1.34, measure);
    expect(r.lines).toEqual([]);
  });

  it('lineHeight = round(fs × lineHeightRatio)', () => {
    const tokens = parseTokens('عنوان قصير');
    const r = layoutBalanced(tokens, 1000, 96, 40, false, 1.34, measure);
    expect(r.lineHeight).toBe(Math.round(r.fontSize * 1.34));
  });

  it('يعيد أقل فرق (w1 − w2) مع w1 ≥ w2 حين توجد قسمة متوازنة', () => {
    // أربع كلمات متساوية العرض ⇒ قسمة k=2 تعطي w1=w2 دائماً — الأمثل.
    const tokens = parseTokens('بيت بيت بيت بيت');
    const boxW = 700;
    const r = layoutBalanced(tokens, boxW, 96, 40, false, 1.34, measure);

    expect(r.lines.length).toBe(2);
    expect(r.lines[0]).toHaveLength(2);
    expect(r.lines[1]).toHaveLength(2);

    const w1 = measure.line(r.lines[0]!, r.fontSize, false);
    const w2 = measure.line(r.lines[1]!, r.fontSize, false);

    // القسمة الأمثل: w1 = w2.
    expect(w1).toBe(w2);
    expect(w1).toBeLessThanOrEqual(boxW);
  });

  it('يفضّل قسمة متوازنة على الأخريات', () => {
    // 5 كلمات ⇒ k=1 غير متوازن، k=2 متوازن، k=3 غير متوازن.
    // الأصل يبحث عن أقل فرق مع w1 ≥ w2 ⇒ يختار k=2 أو k=3 حسب البيانات.
    // نتحقّق أن الفرق المُختار لا يفوق أي قسمة صالحة أخرى.
    const tokens = parseTokens('واحد اثنان ثلاثة أربعة خمسة');
    const boxW = 1200;
    const r = layoutBalanced(tokens, boxW, 96, 40, false, 1.34, measure);

    expect(r.lines).toHaveLength(2);
    const w1 = measure.line(r.lines[0]!, r.fontSize, false);
    const w2 = measure.line(r.lines[1]!, r.fontSize, false);

    // اجمع كل القسمات المتوازنة الصالحة عند نفس fs.
    const words = tokens.filter(isWord);
    const balancedDiffs: number[] = [];
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k);
      const b = words.slice(k);
      const wa = measure.line(a, r.fontSize, false);
      const wb = measure.line(b, r.fontSize, false);
      if (wa <= boxW && wb <= boxW && wa >= wb) balancedDiffs.push(wa - wb);
    }

    if (balancedDiffs.length > 0) {
      // إن وُجدت قسمات متوازنة ⇒ المُختار يجب أن يكون أدناها.
      expect(w1).toBeGreaterThanOrEqual(w2);
      const bestDiff = Math.min(...balancedDiffs);
      expect(w1 - w2).toBeLessThanOrEqual(bestDiff + 0.001);
    } else {
      // إن لم تُوجد ⇒ الأصل يعود إلى «أي قسمة صالحة» بلا شرط توازن.
      expect(w1).toBeLessThanOrEqual(boxW);
      expect(w2).toBeLessThanOrEqual(boxW);
    }
  });

  it('يصغّر الخط بخطوة 2px حتى يجد قسمة صالحة', () => {
    const tokens = parseTokens('كلمات كثيرة تحتاج فوناً أصغر لتسع في الصندوق');
    const r = layoutBalanced(tokens, 380, 96, 40, false, 1.34, measure);
    expect(r.fontSize).toBeLessThanOrEqual(96);
    expect(r.fontSize).toBeGreaterThanOrEqual(40);
    expect((96 - r.fontSize) % 2).toBe(0);
  });

  it('يتراجع إلى minFont عند استحالة القسمة داخل boxW ضيّق جداً', () => {
    // 8 كلمات و boxW = 100 — لا قسمة صالحة عند أي fs.
    const tokens = parseTokens('أ ب ج د هـ و ز ح');
    const r = layoutBalanced(tokens, 100, 96, 40, false, 1.34, measure);
    expect(r.fontSize).toBe(40);
    expect(r.lines).toHaveLength(2);
  });
});
