// اختبارات صريحة للتفاعل بين التشكيل والكشيدة (docs/07 §3 · §4 من تذكرة).
//
// **الفرضية المُختبَرة:** kashidaSites يُعيد [] لكل كلمة تحمل أي حركة —
// القاعدة موجودة في السطر 122-126 من kashida.ts، لكن لم تكن مغطّاة على
// نصوص إخبارية حقيقية مشكّلة بالكامل. **درس L-11:** ما لا يُختبَر على
// المدخل الحقيقي قد ينكسر بلا سابق إنذار.

import { describe, expect, it } from 'vitest';
import { createSyntheticMeasurer, type Measurer } from './measurer.js';
import { kashidaSites, justifyLine, TATWEEL } from './kashida.js';
import { parseTokens } from './parse-tokens.js';
import { measuredLineHeight } from './dynamic-line-height.js';
import { isWord } from '@pf-mediakit/shared';
import type { FontCaps, JustifyConfig } from '@pf-mediakit/shared';

const CAPS_ON: FontCaps = {
  kashida: true,
  kashidaMethod: 'tatweel',
  variableAxes: [],
  diacriticsSafe: true,
};

const CFG_KASHIDA: JustifyConfig = {
  mode: 'kashida',
  maxStretchPerSite: 0.35,
  maxSitesPerWord: 1,
  minLineFill: 0.82,
  lastLine: 'natural',
};

const measure: Measurer = createSyntheticMeasurer();

// ── نصوص إخبارية حقيقية بتشكيل كامل ──────────────────
// المصدر: عيّنة تشكيل من arabic-diacritizer على عناوين RSS حقيقية.
// هذه ليست تشكيلاً محفوظاً — القيمة الاختبارية هي أن العلامات موجودة
// وأن kashida تتراجع صامتاً في كل حالة.

const DIACRITIZED_HEADLINES = [
  'بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ',
  'الِاتِّحَادِ الْأُورُوبِيُّ يَحْذَّرُ صَرْبِيًّا',
  'قُطَّاًعٍ غَزَّةٍ يُوَاجِهُ أَزِمَةً',
  'وَزِيرُ الْخَارِجِيَّةِ التُّرْكِيُّ',
];

describe('kashida × diacritics — تفاعل صريح', () => {
  for (const headline of DIACRITIZED_HEADLINES) {
    it(`«${headline}» — kashidaSites فارغة لكل كلمة`, () => {
      const tokens = parseTokens(headline);
      const words = tokens.filter(isWord);
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        const sites = kashidaSites(w.text, CAPS_ON);
        expect(sites).toHaveLength(0);
      }
    });

    it(`«${headline}» — justifyLine لا يُدرج أيّ تطويل جديد`, () => {
      const tokens = parseTokens(headline);
      const words = tokens.filter(isWord);
      // نضع boxWidth أوسع بكثير من عرض السطر ليجرّب التطويل بأقصى حماس.
      const rawWidth = measure.line(words, 80, false);
      const boxW = Math.ceil(rawWidth * 1.5);
      // نحسب تطويلات المصدر أولاً (بعض النصوص القرآنية تحوي U+0640 أصلاً
      // كحاملة للألف الخنجرية ٰ) — نطرحها من العدّ النهائي.
      const sourceTatweels = words.map((w) => w.text).join('').split(TATWEEL).length - 1;
      const justified = justifyLine(
        words, boxW, 80, false, CFG_KASHIDA, CAPS_ON, measure,
        { isLast: false }
      );
      const finalTatweels = justified
        .map((t) => (isWord(t) ? t.text : ''))
        .join('')
        .split(TATWEEL).length - 1;
      const added = finalTatweels - sourceTatweels;
      expect(added).toBe(0);
    });
  }

  it('نص عارٍ يقبل التطويل، نفس النص مشكّل يرفضه — تباين حاسم', () => {
    const bare = 'وزير الخارجية التركي';
    const marked = 'وَزِيرُ الْخَارِجِيَّةِ التُّرْكِيِّ';
    const wordsBare = parseTokens(bare).filter(isWord);
    const wordsMarked = parseTokens(marked).filter(isWord);

    let sitesBare = 0;
    for (const w of wordsBare) sitesBare += kashidaSites(w.text, CAPS_ON).length;
    let sitesMarked = 0;
    for (const w of wordsMarked) sitesMarked += kashidaSites(w.text, CAPS_ON).length;

    expect(sitesBare).toBeGreaterThan(0);
    expect(sitesMarked).toBe(0);
  });
});

// ── measuredLineHeight — عقد الحدّ الأدنى ────────────────

