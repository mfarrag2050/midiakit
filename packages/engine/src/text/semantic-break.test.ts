// اختبارات breakPenalty — الجزء (أ) من مواصفة الكسر الدلالي.
//
// **مجال الاختبار:** ما يمكن تحقيقه بالقوائم المغلقة فقط
// (particles.json) دون تنزيل الموارد الخارجية (titles/entities/places).
// الحالات التي تحتاج تلك الموارد مؤجَّلة صراحةً للجزء (ب) — انظر
// معلَّقة `[stage-b]` أدناه.
//
// **قواعد الاختبار:**
//   • `breakPenalty(t, i)` = عقوبة الكسر **قبل** `t[i]`.
//   • `i = 0` أو `i >= t.length` ⇒ Infinity (لا كسر ممكن).
//   • Infinity = لا يُفصل (يُستبعد من التقسيمات المرشّحة).
//   • 1000 = رابطة عرفية قوية.
//   • 400 = رابطة متوسطة.
//   • 0 = لا مانع دلالي.

import { describe, expect, it } from 'vitest';
import { parseTokens } from './parse-tokens.js';
import { loadDefaultLexicon } from '../arabic-lexicon/index.js';
import {
  breakPenalty,
  BREAK_INFINITY,
  BREAK_STRONG,
  BREAK_MEDIUM,
  BREAK_NEUTRAL,
} from './semantic-break.js';

const lex = loadDefaultLexicon();
const tokens = (s: string) => parseTokens(s);

// ── Infinity — أدوات ملازمة ───────────────────────

describe('breakPenalty — Infinity: أدوات ملازمة لما بعدها', () => {
  it('«في قطاع غزة» — لا كسر بعد «في»', () => {
    const t = tokens('في قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«الذين ينتظرون المساعدات» — لا كسر بعد «الذين»', () => {
    const t = tokens('الذين ينتظرون المساعدات');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«خلال الأسبوع الماضي» — لا كسر بعد «خلال» (kwsi)', () => {
    const t = tokens('خلال الأسبوع الماضي');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«لم يذهب أحد» — لا كسر بعد «لم» (نفي)', () => {
    const t = tokens('لم يذهب أحد');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«هل تعلم القصة» — لا كسر بعد «هل» (استفهام)', () => {
    const t = tokens('هل تعلم القصة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«كان الرجل يقرأ» — لا كسر بعد «كان» (ناسخ)', () => {
    const t = tokens('كان الرجل يقرأ');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«إن الطالب مجتهد» — لا كسر بعد «إن» (ناسخ حرفي)', () => {
    const t = tokens('إن الطالب مجتهد');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«إلا الطلاب المتفوقين» — لا كسر بعد «إلا» (استثناء)', () => {
    const t = tokens('إلا الطلاب المتفوقين');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });
});

// ── Infinity — عدد + معدود ─────────────────────

describe('breakPenalty — Infinity: عدد + معدود', () => {
  it('«ثلاثة قتلى» — لا كسر بعد «ثلاثة»', () => {
    const t = tokens('ثلاثة قتلى');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«١٢ ضحية» — لا كسر بعد رقم عربي', () => {
    const t = tokens('١٢ ضحية');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«25 قتيلاً» — لا كسر بعد رقم لاتيني', () => {
    const t = tokens('25 قتيلاً');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«مليون شخص» — لا كسر بعد كلمة رقم', () => {
    const t = tokens('مليون شخص');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });
});

// ── Infinity — إضافة (بارَي + معرَّف) ────────────

describe('breakPenalty — Infinity: إضافة (بارَي + معرَّف بـال)', () => {
  it('«مجلس الأمن الدولي» — لا كسر بعد «مجلس»', () => {
    const t = tokens('مجلس الأمن الدولي');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«وزير الخارجية التركي» — لا كسر بعد «وزير»', () => {
    const t = tokens('وزير الخارجية التركي');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('«رئيس الوزراء» — لا كسر بعد «رئيس»', () => {
    const t = tokens('رئيس الوزراء');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });
});

// ── 1000 — أعلام مركّبة ────────────────────────

describe('breakPenalty — 1000: أعلام مركّبة', () => {
  it('«عبد الرحمن» — لا يُفضّل الكسر (1000)', () => {
    const t = tokens('عبد الرحمن');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_STRONG);
  });

  it('«عبد الله بن أحمد» — «عبد» + «الله» يحمي (1000)', () => {
    const t = tokens('عبد الله بن أحمد');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_STRONG);
  });

  it('«أبو بكر الصديق» — «أبو» + اسم يحمي (1000)', () => {
    const t = tokens('أبو بكر الصديق');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_STRONG);
  });

  it('«آل سعود» — «آل» + اسم يحمي (1000)', () => {
    const t = tokens('آل سعود');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_STRONG);
  });
});

// ── 1000 — حرف عطف نهاية سطر ────────────

describe('breakPenalty — 1000: حرف عطف ينهي سطراً', () => {
  it('«الأمن و السلم الدوليان» — لا كسر بعد «و» (1000)', () => {
    const t = tokens('الأمن و السلم الدوليان');
    expect(breakPenalty(t, 2, lex)).toBe(BREAK_STRONG);
  });

  it('«الاقتصاد ثم الاجتماع» — لا كسر بعد «ثم» (1000)', () => {
    const t = tokens('الاقتصاد ثم الاجتماع');
    expect(breakPenalty(t, 2, lex)).toBe(BREAK_STRONG);
  });

  it('«التعليم أو التوظيف» — لا كسر بعد «أو» (1000)', () => {
    const t = tokens('التعليم أو التوظيف');
    expect(breakPenalty(t, 2, lex)).toBe(BREAK_STRONG);
  });
});

// ── 400 — بارَي بلا ال ─────────────────────

describe('breakPenalty — 400: بارَي (احتمال إضافة/صفة)', () => {
  it('«قطاع غزة» — رابطة متوسطة (400)', () => {
    const t = tokens('قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_MEDIUM);
  });

  it('«محافظ صنعاء» — بارَي بلا ال (400)', () => {
    const t = tokens('محافظ صنعاء');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_MEDIUM);
  });
});

// ── 0 — لا مانع دلالي ─────────────────────

describe('breakPenalty — 0: لا مانع دلالي', () => {
  it('«الطالب يقرأ الكتاب» — كسر بعد «الطالب» مسموح (0)', () => {
    const t = tokens('الطالب يقرأ الكتاب');
    // «الطالب» معرَّف بـال، «يقرأ» بلا ال — ليست إضافة، ليست أداة
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_NEUTRAL);
  });

  it('«الرجل الطويل» — معرَّف + معرَّف: لا مانع دلالي (0)', () => {
    const t = tokens('الرجل الطويل');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_NEUTRAL);
  });
});

