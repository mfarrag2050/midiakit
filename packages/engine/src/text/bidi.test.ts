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
  it('يبدّل 2026 إلى ٢٠٢٦ في وضع arabic', () => {
    expect(mapNumerals('عام 2026', 'arabic')).toBe('عام ٢٠٢٦');
  });

  // 350 · سلوك جديد: 'latin' = pass-through (لا يعكس · لا يحوّل عربيّاً
  // إلى لاتينيّ). المحرّر الذي يكتب ١٢٣ عمداً يبقى ١٢٣.
  it('350 · latin = pass-through — يُبقي ٢٠٢٦ عربيّاً كما هي', () => {
    expect(mapNumerals('عام ٢٠٢٦', 'latin')).toBe('عام ٢٠٢٦');
  });

  it('350 · latin = pass-through — يُبقي 2026 لاتينيّاً كما هي', () => {
    expect(mapNumerals('عام 2026', 'latin')).toBe('عام 2026');
  });

  it('العدد الحرفي (grapheme) يبقى ثابتاً في وضع arabic — لا كسر للقياس', () => {
    const src = 'التقرير 2026 عن الأسواق';
    const arab = mapNumerals(src, 'arabic');
    expect([...arab].length).toBe([...src].length);
    // 350 · العكس عبر 'latin' لم يعد يحدث — العميل الذي يكتب ١٢٣ يبقى ١٢٣.
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

// ── سلوك D-01 بعد تحسين ٣٥٠ · مطابقة الأقواس مع الجار اللاتينيّ ────
//
// **قبل ٣٥٠:** كل قوس محايد يلتصق بالمقطع السابق حرفيّاً. `(` قبل Reuters
// كان ينضمّ للـrun العربيّ فيصير `تقرير (`. `)` بعد Reuters يبقى مع الـrun
// اللاتينيّ. المقطعان غير متماثلَين — والعكس بالكلمات (`«Berlin Pact»` →
// `«Pact» Berlin`) يكسر الزوج تماماً.
//
// **بعد ٣٥٠ (BD16 مبسَّطة · `bidi.ts:resolveBracketDirs`):** القوس المحايد
// الملاصق لمقطعٍ لاتينيّ يأخذ اتّجاهَه. فـ`(` قبل `R` = LTR، `)` بعد `s` = LTR.
// الزوج ينضمّ للـrun اللاتينيّ كلاهما. الاختبار أدناه يوثّق السلوك الجديد.
describe('preprocessBidi — الأقواس على حدود المقاطع (D-01 · بعد ٣٥٠)', () => {
  it('٣٥٠ · القوسان `()` ينضمّان للـrun اللاتينيّ حول Reuters', () => {
    const runs = splitBidiRuns('تقرير (Reuters) من غزة');
    expect(runs.map((r) => ({ text: r.text, dir: r.dir }))).toEqual([
      { text: 'تقرير ',   dir: 'rtl' },
      { text: '(Reuters) ', dir: 'ltr' },
      { text: 'من غزة',   dir: 'rtl' },
    ]);
  });

  it('orderRuns لا يفصل القوسين عن مقطعيهما', () => {
    // كلمة LTR وحيدة «Reuters)» ⇒ لا يوجد ما يُعكس داخل المقطع.
    // القوس المفتوح يبقى ملتصقاً بالنص العربي قبله.
    const out = preprocessBidi('تقرير (Reuters) من غزة');
    expect(out).toBe('تقرير (Reuters) من غزة');
  });

  it('parseTokens يعطي كلمة واحدة «(Reuters)» ملتصقاً بالقوسين', () => {
    // parseTokens يفصل على الفراغ فقط، فالقوسان جزء من التوكن.
    const out = preprocessBidi('تقرير (Reuters) من غزة');
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    expect(tokens.map((t) => (t as { text: string }).text)).toEqual([
      'تقرير',
      '(Reuters)',
      'من',
      'غزة',
    ]);
    // ملاحظة: البصريات على Canvas مع direction='rtl' قد تُظهر القوسين
    // في الجهة الخطأ بصرياً حول Reuters. يُعالَج بتصنيف BiDi كامل
    // (mirroring + paren-matching) — انظر D-01 في PHASES.md.
  });
});

// ───── ٣٥٠ · الأقواس حول مقطع لاتينيّ متعدّد الكلمات (audit 750 §٤ #3) ─────
// **العطب قبل ٣٥٠:** `«Berlin Pact»` داخل عربيّ ⇒ `«Pact» Berlin`.
// **بعد ٣٥٠:** الأقواس تلتصق بجارها اللاتينيّ فيبقى الزوج على جهةٍ واحدة،
// وعكسُ الكلمات (RTL word-by-word) يعطي الترتيب البصريّ الصحيح.
describe('preprocessBidi — ٣٥٠ · أقواس حول مقطع لاتينيّ متعدّد الكلمات', () => {
  it('«Berlin Pact» داخل عربيّ · لا انفصال', () => {
    const out = preprocessBidi('صرّح المتحدّث «Berlin Pact» بأنّ');
    // بعد الإصلاح: `Pact»` و`«Berlin` توكِنان منفصلان مربوطان بالقوسَين.
    // (رسم RTL يضع Pact» أوّلاً على اليمين ثمّ «Berlin يساراً ⇒ visual: «Berlin Pact»)
    expect(out).toBe('صرّح المتحدّث Pact» «Berlin بأنّ');
    const tokens = parseTokens(out).filter((t) => 'text' in t);
    expect(tokens.map((t) => (t as { text: string }).text)).toEqual([
      'صرّح', 'المتحدّث', 'Pact»', '«Berlin', 'بأنّ',
    ]);
  });

  it('"Berlin Pact" (اقتباس ASCII متماثل) · نفس السلوك', () => {
    const out = preprocessBidi('صرّح المتحدّث "Berlin Pact" بأنّ');
    expect(out).toBe('صرّح المتحدّث Pact" "Berlin بأنّ');
  });

  it('[Sample Note] · قوسان مربّعان', () => {
    const out = preprocessBidi('مرجع [Sample Note] للتوثيق');
    expect(out).toBe('مرجع Note] [Sample للتوثيق');
  });

  it('(Type-A) · قوسٌ حول كلمةٍ واحدة · لا يتغيّر', () => {
    // ما دام لا فراغَ داخل القوسَين، لا انعكاس · القوسان دخلا الـLTR run لكن
    // النتيجة النصّيّة كما هي.
    const out = preprocessBidi('اتّفاقاً (Type-A) يشمل');
    expect(out).toBe('اتّفاقاً (Type-A) يشمل');
  });

  it('«مرحباً» عربيّ داخل اقتباس · لا تغيير (احتراز: نطبّق LTR فقط)', () => {
    const out = preprocessBidi('قال «مرحباً» ثمّ صمت');
    // الأقواس محايدة، جارها RTL ⇒ resolveBracketDirs لا تُطبِّق شيئاً.
    // النتيجة نفس المدخل.
    expect(out).toBe('قال «مرحباً» ثمّ صمت');
  });
});