describe('measuredLineHeight — لا يقلّ عن الحدّ الأدنى الثابت', () => {
  // ctx وهمي يعيد ascent/descent بنسبة قابلة للتحكّم.
  // نستعملها للتأكّد أن الدالة تحترم `minLineHeight` عند نصّ خفيف.
  const mockCtx = (ascentRatio: number, descentRatio: number) => {
    return {
      font: '',
      measureText: (text: string) => ({
        width: text.length * 40,
        actualBoundingBoxAscent: text.length * ascentRatio,
        actualBoundingBoxDescent: text.length * descentRatio,
      }),
    };
  };

  it('حين ascent + descent < minLineHeight — تعيد minLineHeight', () => {
    const ctx = mockCtx(0, 0);
    const lines = [[{ text: 'كلمة', bold: false, accent: false}]];
    const min = 100;
    const result = measuredLineHeight(ctx, lines, 80, 'IBM', false, min);
    expect(result).toBe(min);
  });

  it('حين ascent + descent > minLineHeight — تعيد المُقاس مع padding', () => {
    // نضع ascent+descent كبيراً بحيث يتجاوز min = 100
    const ctx = mockCtx(30, 15); // 4 حرف × 45 = 180
    const lines = [[{ text: 'كلمة', bold: false, accent: false}]];
    const min = 100;
    const result = measuredLineHeight(ctx, lines, 80, 'IBM', false, min, 0.05);
    // 180 × 1.05 = 189
    expect(result).toBe(189);
    expect(result).toBeGreaterThan(min);
  });

  it('يأخذ أعلى ذُروة عبر الأسطر (السطر الأكثف يفرض المسافة)', () => {
    // ctx يُعيد ارتفاعاً يتناسب مع طول النص.
    const ctx = mockCtx(20, 10);
    const light = [{ text: 'كل', bold: false, accent: false}]; // 2 × 30 = 60
    const heavy = [{ text: 'كلمات', bold: false, accent: false}]; // 5 × 30 = 150
    const result = measuredLineHeight(ctx, [light, heavy], 80, 'IBM', false, 50, 0);
    expect(result).toBe(150); // ذُروة السطر الثاني
  });
});

// ── التشكيل الجزئي — متطلب منتج صريح (docs/09 التحرير) ────
// «العميل يتحكّم — يشكّل الكلمة الملتبسة فقط ويترك البقية. تشكيل جزئي
// مسموح.» — المحرك يجب أن يعالج كل كلمة على حدة: كشيدة على العارية،
// امتناع عن المشكّلة، وارتفاع سطر يعكس أعلى ذُروة (المشكّلة).

describe('التشكيل الجزئي — كلمات مشكّلة تجاور عارية', () => {
  // «الرَّئِيسُ الأميركي يزور القاهرة اليوم» — «الرئيس» فقط مشكّلة.
  const PARTIAL = 'الرَّئِيسُ الأميركي يزور القاهرة اليوم';
  const words = parseTokens(PARTIAL).filter(isWord);

  it('parseTokens يحافظ على العلامات في الكلمة المشكّلة، والعاريات نظيفات', () => {
    expect(words[0]!.text).toContain('َ'); // فتحة على الرئيس
    expect(words[0]!.text).toContain('ّ'); // شدّة على الرئيس
    // بقيّة الكلمات لا تحمل تشكيلاً
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.text).not.toMatch(/[ً-ٰٟ]/);
    }
  });

  it('kashidaSites: قرار **لكل كلمة على حدة** — مشكّلة ⇒ [] · عارية طويلة ⇒ >0', () => {
    expect(kashidaSites(words[0]!.text, CAPS_ON)).toHaveLength(0); // الرَّئِيسُ
    expect(kashidaSites(words[1]!.text, CAPS_ON).length).toBeGreaterThan(0); // الأميركي
    expect(Array.isArray(kashidaSites(words[2]!.text, CAPS_ON))).toBe(true); // يزور
    expect(kashidaSites(words[3]!.text, CAPS_ON).length).toBeGreaterThan(0); // القاهرة
    expect(Array.isArray(kashidaSites(words[4]!.text, CAPS_ON))).toBe(true); // اليوم
  });

  it('justifyLine ينجح، ولا يُدرج تطويلاً جديداً على المشكّلة', () => {
    const rawWidth = measure.line(words, 80, false);
    const boxW = Math.ceil(rawWidth * 1.4); // فجوة تستدعي تطويلاً
    const justified = justifyLine(
      words, boxW, 80, false, CFG_KASHIDA, CAPS_ON, measure,
      { isLast: false }
    );
    expect(justified.length).toBe(words.length);
    for (let i = 0; i < words.length; i++) {
      const src = words[i]!.text;
      const outTok = justified[i]!;
      const out = isWord(outTok) ? outTok.text : '';
      const srcT = (src.match(/ـ/g) ?? []).length;
      const outT = (out.match(/ـ/g) ?? []).length;
      const added = outT - srcT;
      if (i === 0) expect(added).toBe(0); // الرَّئِيسُ لا تطويل جديد
      expect(added).toBeGreaterThanOrEqual(0);
    }
  });

  it('measuredLineHeight يعكس ارتفاع الكلمة المشكّلة (الأعلى في السطر)', () => {
    // ctx يعطي ascent إضافياً لكل حركة (يحاكي فتحة/شدة/كسرة/ضمة فوق أو تحت).
    const ctxSmart = {
      font: '',
      measureText: (text: string) => {
        const marks = (text.match(/[ً-ٰٟ]/g) ?? []).length;
        return {
          width: text.length * 40,
          actualBoundingBoxAscent: 60 + marks * 15,
          actualBoundingBoxDescent: 20,
        };
      },
    };
    const bareLine = parseTokens('الأميركي يزور القاهرة اليوم').filter(isWord);
    const partialLine = parseTokens(PARTIAL).filter(isWord);
    const bareH = measuredLineHeight(ctxSmart, [bareLine], 80, 'IBM', false, 100, 0);
    const partialH = measuredLineHeight(ctxSmart, [partialLine], 80, 'IBM', false, 100, 0);
    // السطر الجزئي يجب أن يكون أعلى — الكلمة المشكّلة تفرض المسافة.
    expect(partialH).toBeGreaterThan(bareH);
  });
});
