import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { isBreak } from '@pf-mediakit/shared';

describe('parseTokens', () => {
  it('يفسّر الكلمات العادية بلا bold ولا accent', () => {
    expect(parseTokens('مرحباً بالعالم')).toEqual([
      { text: 'مرحباً', bold: false, accent: false },
      { text: 'بالعالم', bold: false, accent: false },
    ]);
  });

  it('يفعّل bold داخل نجمتين *…*', () => {
    const out = parseTokens('عاجل *الآن* في السوق');
    expect(out).toEqual([
      { text: 'عاجل', bold: false, accent: false },
      { text: 'الآن', bold: true, accent: false },
      { text: 'في', bold: false, accent: false },
      { text: 'السوق', bold: false, accent: false },
    ]);
  });

  it('يفعّل accent داخل شرطتين _…_', () => {
    const out = parseTokens('اسمك _مهم_ جداً');
    expect(out).toEqual([
      { text: 'اسمك', bold: false, accent: false },
      { text: 'مهم', bold: false, accent: true },
      { text: 'جداً', bold: false, accent: false },
    ]);
  });

  it('يجمع bold + accent معاً', () => {
    const out = parseTokens('*_عاجل_*');
    expect(out).toEqual([{ text: 'عاجل', bold: true, accent: true }]);
  });

  it('يُنتج BreakToken على كل \\n', () => {
    const out = parseTokens('سطر أول\nسطر ثاني');
    expect(out).toHaveLength(5);
    expect(out.filter(isBreak)).toHaveLength(1);
    expect(out[2]).toEqual({ br: true });
  });

  it('يتخطّى الفراغات المتتالية بلا كلمة فارغة', () => {
    expect(parseTokens('  a   b  ')).toEqual([
      { text: 'a', bold: false, accent: false },
      { text: 'b', bold: false, accent: false },
    ]);
  });

  it('نص فارغ ⇒ قائمة فارغة', () => {
    expect(parseTokens('')).toEqual([]);
  });

  it('يفصل الكلمات المتلاصقة بمُغيِّر (*/_) بالمسافة الافتراضية داخلياً', () => {
    // *أ*ب ⇒ كلمة عريضة «أ» ثم كلمة عادية «ب»
    const out = parseTokens('*أ*ب');
    expect(out).toEqual([
      { text: 'أ', bold: true, accent: false },
      { text: 'ب', bold: false, accent: false },
    ]);
  });
});
