// ٥٦٥ · اختبار اتّجاه الخطّ الزمنيّ وأسهم التحريك — ثلاث لغات

import { describe, expect, it } from 'vitest';
import { arrowKeyStep, timelineDirFor } from './direction';

describe('timelineDirFor — الاتّجاه يتبع اللغة الفعّالة', () => {
  it('en → ltr (الصفر يساراً · المؤشّر يتقدّم يميناً)', () => {
    expect(timelineDirFor('en')).toBe('ltr');
  });
  it('ar → rtl', () => {
    expect(timelineDirFor('ar')).toBe('rtl');
  });
  it('mixed → rtl (وثيقةُ mixed تبقى rtl · انظر LocaleProvider.DIRECTION)', () => {
    expect(timelineDirFor('mixed')).toBe('rtl');
  });
});

describe('arrowKeyStep — السهمُ يمضي حيث يشير · بحسب اتّجاه الشريط', () => {
  describe('ltr (en)', () => {
    it('→ يتقدّم في الزمن (+1)', () => {
      expect(arrowKeyStep('ArrowRight', 'ltr')).toBe(1);
    });
    it('← يتراجع في الزمن (-1)', () => {
      expect(arrowKeyStep('ArrowLeft', 'ltr')).toBe(-1);
    });
  });
  describe('rtl (ar · mixed)', () => {
    it('← يتقدّم في الزمن (+1) — الشريطُ يسير من اليمين لليسار', () => {
      expect(arrowKeyStep('ArrowLeft', 'rtl')).toBe(1);
    });
    it('→ يتراجع في الزمن (-1)', () => {
      expect(arrowKeyStep('ArrowRight', 'rtl')).toBe(-1);
    });
  });
  it('سهمٌ آخر (ArrowUp) يعيد 0 · لا تحريك', () => {
    expect(arrowKeyStep('ArrowUp', 'ltr')).toBe(0);
    expect(arrowKeyStep('ArrowUp', 'rtl')).toBe(0);
  });
});
