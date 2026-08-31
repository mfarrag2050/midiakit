// kashida — التبرير بالكشيدة (المسار «أ» من docs/07 §«التبرير بالكشيدة»).
//
// **الفكرة:** إدراج محرف التطويل U+0640 داخل الكلمات المؤهّلة لتوسيع
// السطر إلى `targetWidth` بحواف مستقيمة — بديل عن مطّ المسافات (اللاتيني).
//
// **قواعد لغوية إلزامية (من §القواعد اللغوية):**
//   • لا موضع تطويل بعد حروف غير موصولة: ا د ذ ر ز و + همزات + ة + ٱ.
//   • لا موضع تطويل قبل الحرف النهائي (تشويه بصري).
//   • لا موضع تطويل داخل كلمة تحمل تشكيلاً كثيفاً — أي حركة ⇒ نتراجع.
//   • التوزيع يُفضَّل على عدة كلمات لا مركَّزاً في واحدة.
//   • حد أقصى للتمدد لكل موضع (نسبة من fs) وإلا بدا السطر مشوّهاً.
//
// **التراجع الصامت:** إن كان `fontCaps.kashida = false`، `justifyLine`
// يُعيد المُدخل كما هو — القرار يعود إلى الاستدعاء (space أو تركه).

import type { FontCaps, JustifyConfig, Token, WordToken } from '@pf-mediakit/shared';
import { isWord } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

// ── ثوابت Unicode ───────────────────────────────────────

/** محرف التطويل (كشيدة) — يُكرَّر بمقدار محسوب لتوسيع السطر. */
export const TATWEEL = 'ـ';

/**
 * الحروف غير الموصولة إلى اليسار (Right-Joining فقط).
 * القاعدة: لا يُدرَج تطويل *بعد* أيّ من هذه — لأنها لا تملك شكلاً مبتدئاً
 * يتصل بما بعده، فيبدو التطويل معلّقاً بلا وصلة.
 */
const NON_JOINING_LEFT: ReadonlySet<number> = new Set<number>([
  0x0621, // ء hamza (isolated)
  0x0622, // آ alef with madda
  0x0623, // أ alef with hamza above
  0x0624, // ؤ waw with hamza
  0x0625, // إ alef with hamza below
  0x0627, // ا alef
  0x0629, // ة teh marbuta
  0x062f, // د dal
  0x0630, // ذ thal
  0x0631, // ر reh
  0x0632, // ز zain
  0x0648, // و waw
  0x0671, // ٱ alef wasla
  0x0672, // ٲ
  0x0673, // ٳ
  0x0675, // ٵ
]);

