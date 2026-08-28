import { describe, expect, it } from 'vitest';
import {
  splitBidiRuns,
  orderRuns,
  mapNumerals,
  preprocessBidi,
} from './bidi.js';
import { parseTokens } from './parse-tokens.js';

describe('splitBidiRuns', () => {
  it('يفصل مقطعاً عربياً عن مقطع لاتيني', () => {
    const runs = splitBidiRuns('مؤتمر Brussels للسلام');
    // Brussels يشكّل مقطعاً LTR واحداً بين مقطعين RTL.
    expect(runs.map((r) => r.dir)).toEqual(['rtl', 'ltr', 'rtl']);
    expect(runs[1]!.text.trim()).toBe('Brussels');
  });

  it('المحايدات تلتصق بالمقطع السابق', () => {
    const runs = splitBidiRuns('عربي English');
    // «عربي » (مع الفراغ) rtl، ثم «English» ltr.
    expect(runs).toHaveLength(2);
    expect(runs[0]!.dir).toBe('rtl');
    expect(runs[0]!.text.endsWith(' ')).toBe(true);
    expect(runs[1]!.dir).toBe('ltr');
  });

  it('سلسلة فارغة ⇒ قائمة فارغة', () => {
    expect(splitBidiRuns('')).toEqual([]);
  });
});

describe('orderRuns (base=rtl)', () => {
  it('يعكس ترتيب الكلمات داخل مقاطع LTR فقط', () => {
    const runs = [
      { text: 'مؤتمر ', dir: 'rtl' as const },
      { text: 'The BBC News', dir: 'ltr' as const },
      { text: ' للسلام', dir: 'rtl' as const },
    ];
    const out = orderRuns(runs, 'rtl');
    expect(out[0]!.text).toBe('مؤتمر ');
    expect(out[1]!.text).toBe('News BBC The');
    expect(out[2]!.text).toBe(' للسلام');
  });

  it('لا يعكس داخل مقاطع RTL', () => {
    const runs = [{ text: 'مؤتمر السلام', dir: 'rtl' as const }];
    expect(orderRuns(runs, 'rtl')[0]!.text).toBe('مؤتمر السلام');
  });

  it('كلمة LTR وحيدة ⇒ لا تغيير', () => {
    const runs = [{ text: 'Brussels', dir: 'ltr' as const }];
    expect(orderRuns(runs, 'rtl')[0]!.text).toBe('Brussels');
  });

  it('base=ltr يترك المقاطع كما هي', () => {
    const runs = [
      { text: 'مؤتمر ', dir: 'rtl' as const },
      { text: 'The BBC News', dir: 'ltr' as const },
    ];
    const out = orderRuns(runs, 'ltr');
    expect(out[1]!.text).toBe('The BBC News');
  });
});

describe('mapNumerals', () => {
  it('يبدّل 2026 إلى ٢٠٢٦', () => {
    expect(mapNumerals('عام 2026', 'arabic')).toBe('عام ٢٠٢٦');
  });

  it('يبدّل ٢٠٢٦ إلى 2026', () => {
    expect(mapNumerals('عام ٢٠٢٦', 'latin')).toBe('عام 2026');
  });

  it('العدد الحرفي (grapheme) يبقى ثابتاً — لا كسر للقياس', () => {
    const src = 'التقرير 2026 عن الأسواق العربية';
    const arab = mapNumerals(src, 'arabic');
    const back = mapNumerals(arab, 'latin');
    expect([...arab].length).toBe([...src].length);
    expect(back).toBe(src);
  });
});

describe('preprocessBidi — end-to-end', () => {
  it('«مؤتمر Brussels للسلام»: ترتيب المقاطع صحيح للرسم RTL', () => {
    // كلمة LTR وحيدة داخل سياق عربي ⇒ لا تُقلب.
    const out = preprocessBidi('مؤتمر Brussels للسلام');
    expect(out).toBe('مؤتمر Brussels للسلام');

    // parseTokens بعد المعالجة يعطي الترتيب الرسمي:
    // «مؤتمر» أول (سيُرسم أقصى يمين)، ثم «Brussels»، ثم «للسلام» (أقصى يسار).
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    expect(tokens.map((t) => (t as { text: string }).text)).toEqual([
      'مؤتمر',
      'Brussels',
      'للسلام',
    ]);
  });

  it('«أخبار The BBC News الليلة»: يعكس ترتيب الكلمات LTR فقط', () => {
    const out = preprocessBidi('أخبار The BBC News الليلة');
    // بعد المعالجة، الكلمات اللاتينية معكوسة الترتيب داخل المقطع.
    // parseTokens ثم الرسم كلمة كلمة من اليمين يعطي المشهد الصحيح:
    //   يمين→يسار: أخبار, News, BBC, The, الليلة
    //   القارئ يرى الجزء اللاتيني ككتلة يقرؤها L→R: «The BBC News».
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    expect(tokens.map((t) => (t as { text: string }).text)).toEqual([
      'أخبار',
      'News',
      'BBC',
      'The',
      'الليلة',
    ]);
  });

  it('«التقرير عام 2026 خطير»: الرقم لا ينقلب (يبقى «2026»)', () => {
    const out = preprocessBidi('التقرير عام 2026 خطير');
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    const texts = tokens.map((t) => (t as { text: string }).text);
    expect(texts).toContain('2026');
    // لا يظهر «6202» في أي رمز.
    expect(texts.some((t) => t === '6202')).toBe(false);
  });

  it('numerals=arabic يبدّل الأرقام قبل المعالجة', () => {
    const out = preprocessBidi('عام 2026 خبر', { numerals: 'arabic' });
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    const texts = tokens.map((t) => (t as { text: string }).text);
    expect(texts).toContain('٢٠٢٦');
    expect(texts).not.toContain('2026');
  });
});
