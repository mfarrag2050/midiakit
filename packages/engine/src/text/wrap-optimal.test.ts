import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { wrapOptimal } from './wrap-optimal.js';
import { createSyntheticMeasurer, type Measurer } from './measurer.js';
import { isWord, type Token } from '@pf-mediakit/shared';

// Measurer الصناعي: char=0.5·fs, space=0.25·fs — يجعل الأرقام قابلة للتحقّق يدوياً.
const measure: Measurer = createSyntheticMeasurer();

// أدوات مقياس مشتركة للتحقّق من المتغيّرات الثابتة
const linePosLimit = (i: number, boxW: number, shortRatio: number): number =>
  i % 2 === 0 ? boxW : boxW * shortRatio;

interface Invariants {
  readonly boxW: number;
  readonly shortRatio: number;
  readonly maxLines: number;
  /** حدّ أدنى للملء نسبةً للحدّ المستهدف — الافتراضي 0.85 (±15%). */
  readonly minFillRatio?: number;
  /** يُسمح للسطر الأخير أن يكون أقل ملءاً (لكن ≥ orphanFloor). */
  readonly lastLineMinFill?: number;
}

function assertClean(
  r: { fontSize: number; lines: readonly (readonly Token[])[] },
  inv: Invariants
): void {
  const { boxW, shortRatio, maxLines } = inv;
  const minFill = inv.minFillRatio ?? 0.85;
  const lastFill = inv.lastLineMinFill ?? 0.4;

  expect(r.lines.length).toBeLessThanOrEqual(maxLines);
  expect(r.lines.length).toBeGreaterThan(0);

  r.lines.forEach((line, i) => {
    // (١) لا سطر بكلمة واحدة
    expect(line.length, `السطر ${i + 1} بكلمة واحدة`).toBeGreaterThan(1);

    const w = measure.line(line, r.fontSize, false);
    const limit = linePosLimit(i, boxW, shortRatio);

    // (٢) عرض ضمن الحدّ الصلب
    expect(w, `السطر ${i + 1} يتجاوز الحدّ`).toBeLessThanOrEqual(limit + 0.5);

    // (٣) ملء ضمن ±15% من الحدّ المستهدف (السطر الأخير مستثنى قليلاً)
    const isLast = i === r.lines.length - 1;
    const floor = isLast ? lastFill : minFill;
    const fill = w / limit;
    expect(
      fill,
      `السطر ${i + 1} فارغ جداً (${(fill * 100).toFixed(0)}% من الحدّ)`
    ).toBeGreaterThanOrEqual(floor);
  });

  // (٤) السطر الأخير ليس يتيماً — لا كلمة واحدة، لا ملء < 40%
  const lastLine = r.lines[r.lines.length - 1]!;
  expect(lastLine.length, 'السطر الأخير يتيم بكلمة واحدة').toBeGreaterThan(1);
  const lastW = measure.line(lastLine, r.fontSize, false);
  const lastLimit = linePosLimit(r.lines.length - 1, boxW, shortRatio);
  expect(lastW / lastLimit).toBeGreaterThanOrEqual(lastFill);
}

describe('wrapOptimal — سلوك أساسي', () => {
  it('يحترم \\n اليدوي كما wrapAlternating', () => {
    const tokens = parseTokens('أ ب ج\nد هـ و');
    const r = wrapOptimal(tokens, 1000, 80, 40, false, 6, 0.6, 1.42, measure);

    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.map((t: Token) => (isWord(t) ? t.text : '\n'))).toEqual(
      ['أ', 'ب', 'ج']
    );
    expect(r.lines[1]!.map((t: Token) => (isWord(t) ? t.text : '\n'))).toEqual(
      ['د', 'هـ', 'و']
    );
  });

  it('lineHeight = round(fs × lineHeightRatio)', () => {
    const tokens = parseTokens('كلمة أخرى');
    const r = wrapOptimal(tokens, 1000, 80, 40, false, 6, 0.6, 1.42, measure);
    expect(r.lineHeight).toBe(Math.round(r.fontSize * 1.42));
  });

  it('السطور تحترم النمط الهرمي: فردي ≤ boxW، زوجي ≤ boxW × shortRatio', () => {
    const tokens = parseTokens(
      'مؤتمر السلام الدولي في العاصمة الأوروبية بروكسل ينطلق غداً بمشاركة عربية موسّعة'
    );
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);

    r.lines.forEach((line, i) => {
      const w = measure.line(line, r.fontSize, false);
      const limit = linePosLimit(i, boxW, shortRatio);
      expect(w).toBeLessThanOrEqual(limit + 0.5);
    });
  });
});