/** علامات التشكيل (fatha/damma/kasra/shadda/sukun/tanween/alif khanjariya). */
const isDiacritic = (cp: number): boolean =>
  (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670;

/** ينتمي إلى نطاق الحروف العربية الأساسي (بلا التشكيل). */
const isArabicLetter = (cp: number): boolean =>
  (cp >= 0x0620 && cp <= 0x064a) ||
  (cp >= 0x066e && cp <= 0x06d3) ||
  (cp >= 0x06fa && cp <= 0x06ff);

// ── تقدير سعة الكشيدة لسطر واحد ────────────────────────

/**
 * يقدّر أقصى تمدد (بكسل) يمكن للكشيدة إضافته لسطر عند حجم خط `fs`.
 * مطابق لسلوك `justifyLine` — نحسب: مواضع فعلية × تطويلات per site ×
 * عرض التطويل. يُستعمَل في `wrap-optimal` (قبول ما بعد الكشيدة) وفي
 * `justifyLine` (قرار «هل الكشيدة تستطيع بلوغ minLineFill؟»).
 *
 * السلوك:
 *   • `fontCaps.kashida = false` ⇒ 0.
 *   • `cfg.mode` ليس kashida/hybrid ⇒ 0.
 *   • عرض التطويل ≤ 0.01 ⇒ 0 (خط لا يرسمه).
 *   • خلاف ذلك: Σ_words min(sitesCount(word), maxSitesPerWord)
 *     × maxTatweelsPerSite × tatweelUnit.
 */
export function estimateLineCapacity(
  line: readonly Token[],
  fs: number,
  allBold: boolean,
  cfg: JustifyConfig,
  fontCaps: FontCaps,
  measure: Measurer
): number {
  if (!fontCaps.kashida) return 0;
  if (cfg.mode !== 'kashida' && cfg.mode !== 'hybrid') return 0;
  const tatweelProbe: WordToken = {
    text: TATWEEL,
    bold: false,
    accent: false,
  };
  const tatweelUnit = measure.word(tatweelProbe, fs, allBold);
  if (tatweelUnit <= 0.01) return 0;
  const maxStretchPx = cfg.maxStretchPerSite * fs;
  const maxTatweelsPerSite = Math.max(1, Math.floor(maxStretchPx / tatweelUnit));
  const perSite = maxTatweelsPerSite * tatweelUnit;
  let totalSites = 0;
  for (const tok of line) {
    if (!isWord(tok)) continue;
    const sites = kashidaSites(tok.text, fontCaps);
    totalSites += Math.min(sites.length, cfg.maxSitesPerWord);
  }
  return totalSites * perSite;
}

// ── kashidaSites ────────────────────────────────────────

/**
 * يُعيد المواضع الصالحة لإدراج التطويل داخل كلمة.
 * الموضع `i` يعني: بين `word[i]` و `word[i+1]` — أي «بعد الحرف i».
 *
 * @param word النص الخام للكلمة (بلا تشكيل مُطبّق مسبقاً — نحن نكتشفه).
 * @param fontCaps قدرات الخط — إن كان kashida=false، تُعاد قائمة فارغة.
 * @returns مواضع مفهرسة إلى `word` بترتيب تصاعدي.
 */
export function kashidaSites(
  word: string,
  fontCaps: FontCaps
): readonly number[] {
  if (!fontCaps.kashida) return [];

  const n = word.length;
  if (n < 3) return []; // قصيرة جداً لا تحتمل تطويلاً

  // قاعدة «التشكيل الكثيف»: أيّ حركة داخل الكلمة ⇒ تراجع كامل.
  // السبب: خطر التصادم بين علامة التشكيل والحرف الممدود ارتفاعاً.
  for (let i = 0; i < n; i++) {
    if (isDiacritic(word.charCodeAt(i))) return [];
  }

  const sites: number[] = [];
  // نتخطّى الموضع الأخير (i = n-2) — «لا قبل حرف نهائي».
  // نقبل i من 0 حتى n-3.
  for (let i = 0; i < n - 2; i++) {
    const cp = word.charCodeAt(i);
    const cpNext = word.charCodeAt(i + 1);

    // char[i] يجب أن يكون حرفاً عربياً موصولاً إلى اليسار.
    if (!isArabicLetter(cp)) continue;
    if (NON_JOINING_LEFT.has(cp)) continue;

    // char[i+1] يجب أن يكون حرفاً عربياً يقبل الوصل من اليمين
    // (كل الحروف عملياً — عدا الفراغ/الترقيم — لكن نتحقّق للسلامة).
    if (!isArabicLetter(cpNext)) continue;

    sites.push(i);
  }
  return sites;
}

// ── اختيار المواضع الموزّعة داخل الكلمة ─────────────────

/**
 * ينتقي حتى `k` مواضع موزّعة توزيعاً بصرياً معقولاً داخل قائمة `sites`.
 * الترتيب: مواضع قريبة من وسط الكلمة أولاً (توزيع بصري)، ثم الأطراف.
 */
export function pickDistributedSites(
  sites: readonly number[],
  k: number
): readonly number[] {
  if (sites.length === 0 || k <= 0) return [];
  const limit = Math.min(k, sites.length);
  if (limit === sites.length) return sites;

  const picked = new Set<number>();
  // نوزّع بالنسبة: idx = round((i + 0.5) * n / limit) — عيّنات متساوية.
  for (let i = 0; i < limit; i++) {
    const raw = Math.floor(((i + 0.5) * sites.length) / limit);
    const idx = Math.min(raw, sites.length - 1);
    picked.add(sites[idx]!);
  }
  // ضمان: إن سقطت مواضع متطابقة، أكمل من الأقرب للمتوسّط.
  const sorted = [...sites].sort((a, b) => {
    const mid = (sites.length - 1) / 2;
    return Math.abs(sites.indexOf(a) - mid) - Math.abs(sites.indexOf(b) - mid);
  });
  let cursor = 0;
  while (picked.size < limit && cursor < sorted.length) {
    picked.add(sorted[cursor]!);
    cursor++;
  }
  return [...picked].sort((a, b) => a - b);
}

// ── justifyLine ─────────────────────────────────────────

/** خيارات إضافية عند استدعاء justifyLine. */
export interface JustifyLineOptions {
  /** آخر سطر في الفقرة؟ عند `cfg.lastLine='natural'` لا يُبرَّر. */
  readonly isLast?: boolean;
}

/**
 * يُوسّع سطراً إلى `targetWidth` بإدراج تطويلات موزّعة على الكلمات.
 *
 * سلوك التراجع الصامت:
 *   • `cfg.mode` ليس kashida/hybrid ⇒ يُعيد المُدخل بلا لمس.
 *   • `fontCaps.kashida = false` ⇒ يُعيد المُدخل بلا لمس.
 *   • آخر سطر و `cfg.lastLine = 'natural'` ⇒ لا تبرير.
 *   • عرض السطر الحالي / `targetWidth` < `cfg.minLineFill` ⇒ لا تبرير.
 *
 * @returns رموز جديدة (لا تُطبِّق أثراً جانبياً على المُدخل).
 */
export function justifyLine(
  tokens: readonly Token[],
  targetWidth: number,
  fs: number,
  allBold: boolean,
  cfg: JustifyConfig,
  fontCaps: FontCaps,
  measure: Measurer,
  opts: JustifyLineOptions = {}
): Token[] {
  const isLast = opts.isLast ?? false;
  const passthrough = (): Token[] => tokens.map((t) => t);

  // تراجع 1: وضع لا يستدعي كشيدة.
  if (cfg.mode !== 'kashida' && cfg.mode !== 'hybrid') return passthrough();
  // تراجع 2: الخط لا يدعم — صامت.
  if (!fontCaps.kashida) return passthrough();
  // تراجع 3: آخر سطر طبيعي.
  if (isLast && cfg.lastLine === 'natural') return passthrough();

  const currentWidth = measure.line(tokens, fs, allBold);
  const deficit = targetWidth - currentWidth;
  if (deficit <= 0.5) return passthrough();

  // **قرار (2026-08-31):** `minLineFill` تُفسَّر كـ«أدنى ملء **بعد**
  // الكشيدة» لا «أدنى ملء خام قبلها». السبب: wrapOptimal يُبني قراره
  // (fs, boxW, k) على تقدير post-kashida ≥ 0.82؛ لو أبقينا الحرس على
  // الملء الخام، لَرفضنا سطوراً وثقّها اللف وتَركناها ركاماً.
  //
  // نحسب أقصى تمدد ممكن؛ إن لم يبلغ minLineFill حتى بكامل السعة،
  // نتراجع صامتاً (فعلاً السطر أفرغ من أن تُصلحه الكشيدة).
  const capacity = estimateLineCapacity(
    tokens,
    fs,
    allBold,
    cfg,
    fontCaps,
    measure
  );
  const bestPossibleFill =
    targetWidth > 0 ? Math.min(1, (currentWidth + capacity) / targetWidth) : 0;
  if (bestPossibleFill < cfg.minLineFill) return passthrough();

  // قياس عرض تطويل واحد بالخط الحالي.
  const tatweelProbe: WordToken = {
    text: TATWEEL,
    bold: false,
    accent: false,
  };
  const tatweelUnit = measure.word(tatweelProbe, fs, allBold);
  if (tatweelUnit <= 0.01) return passthrough(); // الخط لا يرسم التطويل

  // سقف التمدد لكل موضع بوحدة التطويل — لا أقل من 1 لضمان الجدوى.
  const maxStretchPx = cfg.maxStretchPerSite * fs;
  const maxTatweelsPerSite = Math.max(1, Math.floor(maxStretchPx / tatweelUnit));

  // جمع المواضع: لكل كلمة، حتى `maxSitesPerWord` موضع موزّع.
  interface SiteRef {
    readonly wordIdx: number;
    readonly sitePos: number;
  }
  const sites: SiteRef[] = [];
  tokens.forEach((tok, wordIdx) => {
    if (!isWord(tok)) return;
    const raw = kashidaSites(tok.text, fontCaps);
    const picked = pickDistributedSites(raw, cfg.maxSitesPerWord);
    for (const sitePos of picked) sites.push({ wordIdx, sitePos });
  });

  if (sites.length === 0) return passthrough();

  // توزيع العجز بالتناوب على المواضع (round-robin عبر الكلمات).
  // نُرتّب المواضع بحيث الأول من كل كلمة يأتي قبل الثاني من الكلمات الأخرى.
  const perWordCounters = new Map<number, number>();
  const roundRobin: SiteRef[] = [];
  // نضع فهرساً محلياً لكل موضع داخل كلمته
  const withLocalIdx: (SiteRef & { readonly localIdx: number })[] = sites.map(
    (s) => {
      const n = perWordCounters.get(s.wordIdx) ?? 0;
      perWordCounters.set(s.wordIdx, n + 1);
      return { ...s, localIdx: n };
    }
  );
  // فرز: أولاً حسب localIdx (الجولة الأولى قبل الثانية)، ثم حسب wordIdx.
  withLocalIdx.sort((a, b) => a.localIdx - b.localIdx || a.wordIdx - b.wordIdx);
  for (const s of withLocalIdx) roundRobin.push({ wordIdx: s.wordIdx, sitePos: s.sitePos });

  const tatweelsNeeded = deficit / tatweelUnit;
  const nSites = roundRobin.length;
  const basePerSite = Math.min(
    maxTatweelsPerSite,
    Math.floor(tatweelsNeeded / nSites)
  );
  const roundedTotal = Math.round(tatweelsNeeded);
  const remainingCapacity = nSites * (maxTatweelsPerSite - basePerSite);
  const extra = Math.max(
    0,
    Math.min(roundedTotal - basePerSite * nSites, remainingCapacity)
  );

  // توزيع: أول `extra` مواضع تأخذ +1، الباقي `basePerSite`.
  const counts: number[] = roundRobin.map((_, i) =>
    i < extra ? basePerSite + 1 : basePerSite
  );

  // تجميع حسب الكلمة وإدراج التطويلات.
  const insertionsByWord = new Map<
    number,
    { readonly sitePos: number; readonly count: number }[]
  >();
  roundRobin.forEach((s, i) => {
    const c = counts[i]!;
    if (c <= 0) return;
    const list = insertionsByWord.get(s.wordIdx) ?? [];
    list.push({ sitePos: s.sitePos, count: c });
    insertionsByWord.set(s.wordIdx, list);
  });

  return tokens.map((tok, i) => {
    if (!isWord(tok)) return tok;
    const ins = insertionsByWord.get(i);
    if (!ins || ins.length === 0) return tok;
    return { ...tok, text: insertKashidas(tok.text, ins) };
  });
}

/**
 * يُدرج التطويلات في النص بالترتيب من أعلى موضع إلى أدنى — كي تبقى فهارس
 * المواضع الأدنى صحيحة بعد الإدراج.
 */
function insertKashidas(
  text: string,
  insertions: readonly { readonly sitePos: number; readonly count: number }[]
): string {
  const sorted = [...insertions].sort((a, b) => b.sitePos - a.sitePos);
  let out = text;
  for (const ins of sorted) {
    const insertAt = ins.sitePos + 1; // «بعد» char[sitePos]
    out = out.slice(0, insertAt) + TATWEEL.repeat(ins.count) + out.slice(insertAt);
  }
  return out;
}

// ── detectFontCaps ──────────────────────────────────────

/** نتيجة كشف قدرات الخط — مطابقة لـ `FontCaps` لكن جزئية عند التخزين. */
export interface DetectedFontCaps {
  readonly kashida: boolean;
  readonly kashidaMethod: 'tatweel' | 'variableAxis' | 'glyphVariants';
}

/**
 * يكتشف هل الخط الحالي (المضبوط في `measure`) يرسم التطويل بعرض معقول.
 * المعيار: عرض التطويل ≥ 5% من fs — تحت ذلك يعني أن الخط يرسمه فراغاً
 * صفري العرض أو رمزاً تعويضياً (fallback glyph).
 *
 * التراجع الصامت: النتيجة تُخزَّن في `brand.fonts.capabilities.kashida`،
 * فإن كانت `false` تعود `justifyLine` بلا لمس المدخلات — بلا خطأ.
 */
export function detectFontCaps(
  measure: Measurer,
  fs = 80
): DetectedFontCaps {
  const probe: WordToken = { text: TATWEEL, bold: false, accent: false };
  const width = measure.word(probe, fs, false);
  const threshold = fs * 0.05;
  const supported = width >= threshold;
  return {
    kashida: supported,
    kashidaMethod: 'tatweel',
  };
}