// ── تطبيع + حدود ───────────────────────────

describe('breakPenalty — التطبيع والحدود', () => {
  it('التشكيل مُطَبَّع: «فِي» = «في»', () => {
    const t = tokens('فِي قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('الكشيدة مُطَبَّعة: «فــي» = «في»', () => {
    const t = tokens('فــي قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('علامة ترقيم محيطية: «في،» = «في»', () => {
    const t = tokens('في، قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
  });

  it('atIndex = 0 ⇒ Infinity (بداية السطر لا كسر قبلها)', () => {
    const t = tokens('في قطاع غزة');
    expect(breakPenalty(t, 0, lex)).toBe(BREAK_INFINITY);
  });

  it('atIndex >= length ⇒ Infinity', () => {
    const t = tokens('في قطاع غزة');
    expect(breakPenalty(t, 999, lex)).toBe(BREAK_INFINITY);
  });

  it('نصّ فارغ: لا يرمي', () => {
    const t = tokens('');
    expect(breakPenalty(t, 0, lex)).toBe(BREAK_INFINITY);
  });
});

// ── تركيبة كاملة — عناوين حقيقية ─────

describe('breakPenalty — عناوين حقيقية مقاسة موضعاً بموضع', () => {
  it('«في قطاع غزة» — الوحيدة المسموحة: (2) 400', () => {
    // «في قطاع» = Infinity، «قطاع غزة» = 400 (بارَي)
    const t = tokens('في قطاع غزة');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY);
    expect(breakPenalty(t, 2, lex)).toBe(BREAK_MEDIUM);
  });

  it('«مجلس الأمن الدولي» — كسر مسموح فقط بعد «الأمن»', () => {
    const t = tokens('مجلس الأمن الدولي');
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_INFINITY); // إضافة
    // «الأمن الدولي» — كلاهما معرَّف بـال، لا قاعدة صريحة تمنع (0)
    // في الواقع رابطة اسم+صفة، لكن كشفها يحتاج POS. مؤجَّل.
    expect(breakPenalty(t, 2, lex)).toBe(BREAK_NEUTRAL);
  });
});

// ── القواعد الخارجية (الجزء ب — ExtendedLexicon) ─────
// نفحص أن قواعد title-name، place-pair، entity-pair تُطبِّق BREAK_STRONG
// عند تمرير قوائم مصغّرة. الاختبار مستقل عن المحتوى الفعلي للملفات —
// نحقن قوائم صغيرة يدوية.

import { extendLexicon } from '../arabic-lexicon/extended.js';

const extLex = extendLexicon(lex, {
  titles: ['الرئيس', 'وزير', 'الأمير', 'الشيخ'],
  places: ['بيت لحم', 'خان يونس', 'رأس الخيمة', 'دير البلح'],
  entities: [
    'منظمة التعاون الإسلامي',
    'الاتحاد الأوروبي',
    'حركة حماس',
  ],
});

describe('breakPenalty (الجزء ب) — لقب + اسم', () => {
  it('«الرئيس بشار الأسد» — لا كسر بعد «الرئيس» → 1000', () => {
    const t = tokens('الرئيس بشار الأسد');
    expect(breakPenalty(t, 1, extLex)).toBe(BREAK_STRONG);
  });

  it('«وزير الخارجية التركي» — لقب «وزير» يمنع الكسر بعده → 1000', () => {
    const t = tokens('وزير الخارجية التركي');
    // «وزير» في titles → 1000 (يفوز على isIdafaBareToDef لأن الجزء ب أخصّ).
    expect(breakPenalty(t, 1, extLex)).toBe(BREAK_STRONG);
  });

  it('«الأمير محمد بن سلمان» — بعد «الأمير» → 1000', () => {
    const t = tokens('الأمير محمد بن سلمان');
    expect(breakPenalty(t, 1, extLex)).toBe(BREAK_STRONG);
  });

  it('اللقب لا يمنع الكسر عند القاموس الأساسي (لا امتداد)', () => {
    const t = tokens('الرئيس بشار الأسد');
    // القاموس الأساسي لا يعرف «الرئيس» كلقب → 0 (لا مانع دلالي).
    expect(breakPenalty(t, 1, lex)).toBe(BREAK_NEUTRAL);
  });
});

describe('breakPenalty (الجزء ب) — أسماء أماكن مركّبة', () => {
  it('«حدث في بيت لحم» — لا كسر بين «بيت» و«لحم» → 1000', () => {
    const t = tokens('حدث في بيت لحم');
    // فحص كسر قبل «لحم» (index 3)
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });

  it('«قصف طال خان يونس» — لا كسر بين «خان» و«يونس»', () => {
    const t = tokens('قصف طال خان يونس');
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });

  it('«شحنة من رأس الخيمة» — لا كسر بين «رأس» و«الخيمة»', () => {
    const t = tokens('شحنة من رأس الخيمة');
    // كسر قبل «الخيمة» — index 3
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });

  it('اسم غير موجود في القائمة — يعود للسلوك العام', () => {
    const t = tokens('حدث في مدينة بعيدة');
    // «مدينة بعيدة» ليست في places → لا قاعدة خارجية، ينزل إلى العام.
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_MEDIUM); // bare+bare
  });
});

