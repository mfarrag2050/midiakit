// arabic-lexicon — قوائم مغلقة لأدوات العربية النحوية.
//
// **العقد:** يُبنى `Lexicon` مرة واحدة من `particles.json` ويُمرَّر إلى
// `breakPenalty` كوسيط. لا حالة عابرة، لا تحميل داخل الحلقات.
//
// **التطبيع:** كل مقارنة تمرّ بـ`normalize()` — يزيل التشكيل والكشيدة
// وعلامات الترقيم المحيطية. هذا يجعل `"في،"` (بفاصلة) مطابقاً لـ`"في"`،
// و`"رُبّ"` مطابقاً لـ`"رب"` في المخزون.

import raw from './particles.json' with { type: 'json' };

// ── تطبيع ─────────────────────────────────────────────

/** نطاقات التشكيل: fatha, damma, kasra, shadda, sukun, tanween, alif khanjariya. */
const TASHKEEL_RE = /[ً-ٰٟ]/g;
/** كشيدة U+0640. */
const KASHIDA_RE = /ـ/g;
/** علامات ترقيم عربية وإنجليزية شائعة تحيط بالكلمات. */
const TRIM_PUNCT_RE = /^[،؛؟\.,;:?!\s"'«»()\[\]]+|[،؛؟\.,;:?!\s"'«»()\[\]]+$/g;

/**
 * يطبّع كلمة قبل المقارنة: إزالة التشكيل + الكشيدة + الترقيم المحيطي.
 * لا يحذف الترقيم الداخلي (لا يوجد عادةً داخل الكلمات العربية).
 */
export function normalize(word: string): string {
  return word
    .replace(TASHKEEL_RE, '')
    .replace(KASHIDA_RE, '')
    .replace(TRIM_PUNCT_RE, '');
}

// ── الأنواع ────────────────────────────────────────────

export interface Lexicon {
  // فئات مفردة — مفيدة للاستدلال والاختبار
  readonly prepositions: ReadonlySet<string>;
  readonly kwsiPrepositions: ReadonlySet<string>;
  readonly conditionalParticles: ReadonlySet<string>;
  readonly relativePronouns: ReadonlySet<string>;
  readonly innSisters: ReadonlySet<string>;
  readonly kaanSisters: ReadonlySet<string>;
  readonly kaadSisters: ReadonlySet<string>;
  readonly negationParticles: ReadonlySet<string>;
  readonly subjunctiveParticles: ReadonlySet<string>;
  readonly jussiveParticles: ReadonlySet<string>;
  readonly interrogativeParticles: ReadonlySet<string>;
  readonly exceptionParticles: ReadonlySet<string>;
  readonly conjunctions: ReadonlySet<string>;
  readonly emphasisParticles: ReadonlySet<string>;
  readonly compoundNamePrefixes: ReadonlySet<string>;
  readonly numberWords: ReadonlySet<string>;

  /**
   * الاتحاد الموحّد لكل الفئات التي **يجب ألا يقع كسر بعدها** — تُستعمل
   * في breakPenalty كفحص Infinity واحد بدل عشرة استفسارات.
   */
  readonly noBreakAfter: ReadonlySet<string>;

  // Helpers — كلها تُطبّع الوسيط داخلياً
  isPreposition(word: string): boolean;
  isKwsiPreposition(word: string): boolean;
  isRelativePronoun(word: string): boolean;
  isInseparableParticle(word: string): boolean;
  isNumber(word: string): boolean;
  isCompoundNamePrefix(word: string): boolean;
  isConjunction(word: string): boolean;
}

interface ParticleData {
  readonly prepositions: readonly string[];
  readonly kwsi_prepositions: readonly string[];
  readonly conditional_particles: readonly string[];
  readonly relative_pronouns: readonly string[];
  readonly inn_sisters: readonly string[];
  readonly kaan_sisters: readonly string[];
  readonly kaad_sisters: readonly string[];
  readonly negation_particles: readonly string[];
  readonly subjunctive_particles: readonly string[];
  readonly jussive_particles: readonly string[];
  readonly interrogative_particles: readonly string[];
  readonly exception_particles: readonly string[];
  readonly conjunctions: readonly string[];
  readonly emphasis_particles: readonly string[];
  readonly compound_name_prefixes: readonly string[];
  readonly arabic_numbers_words: readonly string[];
}

// ── البناء ─────────────────────────────────────────────

function normalizedSet(items: readonly string[]): ReadonlySet<string> {
  return new Set(items.map(normalize).filter((s) => s.length > 0));
}

/** التحقق من كون سلسلة رقماً (لاتينياً ٠-٩ أو عربياً ٠-٩). */
const NUMERIC_RE = /^[\d٠-٩۰-۹]+$/;

function buildLexicon(data: ParticleData): Lexicon {
  const prepositions = normalizedSet(data.prepositions);
  const kwsiPrepositions = normalizedSet(data.kwsi_prepositions);
  const conditionalParticles = normalizedSet(data.conditional_particles);
  const relativePronouns = normalizedSet(data.relative_pronouns);
  const innSisters = normalizedSet(data.inn_sisters);
  const kaanSisters = normalizedSet(data.kaan_sisters);
  const kaadSisters = normalizedSet(data.kaad_sisters);
  const negationParticles = normalizedSet(data.negation_particles);
  const subjunctiveParticles = normalizedSet(data.subjunctive_particles);
  const jussiveParticles = normalizedSet(data.jussive_particles);
  const interrogativeParticles = normalizedSet(data.interrogative_particles);
  const exceptionParticles = normalizedSet(data.exception_particles);
  const conjunctions = normalizedSet(data.conjunctions);
  const emphasisParticles = normalizedSet(data.emphasis_particles);
  const compoundNamePrefixes = normalizedSet(data.compound_name_prefixes);
  const numberWords = normalizedSet(data.arabic_numbers_words);

  // اتحاد كل الفئات التي تكسر الكسر — تُفحص كلها في استفسار واحد.
  // `conjunctions` غير مضمّنة — لها قاعدة منفصلة (1000 لا Infinity).
  // `compoundNamePrefixes` غير مضمّنة — لها 1000 أيضاً.
  const noBreakAfter = new Set<string>([
    ...prepositions,
    ...kwsiPrepositions,
    ...conditionalParticles,
    ...relativePronouns,
    ...innSisters,
    ...kaanSisters,
    ...kaadSisters,
    ...negationParticles,
    ...subjunctiveParticles,
    ...jussiveParticles,
    ...interrogativeParticles,
    ...exceptionParticles,
    ...emphasisParticles,
  ]);

  const has = (set: ReadonlySet<string>) => (w: string): boolean =>
    set.has(normalize(w));

  return {
    prepositions,
    kwsiPrepositions,
    conditionalParticles,
    relativePronouns,
    innSisters,
    kaanSisters,
    kaadSisters,
    negationParticles,
    subjunctiveParticles,
    jussiveParticles,
    interrogativeParticles,
    exceptionParticles,
    conjunctions,
    emphasisParticles,
    compoundNamePrefixes,
    numberWords,
    noBreakAfter,
    isPreposition: has(prepositions),
    isKwsiPreposition: has(kwsiPrepositions),
    isRelativePronoun: has(relativePronouns),
    isInseparableParticle: has(noBreakAfter),
    isNumber(w: string): boolean {
      const n = normalize(w);
      return NUMERIC_RE.test(n) || numberWords.has(n);
    },
    isCompoundNamePrefix: has(compoundNamePrefixes),
    isConjunction: has(conjunctions),
  };
}

// ── الواجهة العامة ─────────────────────────────────────

/**
 * يُبنى Lexicon من `particles.json` — يُستدعى مرة عند بدء العملية
 * (أو في `buildRenderPlan` لتفادي إعادته لكل مهمة).
 */
export function loadDefaultLexicon(): Lexicon {
  return buildLexicon(raw as ParticleData);
}
