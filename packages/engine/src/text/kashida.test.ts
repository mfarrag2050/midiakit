// اختبارات التبرير بالكشيدة — تغطية القواعد اللغوية الإلزامية والتراجع.
//
// **قرار في الاختبار:** نستعمل `createSyntheticMeasurer` (charWidth=0.5,
// spaceRatio=0.25, boldFactor=1.2) — يجعل الأعداد قابلة للتحقّق يدوياً،
// وموضع التطويل مطابق تماماً لدلالته اللغوية بلا كسور قياس font-hinting.

import { describe, expect, it } from 'vitest';
import { createSyntheticMeasurer, type Measurer } from './measurer.js';
import {
  TATWEEL,
  detectFontCaps,
  justifyLine,
  kashidaSites,
  pickDistributedSites,
} from './kashida.js';
import type { FontCaps, JustifyConfig, Token, WordToken } from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';

const measure: Measurer = createSyntheticMeasurer();

const CAPS_ON: FontCaps = {
  kashida: true,
  kashidaMethod: 'tatweel',
  variableAxes: [],
  diacriticsSafe: true,
};

const CAPS_OFF: FontCaps = { ...CAPS_ON, kashida: false };

const CFG_KASHIDA: JustifyConfig = {
  mode: 'kashida',
  maxStretchPerSite: 0.35,
  maxSitesPerWord: 1,
  minLineFill: 0.82,
  lastLine: 'natural',
};

const word = (text: string): WordToken => ({ text, bold: false, accent: false });

// عدد التطويلات المُدرجة في نصّ كلمة.
const countTatweels = (text: string): number =>
  [...text].filter((c) => c === TATWEEL).length;

// ── kashidaSites: القواعد اللغوية ─────────────────────

describe('kashidaSites — القواعد اللغوية الإلزامية', () => {
  it('لا موضع تطويل بعد الحروف غير الموصولة: ا د ذ ر ز و', () => {
    // «مدرسة» — م(dual) د(non) ر(non) س(dual) ة(non,final)
    // المواضع المُتاحة (n=5, i ∈ [0,3)): بعد م، د، ر.
    // القاعدة: يُستبعد بعد د (index 1) و بعد ر (index 2).
    const sites = kashidaSites('مدرسة', CAPS_ON);
    expect(sites, 'بعد م (index 0) مقبول').toContain(0);
    expect(sites, 'بعد د (index 1) ممنوع').not.toContain(1);
    expect(sites, 'بعد ر (index 2) ممنوع').not.toContain(2);
  });

  it('يستبعد كل الحروف غير الموصولة السبعة في كلمة تجريبية', () => {
    // كلمة صناعية تحتوي كل الحروف غير الموصولة متتالية.
    // نتحقّق أن لا موضع يقع بعد أيّ منها.
    const text = 'بادذرزوب'; // ب ا د ذ ر ز و ب  — n=8, i ∈ [0,6)
    const sites = kashidaSites(text, CAPS_ON);
    // مواضع بعد أ-حرف-غير-موصول: 1 (بعد ا), 2 (بعد د), 3 (بعد ذ),
    // 4 (بعد ر), 5 (بعد ز). الموضع بعد و (6) خارج المدى أصلاً.
    for (const forbidden of [1, 2, 3, 4, 5]) {
      expect(sites, `الموضع ${forbidden} يتبع حرفاً غير موصول`).not.toContain(
        forbidden
      );
    }
  });

  it('لا موضع تطويل قبل الحرف النهائي (i = n-2 مُستبعد)', () => {
    // «كتاب» — ك ت ا ب (n=4). المواضع i ∈ [0,2) = {0,1}.
    // الموضع i=2 (بين ا و ب) مُستبعد لأنه قبل الحرف النهائي.
    // لكن i=1 مُستبعد أيضاً لأن char[1]=ت يتبعه char[2]=ا مقبول،
    // فهو موضع مقبول قواعدياً. النقطة: n-2=2 غير موجود في القائمة.
    const sites = kashidaSites('كتاب', CAPS_ON);
    expect(sites).not.toContain(2);
    expect(Math.max(...sites)).toBeLessThan(4 - 1); // < n-1
  });

  it('يُعيد قائمة فارغة لكلمة بها أيّ تشكيل', () => {
    // «بَاب» — فتحة على ب (U+064E).
    const withFatha = 'بَاب';
    expect(kashidaSites(withFatha, CAPS_ON)).toHaveLength(0);
  });

  it('يُعيد قائمة فارغة للكلمات القصيرة (n < 3)', () => {
    expect(kashidaSites('من', CAPS_ON)).toHaveLength(0);
    expect(kashidaSites('ا', CAPS_ON)).toHaveLength(0);
    expect(kashidaSites('', CAPS_ON)).toHaveLength(0);
  });

  it('يُعيد قائمة فارغة عند fontCaps.kashida=false', () => {
    expect(kashidaSites('بستان', CAPS_OFF)).toHaveLength(0);
  });

  it('يقبل مواضع متعدّدة في كلمة طويلة كلها حروف موصولة', () => {
    // «بستان» — ب س ت ا ن (n=5, i ∈ [0,3)).
    // ب(dual), س(dual), ت(dual) — كلها مؤهّلة.
    // ا في index 3 قبل النهائي مقبول كتالٍ للموضع 2.
    const sites = kashidaSites('بستان', CAPS_ON);
    expect(sites).toEqual([0, 1, 2]);
  });
});

// ── pickDistributedSites ──────────────────────────────