describe('breakPenalty (الجزء ب) — كيانات مؤسسية', () => {
  it('«اجتماع منظمة التعاون الإسلامي» — لا كسر داخل الاسم', () => {
    const t = tokens('اجتماع منظمة التعاون الإسلامي');
    // كسر قبل «التعاون» (index 2) — داخل الكيان → 1000
    expect(breakPenalty(t, 2, extLex)).toBe(BREAK_STRONG);
    // كسر قبل «الإسلامي» (index 3) — بين «التعاون» و«الإسلامي» → 1000
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });

  it('«قرار الاتحاد الأوروبي» — لا كسر بين «الاتحاد» و«الأوروبي»', () => {
    const t = tokens('قرار الاتحاد الأوروبي');
    expect(breakPenalty(t, 2, extLex)).toBe(BREAK_STRONG);
  });

  it('«ناطق باسم حركة حماس» — لا كسر بين «حركة» و«حماس»', () => {
    const t = tokens('ناطق باسم حركة حماس');
    // 4 tokens: [ناطق, باسم, حركة, حماس] — كسر بين «حركة» و«حماس» عند index=3
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });
});

describe('breakPenalty (الجزء ب) — أولوية الأخصّ', () => {
  it('«عبد الرحمن» — compound-name يبقى 1000 حتى مع lexicon موسَّع', () => {
    const t = tokens('عبد الرحمن الملك');
    // compound-name (isCompoundName) يبقى 1000 (نفس L-08).
    // «عبد» ليس في titles ولا في place-pair ولا entity-pair.
    expect(breakPenalty(t, 1, extLex)).toBe(BREAK_STRONG);
  });

  it('«في بيت لحم» — «في» inseparable لكن place-pair يفوز عند index=3', () => {
    const t = tokens('حدث في بيت لحم');
    // index 2: بعد «في» → Infinity (particle)
    expect(breakPenalty(t, 2, extLex)).toBe(BREAK_INFINITY);
    // index 3: بين «بيت» و«لحم» → 1000 (place-pair)
    expect(breakPenalty(t, 3, extLex)).toBe(BREAK_STRONG);
  });
});
