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

// ── measuredLineHeight — عقد الحدّ الأدنى (بعد BASELINE-A · 2026-09-11) ────

import type { FontMetrics } from '@pf-mediakit/shared';

describe('measuredLineHeight — من متريكات رأس الخطّ (L-73)', () => {
  // متريكات صناعية للاختبار — تُحاكي شكل OS/2 typo metrics في ملفّ حقيقي.
  const M_TINY: FontMetrics = { ascent: 100, descent: 50, unitsPerEm: 1000 };
  const M_ALMARAI: FontMetrics = { ascent: 905, descent: 211, unitsPerEm: 1000 };
  const M_IBM: FontMetrics = { ascent: 1085, descent: 415, unitsPerEm: 1000 };

  it('حين raw < minLineHeight — تعيد minLineHeight', () => {
    // fs=80, M_TINY ⇒ raw = (100+50) × 80/1000 = 12، أصغر من min=100
    const result = measuredLineHeight(M_TINY, 80, 100);
    expect(result).toBe(100);
  });

  it('حين raw > minLineHeight — تعيد raw × (1 + safetyPad) مُقرَّبة لأعلى', () => {
    // fs=80, Almarai ⇒ raw = (905+211) × 80/1000 = 89.28
    //   × 1.05 (pad افتراضي) = 93.744 ⇒ ceil = 94
    const result = measuredLineHeight(M_ALMARAI, 80, 50);
    expect(result).toBe(94);
  });

  it('safetyPad = 0 يُخرج ceil(raw) بلا حشوة', () => {
    // fs=100, IBM ⇒ raw = (1085+415) × 100/1000 = 150.0 ⇒ ceil = 150
    const result = measuredLineHeight(M_IBM, 100, 50, 0);
    expect(result).toBe(150);
  });

  it('الطرفان يحسبان النفسه من نفس المدخل (خاصّية BASELINE-A البنيويّة)', () => {
    // نفس المتريكات + نفس fs ⇒ نفس النتيجة — لا فرق بين Chrome و skia.
    // يُختبَر هنا: الدالة deterministic لا تعتمد على ctx أو font runtime.
    const a = measuredLineHeight(M_ALMARAI, 96, 100);
    const b = measuredLineHeight(M_ALMARAI, 96, 100);
    expect(a).toBe(b);
  });

  it('unitsPerEm يُطبَّق بشكل صحيح (توافق TTF 1000 و OpenType 2048)', () => {
    const m1000: FontMetrics = { ascent: 1000, descent: 200, unitsPerEm: 1000 };
    // نسبة 1.2 · fs=100 ⇒ raw=120 · pad 5% = 126.0 · ceil = 126
    expect(measuredLineHeight(m1000, 100, 50)).toBe(126);
    // OpenType بنفس النسبة يعطي نتيجة مقاربة (فرق تقريب دقيق واحد بكسل
    // بسبب unitsPerEm أكبر). القيمة الدقيقة: (2458×100/2048) × 1.05 =
    // 126.017 ⇒ ceil = 127.
    const m2048: FontMetrics = { ascent: 2048, descent: 410, unitsPerEm: 2048 };
    expect(measuredLineHeight(m2048, 100, 50)).toBe(127);
  });
});

// **ملحوظة v1 · TASHKIL-OFF:** الاختبار السابق «measuredLineHeight يعكس
// ارتفاع الكلمة المشكّلة» رُفع لأنّ المسار البكسليّ لم يعد يُستدعى من
// `measuredLineHeight` (تشكيل مؤجَّل عن v1). حين يعود التشكيل في v2،
// يحتاج مصدراً متطابقاً عبر المنصّات (راجع تذكرة `TASHKIL-METRICS-UNIFY`
// المقترَحة). البنية الحاليّة تعرف حدّها بصراحة.

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

  // **الاختبار السابق «measuredLineHeight يعكس ارتفاع الكلمة المشكّلة»
  // رُفع** — كان يعتمد قياس ctx.measureText الذي لم يعد المصدر (BASELINE-A ·
  // 2026-09-11). في v1 التشكيل مطفأ (TASHKIL-OFF 2026-09-10)، والبنية
  // الحاليّة (font-header metrics) لا تُميّز نصّاً بتشكيل عن آخر بلا
  // تشكيل — ترجع نفس lineHeight للاثنين. الحلّ في v2 (راجع
  // `TASHKIL-METRICS-UNIFY` المقترَحة).
});
