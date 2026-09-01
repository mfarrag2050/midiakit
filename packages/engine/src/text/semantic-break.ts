// semantic-break — عقوبة كسر السطر عند موقع محدد (docs/07 §2).
//
// **العقد:** `breakPenalty(tokens, atIndex, lexicon) → number`
// حيث `atIndex` = موقع بداية سطر جديد (الكسر **قبل** `tokens[atIndex]`).
//
// **العودة:**
//   • `Infinity` — لا يُفصل مطلقاً (رابطة نحوية قاطعة)
//   • `1000`     — يُكره (رابطة عرفية قوية: أعلام مركّبة، حرف عطف نهاية سطر)
//   • `400`      — رابطة متوسطة (بارَي بلا ال — احتمال إضافة/صفة)
//   • `0`        — لا مانع دلالي
//
// **خارج نطاق هذه الدالة:**
//   • 1600 (يتيم) و 800 (سطر بكلمة واحدة) — قيود مستوى تخطيط، تعالجها
//     `wrapOptimal` بمعاقبتها الحالية (U_SINGLE_WORD=8000، U_LAST_ORPHAN=3000).
//   • 200 و بعض الـ400 (فعل+فاعل، حال+صاحبها…) — تحتاج POS tagger،
//     مؤجَّلة للمرحلة اللاحقة إن ثبت أن الأثر يستحق.
//   • قواعد الأعلام والكيانات والأماكن (1000) — تحتاج titles/entities/places
//     من الجزء (ب) بمواردها المرخّصة. حالياً نطبّق المتاح: عبد/أبو/ابن.
//
// **التطبيع:** كل مقارنة تمرّ بـ`normalize` من arabic-lexicon.
// **الأداء:** الدالة رخيصة (~1μs)، لكن استدعاؤها لكل موقع DP لكل إطار
// يعيد سيناريو L-07. المستدعي (wrapOptimal لاحقاً) يجب أن يحسب مصفوفة
// `breakPenalties[]` مرة قبل DP.

import type { Token } from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';
import type { Lexicon } from '../arabic-lexicon/index.js';
import { normalize } from '../arabic-lexicon/index.js';
import { isExtendedLexicon } from '../arabic-lexicon/extended.js';

// ── ثوابت السلّم ──────────────────────────────────────

/** رابطة نحوية قاطعة — لا يُفصل. wrap يستبعد التقسيم كلياً. */
export const BREAK_INFINITY = Number.POSITIVE_INFINITY;
/** رابطة عرفية قوية — كسر «مجلس الأمن» أسوأ من سطر أقصر بقليل. */
export const BREAK_STRONG = 1000;
/** رابطة متوسطة — بارَي محتملَي الإضافة/الصفة. */
export const BREAK_MEDIUM = 400;
/** الحدّ الأدنى — لا مانع دلالي. */
export const BREAK_NEUTRAL = 0;

// ── مساعدات ─────────────────────────────────────────

/** أل التعريف المتّصلة: كلمة تبدأ بـ«ال» وطولها أكثر من محرفين. */
function startsWithAl(s: string): boolean {
  return s.length > 2 && s.startsWith('ال');
}

/**
 * كشف الإضافة الاستدلالي «بارَي بلا ال + معرَّف بـال»:
 * «مجلس الأمن»، «وزير الخارجية»، «مركز البحوث».
 * سلبيات محتملة: قد يشمل «رجل الشارع» (اسم مجرور مثلاً بعد فعل)،
 * لكن هذه الحالات نادرة في العناوين وتكلفة تفويت كسر ممكن أقل من
 * تكلفة كسر «مجلس الأمن».
 */
function isIdafaBareToDef(prev: string, curr: string): boolean {
  return !startsWithAl(prev) && startsWithAl(curr);
}

/**
 * كشف بارَي بلا ال — احتمال إضافة/موصوف+صفة. تقدير حذر (400).
 * يشمل «قطاع غزة»، «تركيا العلمانية» — إذا لم تكن هناك قاعدة أقوى.
 * يُستبعد إن كان أحدهما رقماً أو أداة (تلك القواعد تفوز بـInfinity).
 */
function isBareToBare(prev: string, curr: string): boolean {
  return !startsWithAl(prev) && !startsWithAl(curr);
}

/**
 * كشف الأعلام المركّبة الشائعة:
 * «عبد + ال…» → عبد الله، عبد الرحمن، عبد العزيز، عبد الله…
 * أبو/ابن/بنت/أم/آل + اسم → أبو بكر، ابن سينا، آل سعود.
 */