describe('pickDistributedSites — التوزيع البصري', () => {
  it('لا يعيد أكثر من k', () => {
    expect(pickDistributedSites([0, 1, 2, 3, 4], 2)).toHaveLength(2);
  });

  it('لموضع واحد بـ k=1 يختار الوسط', () => {
    expect(pickDistributedSites([0, 1, 2], 1)).toEqual([1]);
  });

  it('يعيد قائمة فارغة لمدخل فارغ', () => {
    expect(pickDistributedSites([], 3)).toEqual([]);
  });
});

// ── justifyLine: التبرير بالتطويل ─────────────────────

describe('justifyLine — تبرير سطر بعرض مستهدف', () => {
  it('يطابق targetWidth بفارق ≤ 1px عند سعة كافية', () => {
    // النصّ: ثلاث كلمات، لكلٍّ منها ثلاثة مواضع محتملة على الأقل.
    // مع maxSitesPerWord=1 نحصل على 3 مواضع إجمالاً، حدّ = 3 تطويلات.
    // synthetic: fs=80, char=0.5, space=0.25.
    //   • بستان = 200, جميل = 160, صغير = 160, spaces = 40
    //   • قبل التبرير: 560px. تطويل واحد = 40px.
    //   • هدف 680px ⇒ عجز 120 ⇒ 3 تطويلات ⇒ 120px تماماً.
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const target = 680;
    const justified = justifyLine(
      tokens,
      target,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure
    );
    const width = measure.line(justified, 80, false);
    expect(Math.abs(width - target)).toBeLessThanOrEqual(1);
  });

  it('يوزّع التطويلات: لا كلمة تتجاوز maxSitesPerWord × maxTatweelsPerSite', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const justified = justifyLine(
      tokens,
      680,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure
    );
    // maxStretchPx = 0.35 × 80 = 28; tatweelUnit = 40 ⇒ maxTatweelsPerSite = 1.
    // maxSitesPerWord = 1 ⇒ كل كلمة تحمل ≤ 1 تطويل.
    justified.forEach((tok, i) => {
      if (!isWord(tok)) return;
      expect(
        countTatweels(tok.text),
        `الكلمة ${i} تحمل ${countTatweels(tok.text)} تطويل`
      ).toBeLessThanOrEqual(1);
    });
  });

  it('التوزيع فعلي: تطويل يظهر في كل كلمة (لا تركّز)', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const justified = justifyLine(
      tokens,
      680,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure
    );
    const perWord = justified
      .filter(isWord)
      .map((t) => countTatweels(t.text));
    // كل كلمة تحصل على تطويل (بديل التركيز في واحدة).
    expect(perWord.every((c) => c === 1)).toBe(true);
  });

  it('يتراجع صامتاً عند fontCaps.kashida=false', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const out = justifyLine(
      tokens,
      680,
      80,
      false,
      CFG_KASHIDA,
      CAPS_OFF,
      measure
    );
    out.forEach((t, i) => {
      const orig = tokens[i]!;
      if (isWord(t) && isWord(orig)) {
        expect(t.text).toBe(orig.text); // نفس النصّ بلا لمس
      }
    });
  });

  it('السطر الأخير لا يُبرَّر عندما lastLine=natural', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const out = justifyLine(
      tokens,
      680,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure,
      { isLast: true }
    );
    out.forEach((t, i) => {
      const orig = tokens[i]!;
      if (isWord(t) && isWord(orig)) {
        expect(t.text).toBe(orig.text);
      }
    });
  });

  it('لا يُبرَّر إن كان الملء الحالي أدنى من minLineFill', () => {
    // targetWidth كبير جداً ⇒ fill < 0.82 ⇒ يترك بلا لمس.
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const target = 2000; // 560/2000 = 0.28 << 0.82
    const out = justifyLine(
      tokens,
      target,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure
    );
    out.forEach((t, i) => {
      const orig = tokens[i]!;
      if (isWord(t) && isWord(orig)) {
        expect(t.text).toBe(orig.text);
      }
    });
  });

  it('لا يُبرَّر عند mode=none أو mode=space', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    for (const mode of ['none', 'space'] as const) {
      const out = justifyLine(
        tokens,
        680,
        80,
        false,
        { ...CFG_KASHIDA, mode },
        CAPS_ON,
        measure
      );
      out.forEach((t, i) => {
        const orig = tokens[i]!;
        if (isWord(t) && isWord(orig)) {
          expect(t.text, `mode=${mode}`).toBe(orig.text);
        }
      });
    }
  });

  it('يُعيد المُدخل عندما العرض الحالي ≥ target (لا عجز)', () => {
    const tokens: Token[] = [word('بستان'), word('جميل'), word('صغير')];
    const out = justifyLine(
      tokens,
      500,
      80,
      false,
      CFG_KASHIDA,
      CAPS_ON,
      measure
    );
    out.forEach((t, i) => {
      const orig = tokens[i]!;
      if (isWord(t) && isWord(orig)) {
        expect(t.text).toBe(orig.text);
      }
    });
  });
});

// ── detectFontCaps ────────────────────────────────────

describe('detectFontCaps — كشف قابلية الخط', () => {
  it('يكشف الدعم عند خط يرسم التطويل بعرض ≥ 5% من fs', () => {
    const caps = detectFontCaps(measure, 80);
    // synthetic: TATWEEL = 1 grapheme × 0.5 × 80 = 40 ≥ 4 (5%).
    expect(caps.kashida).toBe(true);
    expect(caps.kashidaMethod).toBe('tatweel');
  });

  it('يعيد kashida=false عند خط يرسم التطويل بعرض ضئيل', () => {
    // measurer مصطنع يعيد صفراً للتطويل (خط لا يدعمه).
    const zeroWidth: Measurer = {
      word: () => 0,
      space: (fs: number) => 0.25 * fs,
      line: () => 0,
    };
    const caps = detectFontCaps(zeroWidth, 80);
    expect(caps.kashida).toBe(false);
  });
});