describe('wrapOptimal — ضمانات لا تتحقّق في wrapAlternating', () => {
  it('النص الذي كان يُنتج سطر كلمة واحدة في الجشِعة يُنتج تناوباً نظيفاً', () => {
    // نفس النص من preview.mjs — «الاستهداف» كانت وحدها بحجم fs=80 عند
    // wrapAlternating. الأمثلي يوزّع الكلمات ليتجنّب الإفراد.
    const tokens = parseTokens(
      'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع'
    );
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);

    // لا سطر بكلمة واحدة — الشرط الحاسم
    r.lines.forEach((line, i) => {
      expect(line.length, `السطر ${i + 1} بكلمة واحدة`).toBeGreaterThan(1);
    });

    // لا سطر أخير يتيم
    const last = r.lines[r.lines.length - 1]!;
    expect(last.length).toBeGreaterThan(1);
  });

  it('عنوان قصير (٦ كلمات) — سطران متوازنان بلا إفراد', () => {
    const tokens = parseTokens('اجتماع طارئ لوزراء الخارجية في القاهرة اليوم');
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);

    r.lines.forEach((line, i) => {
      expect(line.length, `السطر ${i + 1} بكلمة واحدة`).toBeGreaterThan(1);
    });
    expect(r.lines.length).toBeLessThanOrEqual(6);
  });
});

describe('wrapOptimal — نمط منتظم على ثلاثة نصوص مختلفة الأطوال', () => {
  const boxW = 900;
  const shortRatio = 0.6;

  it('نصّ قصير (٧ كلمات)', () => {
    const tokens = parseTokens(
      'إعلان رسمي عن انطلاق مفاوضات السلام الجديدة'
    );
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);
    assertClean(r, { boxW, shortRatio, maxLines: 6, minFillRatio: 0.6 });
  });

  it('نصّ متوسط (١٢ كلمة)', () => {
    const tokens = parseTokens(
      'مؤتمر السلام الدولي يعقد قمة هامة في بروكسل الأسبوع القادم بمشاركة عربية موسّعة'
    );
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);
    assertClean(r, { boxW, shortRatio, maxLines: 6, minFillRatio: 0.6 });
  });

  it('نصّ طويل (١٦ كلمة)', () => {
    const tokens = parseTokens(
      'وزراء الخارجية العرب يجتمعون في القاهرة لبحث آخر التطورات الميدانية في المنطقة وسبل التنسيق المشترك دولياً'
    );
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, shortRatio, 1.42, measure);
    assertClean(r, { boxW, shortRatio, maxLines: 6, minFillRatio: 0.6 });
  });
});

describe('wrapOptimal — حالات حدّية', () => {
  it('كلمة واحدة فقط: تُرجع سطراً واحداً (لا ذنب لها)', () => {
    const tokens = parseTokens('عاجل');
    const r = wrapOptimal(tokens, 900, 80, 40, false, 6, 0.6, 1.42, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.length).toBe(1);
  });

  it('نصّ فارغ يُرجع لا أسطر', () => {
    const tokens = parseTokens('');
    const r = wrapOptimal(tokens, 900, 80, 40, false, 6, 0.6, 1.42, measure);
    expect(r.lines).toHaveLength(0);
  });

  it('نصّ يتجاوز maxLines عند minFont: يتراجع بميزانية موسّعة', () => {
    // 40 كلمة قصيرة في boxW=200 — لا يسع في 2 سطر بأي حجم
    const text = Array.from({ length: 40 }, () => 'أب').join(' ');
    const tokens = parseTokens(text);
    const r = wrapOptimal(tokens, 200, 80, 40, false, 2, 0.6, 1.42, measure);
    // يجب أن يعود بشيء صالح: fs=minFont وسطور تسع الكلمات (قد يتجاوز 2)
    expect(r.fontSize).toBe(40);
    expect(r.lines.length).toBeGreaterThan(0);
    // كل سطر ضمن الحدّ الصلب لموقعه
    r.lines.forEach((line, i) => {
      const w = measure.line(line, r.fontSize, false);
      const limit = linePosLimit(i, 200, 0.6);
      expect(w).toBeLessThanOrEqual(limit + 0.5);
    });
  });
});