function isCompoundName(
  prev: string,
  curr: string,
  lexicon: Lexicon
): boolean {
  if (!lexicon.isCompoundNamePrefix(prev)) return false;
  const p = normalize(prev);
  // «عبد» يتبعها اسم إلهي معرَّف بـال في الغالب.
  if (p === 'عبد') return startsWithAl(curr);
  // البقية (أبو/ابن/بنت/أم/آل) يتبعها اسم علم — أي كلمة غير أداة.
  return curr.length > 1;
}

// ── الواجهة العامة ────────────────────────────────────

/**
 * يُرجع عقوبة كسر السطر **قبل** `tokens[atIndex]`.
 * `atIndex = 0` أو خارج المدى ⇒ Infinity (لا كسر ممكن).
 */
export function breakPenalty(
  tokens: readonly Token[],
  atIndex: number,
  lexicon: Lexicon
): number {
  if (atIndex <= 0 || atIndex >= tokens.length) return BREAK_INFINITY;

  const prevTok = tokens[atIndex - 1];
  const currTok = tokens[atIndex];
  if (!prevTok || !currTok) return BREAK_INFINITY;
  if (!isWord(prevTok) || !isWord(currTok)) return BREAK_NEUTRAL;

  const prev = normalize(prevTok.text);
  const curr = normalize(currTok.text);
  if (prev.length === 0 || curr.length === 0) return BREAK_NEUTRAL;

  // ── ترتيب الفحص: الأخصّ قبل الأعمّ ─────────────
  // ملاحظة تصميمية: `isIdafaBareToDef` عامّ (يطابق أي بارَي+معرَّف)،
  // بينما «أعلام مركّبة» و«حرف عطف» أخصّ منه (يطابقان نمطاً ضيّقاً
  // ويحملان عقوبة أدنى — 1000 لا Infinity). لو فحصنا العام أولاً،
  // لفازت Infinity على «عبد الرحمن» رغم أن التصنيف الصحيح 1000.
  // الحل: افحص المخصص أولاً — كل قاعدة ترجع بمجرد المطابقة.

  // ── القواعد الخارجية (الجزء ب — تحتاج ExtendedLexicon) ─────
  // ترتيب: place-pair ثم entity-pair ثم title، لأن اسم مكان مركّب
  // (بيت لحم) أخصّ من كيان (منظمة …)، والاثنان أخصّ من لقب عام.
  if (isExtendedLexicon(lexicon)) {
    // (٠أ) اسم جغرافي مركّب — «بيت لحم»، «رأس الخيمة» → 1000
    if (lexicon.hasPlacePair(prev, curr)) return BREAK_STRONG;
    // (٠ب) كيان مؤسسي مركّب — «منظمة التعاون الإسلامي» → 1000
    //      داخل الأزواج المتجاورة لأي اسم كيان معروف.
    if (lexicon.hasEntityPair(prev, curr)) return BREAK_STRONG;
    // (٠ج) لقب + اسم — «الرئيس بشار»، «وزير الخارجية» (وزير هنا لقب) → 1000
    //      يتجاوزه compound-name إذا كان «أبو» (يقع في titles أيضاً)
    //      لأن العلم المركّب أخصّ.
    if (lexicon.isTitle(prev)) return BREAK_STRONG;
  }

  // (١) أعلام مركّبة (عبد/أبو/ابن/آل + اسم) → 1000
  //     يسبق كل شيء لأن «أبو» ينتمي أيضاً إلى الأسماء الخمسة (kwsi)،
  //     و«عبد» يشكّل إضافة مع تاليه. تيبوغرافياً كلاهما اسم علم مركّب،
  //     العقوبة الصحيحة 1000 (يسمح بكسر شاذّ عند استحالة كل شيء آخر)،
  //     لا Infinity المفرطة الصرامة.
  if (isCompoundName(prev, curr, lexicon)) return BREAK_STRONG;

  // (٢) أدوات ملازمة لما بعدها → Infinity
  if (lexicon.isInseparableParticle(prev)) return BREAK_INFINITY;

  // (٣) عدد + معدوده → Infinity
  if (lexicon.isNumber(prev)) return BREAK_INFINITY;

  // (٤) حرف عطف ينهي سطراً (و/ف/ثم/أو…) → 1000
  //     يسبق فحص الإضافة لأن «الأمن و السلم» يطابق كليهما.
  if (lexicon.isConjunction(prev)) return BREAK_STRONG;

  // (٥) إضافة بارَي+معرَّف (عامّ) → Infinity
  //     «مجلس الأمن»، «وزير الخارجية».
  if (isIdafaBareToDef(prev, curr)) return BREAK_INFINITY;

  // (٦) بارَي بلا ال (أعمّ من الإضافة) → 400
  //     «قطاع غزة»، «رئيس تركيا».
  if (isBareToBare(prev, curr)) return BREAK_MEDIUM;

  return BREAK_NEUTRAL;
}
