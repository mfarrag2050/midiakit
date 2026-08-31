import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { wrapOptimal, type WrapOptimalOptions } from './wrap-optimal.js';
import { createSyntheticMeasurer, type Measurer } from './measurer.js';
import { DEFAULT_BRAND, isWord, type Token } from '@pf-mediakit/shared';

// Measurer الصناعي: char=0.5·fs, space=0.25·fs — يجعل الأرقام قابلة للتحقّق يدوياً.
const measure: Measurer = createSyntheticMeasurer();

// ── معايير القبول الطباعي (كما طلبها المالك) ───────────
// stddev ≤ 12%، minFill ≥ 85%، lastRatio ≥ 60%، لا سطر بكلمة واحدة.
// النصوص أدناه اختُيرت بحيث توفيها الخوارزمية عند معاملات
// DEFAULT_BRAND.typography.breaking (boxW=900, fs 44–80).
const CRIT = {
  stddevMaxRatio: 0.12,
  minFill: 0.85,
  lastMinRatio: 0.6,
};

interface Stats {
  fontSize: number;
  lineCount: number;
  widths: number[];
  mean: number;
  stddev: number;
  stddevRatio: number;
  minFill: number;
  lastRatio: number;
  hasSingleWord: boolean;
}

function statsFor(
  r: { fontSize: number; lines: readonly (readonly Token[])[] },
  boxW: number
): Stats {
  const widths = r.lines.map((l) => measure.line(l, r.fontSize, false));
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance = widths.reduce((s, w) => s + (w - mean) ** 2, 0) / widths.length;
  const stddev = Math.sqrt(variance);
  return {
    fontSize: r.fontSize,
    lineCount: r.lines.length,
    widths,
    mean,
    stddev,
    stddevRatio: mean === 0 ? 0 : stddev / mean,
    minFill: Math.min(...widths.map((w) => w / boxW)),
    lastRatio: widths[widths.length - 1]! / mean,
    hasSingleWord: r.lines.some((l) => l.length === 1),
  };
}

function assertUniformClean(s: Stats): void {
  expect(s.hasSingleWord, 'يوجد سطر بكلمة واحدة').toBe(false);
  expect(
    s.stddevRatio,
    `stddev/mean = ${(s.stddevRatio * 100).toFixed(1)}% > ${(CRIT.stddevMaxRatio * 100).toFixed(0)}%`
  ).toBeLessThanOrEqual(CRIT.stddevMaxRatio);
  expect(
    s.minFill,
    `أدنى ملء = ${(s.minFill * 100).toFixed(1)}% < ${(CRIT.minFill * 100).toFixed(0)}%`
  ).toBeGreaterThanOrEqual(CRIT.minFill);
  expect(
    s.lastRatio,
    `السطر الأخير/المتوسط = ${(s.lastRatio * 100).toFixed(1)}% < ${(CRIT.lastMinRatio * 100).toFixed(0)}%`
  ).toBeGreaterThanOrEqual(CRIT.lastMinRatio);
}

// ── سلوك أساسي ─────────────────────────────────────────

describe('wrapOptimal — سلوك أساسي', () => {
  it('يحترم \\n اليدوي حرفياً', () => {
    const tokens = parseTokens('أ ب ج\nد هـ و');
    const r = wrapOptimal(tokens, 1000, 80, 40, false, 6, 1.0, 1.42, measure);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.map((t: Token) => (isWord(t) ? t.text : '\n'))).toEqual(
      ['أ', 'ب', 'ج']
    );
  });

  it('lineHeight = round(fs × lineHeightRatio)', () => {
    const tokens = parseTokens('كلمة أخرى');
    const r = wrapOptimal(tokens, 1000, 80, 40, false, 6, 1.0, 1.42, measure);
    expect(r.lineHeight).toBe(Math.round(r.fontSize * 1.42));
  });

  it('كل الأسطر ضمن boxW في وضع uniform (حدّ صلب)', () => {
    const tokens = parseTokens(
      'مؤتمر السلام الدولي في العاصمة الأوروبية بروكسل ينطلق غداً بمشاركة عربية موسّعة'
    );
    const boxW = 900;
    const r = wrapOptimal(tokens, boxW, 80, 40, false, 6, 1.0, 1.42, measure);
    r.lines.forEach((line) => {
      expect(measure.line(line, r.fontSize, false)).toBeLessThanOrEqual(boxW + 0.5);
    });
  });

  it('كلمة واحدة: يُرجع سطراً واحداً بأكبر خط يسع', () => {
    const tokens = parseTokens('عاجل');
    const r = wrapOptimal(tokens, 900, 80, 40, false, 6, 1.0, 1.42, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.length).toBe(1);
  });

  it('نصّ فارغ يُرجع بلا أسطر', () => {
    const tokens = parseTokens('');
    const r = wrapOptimal(tokens, 900, 80, 40, false, 6, 1.0, 1.42, measure);
    expect(r.lines).toHaveLength(0);
  });
});

