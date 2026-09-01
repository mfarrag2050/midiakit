// extended-lexicon — القوائم الخارجية للكسر الدلالي (docs/07 §2 الجزء ب).
//
// **العقد:** يبنى ExtendedLexicon فوق Lexicon الأساسي بإضافة ثلاث قوائم:
//   • titles: ألقاب مهنية/سياسية (title + name — عقوبة 1000)
//   • places: أسماء أماكن مركّبة (2+ كلمات — عقوبة 1000 داخل الاسم)
//   • entities: كيانات مؤسسية مركّبة (منظمات، أحزاب، شركات — عقوبة 1000 داخل الاسم)
//
// **مصادر البيانات** (تُمرَّر معالجةً، لا مسارات ملفات — المحرك نقيّ):
//   • places من GeoNames CC-BY-4.0
//   • entities من Wikidata CC0
//   • titles يدوي (لا مورد خارجي)
//
// **بنية الفهرسة للأسماء متعددة الكلمات:**
//   نبني مجموعة من الأزواج (word_i, word_i+1) لكل اسم مركّب. عند فحص كسر
//   بين tokens[k-1] و tokens[k]، نستفسر ما إذا كانت الزوجة (prev, curr)
//   موجودة داخل أيّ اسم معروف. تفادي مسح كل الأسماء لكل موقع كسر.
//
// **الأداء:** بناء الفهارس O(N) عند التحميل (~5ms لثلاثة آلاف اسم). الاستفسار
// O(1) لكل موضع DP — لا يضاف إلى ندبة L-07.

import type { Lexicon } from './index.js';
import { normalize } from './index.js';

// ── نوع البيانات المدخلة ───────────────────────────

export interface ExtendedLexiconData {
  /** ألقاب — كل عنصر كلمة واحدة (title + name pattern). */
  readonly titles?: readonly string[];
  /** أسماء أماكن مركّبة (متعدد الكلمات — GeoNames). المفرد يُتجاهل. */
  readonly places?: readonly string[];
  /** أسماء كيانات مركّبة (Wikidata). المفرد يُتجاهل. */
  readonly entities?: readonly string[];
}

// ── نوع الواجهة الموسّعة ──────────────────────────

export interface ExtendedLexicon extends Lexicon {
  /** الألقاب المطبَّعة — كلمة واحدة تشير إلى دور اجتماعي. */
  readonly titles: ReadonlySet<string>;
  /** أسماء الأماكن المركّبة الكاملة (مطبَّعة). */
  readonly placeNames: ReadonlySet<string>;
  /** أسماء الكيانات المركّبة الكاملة (مطبَّعة). */
  readonly entityNames: ReadonlySet<string>;

  /** يفحص إذا كانت الكلمة لقباً معروفاً. */
  isTitle(word: string): boolean;
  /**
   * يفحص إذا كانت (prev, curr) زوجاً متجاوراً داخل اسم مكان معروف.
   * مثال: pair("بيت", "لحم") = true (داخل "بيت لحم").
   */
  hasPlacePair(prev: string, curr: string): boolean;
  /** مثل hasPlacePair لكن للكيانات (منظمة التعاون الإسلامي…). */
  hasEntityPair(prev: string, curr: string): boolean;
}

// ── البناء ────────────────────────────────────────

/**
 * يبني الأزواج الداخلية من قائمة أسماء مركّبة.
 * لكل اسم "w1 w2 w3 …"، ننشئ الأزواج ("w1","w2"), ("w2","w3"), …
 * كمفتاح "prev|curr" مطبَّع.
 */
function buildInternalPairs(names: readonly string[]): {
  full: ReadonlySet<string>;
  pairs: ReadonlySet<string>;
} {
  const full = new Set<string>();
  const pairs = new Set<string>();
  for (const raw of names) {
    const words = raw.split(/\s+/).map((w) => normalize(w)).filter(Boolean);
    if (words.length < 2) continue; // مفرد لا يحتاج فهرسة
    const normalized = words.join(' ');
    full.add(normalized);
    for (let i = 0; i < words.length - 1; i++) {
      pairs.add(`${words[i]}|${words[i + 1]}`);
    }
  }
  return { full, pairs };
}

export function extendLexicon(
  base: Lexicon,
  data: ExtendedLexiconData
): ExtendedLexicon {
  const titles = new Set<string>();
  for (const t of data.titles ?? []) {
    const n = normalize(t);
    if (n.length > 0) titles.add(n);
  }

  const placesIdx = buildInternalPairs(data.places ?? []);
  const entitiesIdx = buildInternalPairs(data.entities ?? []);

  return {
    ...base,
    titles,
    placeNames: placesIdx.full,
    entityNames: entitiesIdx.full,
    isTitle(word: string): boolean {
      return titles.has(normalize(word));
    },
    hasPlacePair(prev: string, curr: string): boolean {
      return placesIdx.pairs.has(`${normalize(prev)}|${normalize(curr)}`);
    },
    hasEntityPair(prev: string, curr: string): boolean {
      return entitiesIdx.pairs.has(`${normalize(prev)}|${normalize(curr)}`);
    },
  };
}

/** فحص نوعي — هل هذا Lexicon موسَّع؟ */
export function isExtendedLexicon(lex: Lexicon): lex is ExtendedLexicon {
  return (
    typeof (lex as ExtendedLexicon).isTitle === 'function' &&
    typeof (lex as ExtendedLexicon).hasPlacePair === 'function' &&
    typeof (lex as ExtendedLexicon).hasEntityPair === 'function'
  );
}
