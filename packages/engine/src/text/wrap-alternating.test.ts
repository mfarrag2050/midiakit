import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { wrapAlternating } from './wrap-alternating.js';
import { createSyntheticMeasurer } from './measurer.js';
import { isWord, type Token } from '@pf-mediakit/shared';

const measure = createSyntheticMeasurer(); // charWidth 0.5, spaceRatio 0.25, boldFactor 1.2

describe('wrapAlternating', () => {
  it('يحترم \\n اليدوي حرفياً بلا إعادة تقسيم', () => {
    const tokens = parseTokens('أ ب ج\nد هـ و');
    const r = wrapAlternating(tokens, 1000, 80, 40, false, 6, 0.6, 1.42, measure);

    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.map((t: Token) => (isWord(t) ? t.text : '\n'))).toEqual([
      'أ',
      'ب',
      'ج',
    ]);
    expect(r.lines[1]!.map((t: Token) => (isWord(t) ? t.text : '\n'))).toEqual([
      'د',
      'هـ',
      'و',
    ]);
  });

  it('lineHeight = round(fs × lineHeightRatio)', () => {
    const tokens = parseTokens('كلمة');
    const r = wrapAlternating(tokens, 1000, 80, 40, false, 6, 0.6, 1.42, measure);
    expect(r.lineHeight).toBe(Math.round(r.fontSize * 1.42));
  });

  it('في الوضع التلقائي: السطر الفردي ≤ boxW والزوجي ≤ boxW × shortRatio', () => {
    // 12 كلمة كافية لإنتاج عدة أسطر بالتناوب.
    const tokens = parseTokens(
      'مؤتمر السلام الدولي في العاصمة الأوروبية بروكسل ينطلق غداً صباحاً بمشاركة عربية'
    );
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapAlternating(
      tokens,
      boxW,
      80,
      40,
      false,
      6,
      shortRatio,
      1.42,
      measure
    );

    // سطر واحد لا يكفي لاختبار التناوب — نتأكد من وجود أكثر من سطر.
    expect(r.lines.length).toBeGreaterThanOrEqual(2);

    r.lines.forEach((line: readonly Token[], i: number) => {
      const w = measure.line(line, r.fontSize, false);
      const limit = i % 2 === 0 ? boxW : boxW * shortRatio;
      // نضيف 0.5 هامش لأمان القياس العائم — الحسابات صحيحة تماماً هنا لكن سياسة رياضية.
      expect(w).toBeLessThanOrEqual(limit + 0.5);
    });
  });

  it('يصغّر الخط بخطوة 2px حتى يسع في maxLines', () => {
    // نص طويل يجبر التصغير — نتأكد أن fs المُختار زوجي فارق عن maxFont بمضاعف 2.
    const tokens = parseTokens(
      'كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة'
    );
    const r = wrapAlternating(tokens, 400, 80, 40, false, 4, 0.6, 1.42, measure);
    expect(r.fontSize).toBeGreaterThanOrEqual(40);
    expect(r.fontSize).toBeLessThanOrEqual(80);
    expect((80 - r.fontSize) % 2).toBe(0);
  });

  it('الوضع اليدوي يختار أكبر fs يسع كل السطور في boxW (بخطوة 2)', () => {
    // 4 كلمات في السطر الأول ⇒ عرضه = 4·(2fs) + 3·(0.25fs) = 8.75fs.
    // مع boxW = 400: يجب أن يتقلّص من fs=80 إلى fs=44 (8.75·44=385 ≤ 400، 8.75·46=402.5 > 400).
    const tokens = parseTokens('بيوت بيوت بيوت بيوت\nسطر قصير');
    const boxW = 400;
    const r = wrapAlternating(
      tokens,
      boxW,
      80,
      40,
      false,
      6,
      0.6,
      1.42,
      measure
    );

    for (const line of r.lines) {
      expect(measure.line(line, r.fontSize, false)).toBeLessThanOrEqual(boxW + 0.5);
    }
    // fs نازل بخطوة 2 من maxFont
    expect((80 - r.fontSize) % 2).toBe(0);
    // اختير أكبر fs يسع: fs+2 يجب أن يكسر السقف
    const fsPlus = r.fontSize + 2;
    if (fsPlus <= 80) {
      const overflow = r.lines.some(
        (l) => measure.line(l, fsPlus, false) > boxW
      );
      expect(overflow).toBe(true);
    }
  });

  it('يرجع minFont لو تجاوز maxLines حتى عند أصغر خط', () => {
    // 40 كلمة قصيرة داخل boxW ضيّق ⇒ maxLines = 2 غير قابل للتحقيق.
    const text = Array.from({ length: 40 }, () => 'أ').join(' ');
    const tokens = parseTokens(text);
    const r = wrapAlternating(tokens, 200, 80, 40, false, 2, 0.6, 1.42, measure);
    expect(r.fontSize).toBe(40);
  });

  // ── invariants الحيوية للنمط الهرمي ─────────────────────
  //
  // wrapAlternating جشعة: تُبني الأسطر كلمةً كلمة، تُغلق السطر عند أول
  // كلمة تتجاوز الحد الحالي (boxW في الفرد، boxW×shortRatio في الزوج)،
  // ثم تفتح سطراً جديداً بمؤشر مقلوب. لا backtracking.
  //
  // النتيجة: النمط الهرمي المتناوب يتحقّق **عند حجم كلمات مناسب** — لا
  // ضمان مطلق. راجع الاختبار الأخير للدَين المعروف.

  it('12 كلمة بأحجام معتدلة تعطي تناوباً نظيفاً بلا سطر بكلمة واحدة', () => {
    // كلمات مختارة لتُظهر النمط الهرمي عند boxW=900, shortRatio=0.6:
    // القياس الصناعي: char=0.5·fs, space=0.25·fs.
    const tokens = parseTokens(
      'مؤتمر السلام الدولي يعقد قمة هامة في بروكسل الأسبوع القادم بمشاركة عربية'
    );
    const boxW = 900;
    const shortRatio = 0.6;
    const r = wrapAlternating(
      tokens,
      boxW,
      80,
      40,
      false,
      6,
      shortRatio,
      1.42,
      measure
    );

    // (١) لا سطر بكلمة واحدة.
    r.lines.forEach((line, i) => {
      expect(line.length, `السطر ${i + 1} بكلمة واحدة`).toBeGreaterThan(1);
    });

    // (٢) الأسطر الزوجية (index فردي: 1, 3, 5) ≤ boxW × shortRatio.
    r.lines.forEach((line, i) => {
      if (i % 2 === 1) {
        const w = measure.line(line, r.fontSize, false);
        expect(w).toBeLessThanOrEqual(boxW * shortRatio + 0.5);
      }
    });

    // (٣) الأسطر الفردية (index زوجي: 0, 2, 4) ≤ boxW.
    r.lines.forEach((line, i) => {
      if (i % 2 === 0) {
        const w = measure.line(line, r.fontSize, false);
        expect(w).toBeLessThanOrEqual(boxW + 0.5);
      }
    });
  });

  it('توثيق دَين معروف: كلمة عريضة (>50% من الحد القصير) قد تُنتج سطر كلمة واحدة', () => {
    // كلمات كل واحدة ~200 وحدة عند fs=80 (charWidth=0.5 ⇒ 5 حروف = 200).
    // shortLimit = 540. أي كلمتين متجاورتين تعطيان 200+20+200 = 420 ≤ 540
    // ⇒ التناوب النظيف. لا نُثبت هنا حالة الفشل، بل نوثّقها:
    //
    // إن كانت الكلمة الأولى في السطر القصير > (limit − space − أوسع كلمة تالية)،
    // تبقى وحيدة. هذا سلوك الأصل حرفياً (تحقيق: scripts/verify-wrap-fidelity.mjs)
    // وهو دَين مُوثَّق مع الكسر الدلالي في المرحلة 3.5.
    //
    // الاختبار يوثّق فقط أن wrapAlternating يقبل حالات النص التي يفشل فيها
    // الاعتماد على «لا سطر بكلمة واحدة» — لا يفرض ضمانة الأصل لم يقدّمها.
    const tokens = parseTokens(
      // 8 كلمات كل واحدة 7 حروف ⇒ عرض 280 عند fs=80.
      // shortLimit=540: كلمة أولى 280، +space 20 +280 = 580 > 540 ⇒ سطر بكلمة واحدة.
      'أسبوعاً كثيراً شهراً موعداً قصيراً طويلاً عديدة سنوات'
    );
    const r = wrapAlternating(tokens, 900, 80, 40, false, 6, 0.6, 1.42, measure);

    // نتحقّق فقط أن الخوارزمية أنتجت مخرجاً مقبولاً بنيوياً — كل الأسطر ≤ boxW.
    r.lines.forEach((line) => {
      expect(measure.line(line, r.fontSize, false)).toBeLessThanOrEqual(900.5);
    });

    // ملاحظة توثيقية: قد يكون فيه سطر بكلمة واحدة — هذا مقبول للنقل الأمين.
    // fix حقيقي يأتي عبر رتيب `breakPenalty` في المرحلة 3.5.
  });
});
