import { describe, expect, it } from 'vitest';
import { wrapLatin } from './wrap-latin.js';
import { createMockCtx } from './mock-ctx.js';

// mock ctx بسيط: measureText(text) = text.length * (fs * 0.55) — تقريب
// للاتيني (charWidth أضيق قليلاً من العربي). كافٍ لاختبار المنطق.
const baseCfg = {
  boxWidth: 800,
  fsRange: [40, 80] as [number, number],
  lineHeight: 1.15,
  maxLines: 3,
  minLines: 2,
  weight: 700,
  fontFamily: '"Test Sans", sans-serif',
};

function makeCtx() {
  const ctx = createMockCtx() as unknown as {
    font: string;
    measureText(t: string): { width: number };
  };
  // نستبدل measureText المُدمج (mock الأصلي يعيد length*5) بمعادلة
  // تعتمد fs من ctx.font — كي wrapLatin يتفاعل مع تغيير الحجم.
  ctx.measureText = (t: string) => {
    const m = /(\d+(?:\.\d+)?)\s*px/.exec(ctx.font);
    const fs = m ? parseFloat(m[1]!) : 16;
    return { width: t.length * fs * 0.55 };
  };
  return ctx as unknown as import('./draw-line.js').CanvasDrawContext;
}

describe('wrapLatin — منع كلمة يتيمة في السطر الأخير', () => {
  it('عنوان 7 كلمات لا يترك السطر الأخير بكلمة واحدة', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, {
      ...baseCfg,
      text: 'Breaking news Turkish minister meets Syrian counterpart Ankara',
    });
    // آخر سطر يحمل كلمة واحدة = يتيم — يجب أن يُتجنّب
    const lastLine = r.lines[r.lines.length - 1]!;
    if (r.lines.length > 1) {
      expect(lastLine.length).toBeGreaterThan(1);
    }
  });
});

describe('wrapLatin — منع سطر بكلمة واحدة في غير الأخير', () => {
  it('لا سطر بكلمة واحدة في وسط العنوان', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, {
      ...baseCfg,
      text: 'A short but long enough headline to force wrapping test',
    });
    for (let i = 0; i < r.lines.length - 1; i++) {
      expect(r.lines[i]!.length).toBeGreaterThanOrEqual(1);
      // الأمر مسموح إن كان السطر الأخير أيضاً — نتحقّق فقط أن الأصغرية ليست في الوسط
      if (r.lines.length > 2 && i > 0 && i < r.lines.length - 1) {
        expect(r.lines[i]!.length).toBeGreaterThan(1);
      }
    }
  });
});

describe('wrapLatin — يفضّل حجم خط أكبر', () => {
  it('عنوان قصير يستهلك أعلى النطاق', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, {
      ...baseCfg,
      text: 'Short two lines here now',
      maxLines: 2,
      minLines: 2,
    });
    expect(r.fontSize).toBeGreaterThanOrEqual(60);
  });
});

describe('wrapLatin — WrapResult متوافق مع العقد', () => {
  it('يعيد boxWidth و lineHeight كما هو', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, { ...baseCfg, text: 'Two three four five six seven eight' });
    expect(r.boxWidth).toBe(baseCfg.boxWidth);
    expect(r.lineHeight).toBe(baseCfg.lineHeight);
  });

  it('كل token في المخرج بلا bold ولا accent', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, { ...baseCfg, text: 'One two three four five' });
    for (const line of r.lines) {
      for (const tok of line) {
        expect(tok.bold).toBe(false);
        expect(tok.accent).toBe(false);
      }
    }
  });
});

describe('wrapLatin — نص فارغ', () => {
  it('يعيد lines=[] بلا فشل', () => {
    const ctx = makeCtx();
    const r = wrapLatin(ctx, { ...baseCfg, text: '' });
    expect(r.lines).toEqual([]);
  });
});
