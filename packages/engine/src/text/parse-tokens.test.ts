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

  // ───── ٣٥٠ · _ داخل #hashtag / @handle جزءٌ من الرمز ─────
  // audit 750 §٤ ترتيبها #1 و#2: عطبُ تشكيرٍ صامتٍ يقسم الوسم/الـhandle.

  it('٣٥٠ · #hashtag عربيّ · _ يبقى داخل الرمز · لا accent يسرّب', () => {
    const out = parseTokens('الوسم #العاصمة_تغطّي على المنصّات');
    expect(out).toEqual([
      { text: 'الوسم',       bold: false, accent: false },
      { text: '#العاصمة_تغطّي', bold: false, accent: false }, // رمزٌ واحدٌ
      { text: 'على',         bold: false, accent: false },   // بلا accent
      { text: 'المنصّات',    bold: false, accent: false },   // بلا accent
    ]);
  });

  it('٣٥٠ · @handle لاتينيّ بـ_ · رمزٌ واحدٌ · بلا تسريب', () => {
    const out = parseTokens('المتحدّث الرسميّ @gov_spokes يؤكّد');
    expect(out).toEqual([
      { text: 'المتحدّث',    bold: false, accent: false },
      { text: 'الرسميّ',     bold: false, accent: false },
      { text: '@gov_spokes', bold: false, accent: false },
      { text: 'يؤكّد',       bold: false, accent: false },
    ]);
  });

  it('٣٥٠ · #hashtag لاتينيّ بـ_ · #Media_Kit', () => {
    const out = parseTokens('استعمل #Media_Kit اليوم');
    expect(out).toEqual([
      { text: 'استعمل',     bold: false, accent: false },
      { text: '#Media_Kit', bold: false, accent: false },
      { text: 'اليوم',      bold: false, accent: false },
    ]);
  });

  it('٣٥٠ · _accent_ Markdown لا يزال يعمل خارج #/@ (سلوكٌ محفوظ)', () => {
    // reference/aa-media-kit.html:782 · cv_bold_hint: "_underscore_ = accent under word"
    const out = parseTokens('اسمك _مهم_ جداً');
    expect(out).toEqual([
      { text: 'اسمك', bold: false, accent: false },
      { text: 'مهم',  bold: false, accent: true },  // ← accent مُطبَّق كما وُعِد المحرِّر
      { text: 'جداً', bold: false, accent: false },
    ]);
  });

  it('٣٥٠ · #hashtag متعدّد الـ_ · كلّه رمزٌ واحد', () => {
    const out = parseTokens('#عاجل_من_قِنديل اليوم');
    expect(out).toEqual([
      { text: '#عاجل_من_قِنديل', bold: false, accent: false },
      { text: 'اليوم',            bold: false, accent: false },
    ]);
  });

  it('٣٥٠ · #hashtag ثمّ فراغ ثمّ _accent_ خارجه · كلٌّ في محلّه', () => {
    const out = parseTokens('#tag_a هذا _مهم_');
    expect(out).toEqual([
      { text: '#tag_a', bold: false, accent: false }, // _ داخلي · جزء من الرمز
      { text: 'هذا',    bold: false, accent: false },
      { text: 'مهم',    bold: false, accent: true },  // _ خارجيّ · accent
    ]);
  });
});