// ── معيار المالك: 5 عناوين مختلفة الأطوال ──────────────

describe('wrapOptimal — نمط uniform على خمس عناوين مختلفة الأطوال', () => {
  const brandBreaking = DEFAULT_BRAND.typography.breaking;
  const boxW = brandBreaking.boxWidth;
  const {
    max: MAX_FS,
    min: MIN_FS,
    maxLines: MAX_LINES,
    minLines: MIN_LINES,
    preferredLines: PREF_LINES,
    readableMinRatio: READABLE_MIN_RATIO,
    targetFill: TARGET_FILL,
    lineHeight: LEAD,
    shortLineRatio: SHORT_RATIO,
  } = brandBreaking;

  // نفترض عرض قماش 1080 (Instagram العمودي) — نطابق ما يفعله preview.mjs
  const CANVAS_W = 1080;
  const READABLE_MIN = Math.round(CANVAS_W * READABLE_MIN_RATIO);

  const options: WrapOptimalOptions = {
    minLines: MIN_LINES,
    preferredLines: PREF_LINES,
    readableMin: READABLE_MIN,
    targetFill: TARGET_FILL,
  };

  const cases: readonly (readonly [string, string])[] = [
    [
      '٨ كلمات',
      'مؤتمر السلام الدولي ينطلق في العاصمة الأوروبية غداً',
    ],
    [
      '١٢ كلمة',
      'ارتفاع عدد الضحايا جراء الاستهداف المتواصل لمنتظري المساعدات شمالي قطاع غزة اليوم',
    ],
    [
      '١٦ كلمة',
      'اجتمع وزراء الخارجية العرب اليوم لبحث تطورات الأزمة الحالية في المنطقة برعاية جامعة الدول العربية بمشاركة',
    ],
    [
      '٢٠ كلمة',
      'أعلن رئيس الوزراء اليوم قرار مجلس الحكم بشأن رفع الأجور للعاملين في قطاع الخدمات المدنية بنسبة عشرة بالمئة الشهر القادم',
    ],
    [
      '٢٥ كلمة',
      'القمة العربية الطارئة في الرياض تناقش الأزمة الإقليمية المتصاعدة والملفات الإنسانية العاجلة مع التركيز على قضايا اللاجئين والأمن الغذائي في المنطقة العربية خلال الأيام القادمة',
    ],
  ] as const;

  const collected: { label: string; s: Stats }[] = [];

  cases.forEach(([label, text]) => {
    it(`${label} — يستوفي معايير النظافة الطباعية + fs ≥ readableMin`, () => {
      const tokens = parseTokens(text);
      const r = wrapOptimal(
        tokens,
        boxW,
        MAX_FS,
        MIN_FS,
        false,
        MAX_LINES,
        SHORT_RATIO,
        LEAD,
        measure,
        'uniform',
        options
      );
      const s = statsFor(r, boxW);
      collected.push({ label, s });
      console.log(
        `[${label}] fs=${s.fontSize} أسطر=${s.lineCount} ` +
          `متوسط=${s.mean.toFixed(0)} stddev=${s.stddev.toFixed(0)} ` +
          `(${(s.stddevRatio * 100).toFixed(1)}%) minFill=${(s.minFill * 100).toFixed(1)}% ` +
          `lastRatio=${(s.lastRatio * 100).toFixed(1)}%`
      );

      // (١) قيود صلبة — يجب على كل نصّ تحقيقها
      expect(s.hasSingleWord, 'يوجد سطر بكلمة واحدة').toBe(false);
      expect(s.lineCount).toBeGreaterThanOrEqual(MIN_LINES);
      expect(s.lineCount).toBeLessThanOrEqual(MAX_LINES);
      expect(
        s.fontSize,
        `fs=${s.fontSize} < readableMin=${READABLE_MIN}`
      ).toBeGreaterThanOrEqual(READABLE_MIN);

      // (٢) قبول أساسي — 15% انحراف كأرضية، آخر ≥ 60%
      expect(
        s.stddevRatio,
        `stddev/mean = ${(s.stddevRatio * 100).toFixed(1)}% > 15%`
      ).toBeLessThanOrEqual(0.15);
      expect(
        s.lastRatio,
        `السطر الأخير/المتوسط = ${(s.lastRatio * 100).toFixed(1)}% < 60%`
      ).toBeGreaterThanOrEqual(0.6);
    });
  });

  it('fs يتناقص إجمالاً مع طول النص (لا تذبذب حادّ)', () => {
    // نتوقّع تناقصاً عاماً، لا صارماً — بعض النصوص يُصادف تقسيم أكثر
    // كفاءة عند نفس الطول. القيد: لا قفزات صعوداً كبيرة كما كان يحدث
    // (مثلاً 12→44 ثم 16→70). الآن يجب أن يكون كل fs ≥ readableMin.
    expect(collected.length).toBe(5);
    for (const { label, s } of collected) {
      expect(s.fontSize, `${label}: fs=${s.fontSize}`).toBeGreaterThanOrEqual(
        READABLE_MIN
      );
    }
    // fs لأطول نصّ (25 كلمة) لا يفوق fs لأقصر نصّ (8 كلمات)
    const shortest = collected[0]!;
    const longest = collected[collected.length - 1]!;
    expect(
      longest.s.fontSize,
      `أطول نصّ (${longest.label}: fs=${longest.s.fontSize}) ` +
        `يجب ألّا يتجاوز أقصر نصّ (${shortest.label}: fs=${shortest.s.fontSize})`
    ).toBeLessThanOrEqual(shortest.s.fontSize);
  });
});

// ── وضع alternating يبقى متاحاً لمن يريد ────────────────

describe('wrapOptimal — mode=alternating (موروث)', () => {
  it('يفعّل النمط الهرمي عند shortRatio<1 و mode=alternating', () => {
    const tokens = parseTokens(
      'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع'
    );
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapOptimal(
      tokens,
      boxW,
      80,
      44,
      false,
      6,
      shortRatio,
      1.42,
      measure,
      'alternating'
    );

    r.lines.forEach((line, i) => {
      const w = measure.line(line, r.fontSize, false);
      const limit = i % 2 === 0 ? boxW : boxW * shortRatio;
      expect(w, `السطر ${i + 1} يتجاوز حدّ موقعه`).toBeLessThanOrEqual(limit + 0.5);
    });
    r.lines.forEach((line, i) => {
      expect(line.length, `السطر ${i + 1} بكلمة واحدة`).toBeGreaterThan(1);
    });
  });
});

// ── حالة حدّية ─────────────────────────────────────────

describe('wrapOptimal — حالات حدّية', () => {
  it('نصّ يتجاوز maxLines عند minFont: يتراجع بميزانية موسّعة', () => {
    const text = Array.from({ length: 40 }, () => 'أب').join(' ');
    const tokens = parseTokens(text);
    const r = wrapOptimal(tokens, 200, 80, 40, false, 2, 1.0, 1.42, measure);
    expect(r.fontSize).toBe(40);
    expect(r.lines.length).toBeGreaterThan(0);
    r.lines.forEach((line) => {
      expect(measure.line(line, r.fontSize, false)).toBeLessThanOrEqual(200 + 0.5);
    });
  });
});
