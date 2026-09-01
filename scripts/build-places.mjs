// scripts/build-places.mjs
//
// يبني data/external/places.json من GeoNames (CC-BY-4.0):
// • cities15000 (المدن ≥15K سكان) + countryInfo (الدول)
// • أسماء عربية من alternateNamesV2 (isolang=ar)
// • أولوية: الدول → PPLC (عواصم) → PPLA (عواصم إدارية) → PPL
// • **أولوية إضافية للأسماء المركّبة** (متعدد الكلمات) — العلّة الأصلية.
// • حدّ أقصى 5000 اسم، ≤500KB.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'data/external/raw');
const OUT = join(ROOT, 'data/external/places.json');

const MAX = 5000;
const MAX_BYTES = 500 * 1024;

// ── تطبيع (يطابق arabic-lexicon/normalize) ─────────────
// نضيف: alef wasla (ٱ→ا) والألف بأشكاله (إ أ آ → ا) لأن GeoNames يخلط أشكال
// الألف والحمزة، والمحرّر يكتبها بصور مختلفة. المطابقة تحتاج تسطيحاً.
const TASHKEEL_RE = /[ً-ٰٟ]/g;
const KASHIDA_RE = /ـ/g;
const ALEF_WASLA = /ٱ/g;
const TRIM_PUNCT_RE = /^[،؛؟\.,;:?!\s"'«»()\[\]]+|[،؛؟\.,;:?!\s"'«]+$/g;
function normalize(word) {
  return word
    .replace(TASHKEEL_RE, '')
    .replace(KASHIDA_RE, '')
    .replace(ALEF_WASLA, 'ا')
    .replace(TRIM_PUNCT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── تحميل: countryInfo ─────────────────────────────
// المخطط: [ISO2, ISO3, ISONum, FIPS, name, capital, area, pop, continent,
//          tld, currCode, currName, phone, postalFmt, postalRe, langs,
//          geonameid, neighbours, equivFips]
const countryRows = readFileSync(join(RAW, 'countryInfo.txt'), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'));
const countryIds = new Set();
const countryEnMeta = new Map(); // geonameid -> {name, iso, capital}
for (const row of countryRows) {
  const c = row.split('\t');
  if (c.length < 18) continue;
  const gid = c[16];
  if (!gid) continue;
  countryIds.add(gid);
  countryEnMeta.set(gid, { nameEn: c[4], iso2: c[0], capital: c[5] });
}

// ── تحميل: cities15000 ─────────────────────────────
// المخطط: [geonameid, name, asciiname, altnames, lat, lon, fclass, fcode,
//          country, cc2, adm1..4, population, elevation, dem, tz, mod]
const cityRows = readFileSync(join(RAW, 'cities15000.txt'), 'utf8')
  .split('\n')
  .filter(Boolean);
const cityMeta = new Map(); // geonameid -> {nameEn, fcode, pop, country}
for (const row of cityRows) {
  const c = row.split('\t');
  if (c.length < 19) continue;
  cityMeta.set(c[0], {
    nameEn: c[1],
    fcode: c[7],
    pop: parseInt(c[14] || '0', 10),
    country: c[8],
  });
}

// ── تحميل: أسماء عربية مصفّاة ──────────────────────
// المخطط بعد التصفية: [altnameId, geonameid, ar, name, isPreferred, ...]
const arRows = readFileSync(join(RAW, 'arabic-filtered.tsv'), 'utf8')
  .split('\n')
  .filter(Boolean);

// **قرار:** نعتمد alternateNamesV2 حصراً كمصدر للأسماء العربية. حقل
// altnames في cities15000 يخلط لغات كثيرة بلا وسوم لغة موثوقة، ويسرّب
// أشكالاً فارسية/أردية/أويغورية وترجمات صوتية بالحروف اللاتينية —
// مصفاة اللاحقة كانت تُنتج ضجيجاً أكثر من إشارة.
// **قصر على العربية القياسية** — نستبعد الفارسية والأردية والأويغورية.
const ARABIC_ONLY_RE = /[ء-غـ-ي٠-٩]/;
const NON_ARABIC_LETTER_RE = /[پچژگٹڈڑںھۀ-ۏې-ۣک]/;
const HAS_LATIN_RE = /[A-Za-z]/;

/** يقبل النص كاسم عربي قياسي — لا لاتينية، لا حروف عجمية. */
function isCleanArabic(s) {
  if (!s) return false;
  if (HAS_LATIN_RE.test(s)) return false;
  if (NON_ARABIC_LETTER_RE.test(s)) return false;
  if (!ARABIC_ONLY_RE.test(s)) return false;
  return true;
}

// جمع كل الأسماء العربية لكل geonameid.
// **قرار:** نحتفظ بأكثر من اسم للموقع الواحد لأننا نريد الأشكال المركّبة
// حتى لو كان المفضّل مفرداً. مثال gid=291075: نبقي «رأس الخيمة» و«إمارة رأس
// الخيمة» و«رأس الخيمه» — كلها أشكال قد يكتبها المحرّر.
// نطبّق حدّاً 3 أشكال لكل موقع لتفادي التضخيم بالأشكال النادرة.
const MAX_FORMS_PER_GID = 3;
const arByGid = new Map();
for (const row of arRows) {
  const c = row.split('\t');
  const gid = c[1];
  const name = c[3];
  const preferred = c[4] === '1';
  const isShort = c[5] === '1';
  const isColloquial = c[6] === '1';
  const isHistoric = c[7] === '1';
  if (!gid || !name) continue;
  if (isHistoric) continue;
  if (isColloquial) continue; // العامية تكرّر أشكالاً بلا فائدة إخبارية
  if (!isCleanArabic(name)) continue;
  const normalized = normalize(name);
  if (!normalized || normalized.length < 2) continue;
  if (!arByGid.has(gid)) arByGid.set(gid, []);
  arByGid.get(gid).push({ name: normalized, preferred, short: isShort });
}

// اختصر لكل gid إلى أفضل 3 أشكال:
//   ١) أعلى تفضيل، ٢) الاسم المركّب يفوز على المفرد،
//   ٣) الأقصر إن تساوى المركّب-الحال، ٤) بلا تكرار داخل الـgid نفسه.
for (const [gid, list] of arByGid) {
  const uniq = new Map();
  for (const item of list) if (!uniq.has(item.name)) uniq.set(item.name, item);
  const ranked = [...uniq.values()].sort((a, b) => {
    // preferred descending
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    // compound (has space) قبل مفرد
    const ac = /\s/.test(a.name);
    const bc = /\s/.test(b.name);
    if (ac !== bc) return ac ? -1 : 1;
    // الشكل المُعرَّف (يبدأ بـ«ال») يفوز على المُنكَّر
    // — الصحافة العربية تكتب «الدوحة» لا «دوحه».
    const al_a = a.name.startsWith('ال');
    const al_b = b.name.startsWith('ال');
    if (al_a !== al_b) return al_a ? -1 : 1;
    // الشكل المنتهي بـة يفوز على المنتهي بـه (تاء مربوطة قياسية).
    const ta_a = a.name.endsWith('ة');
    const ta_b = b.name.endsWith('ة');
    if (ta_a !== ta_b) return ta_a ? -1 : 1;
    // الأقصر يفوز
    return a.name.length - b.name.length;
  });
  arByGid.set(gid, ranked.slice(0, MAX_FORMS_PER_GID));
}

// ── ترشيح: كل geonameid مسموح، له اسم عربي ──────
// ترتيب الأولوية:
//   4: دولة (PCLI)
//   3: عاصمة سياسية (PPLC)
//   2: عاصمة إدارية (PPLA)
//   1: مدينة إدارية أدنى (PPLA2..PPLA4) أو مدينة عادية
// إضافة: **الاسم المركّب (يحوي مسافة) يرفع الأولوية درجة** — لأنه علّة وجود الملف.
// دول العالم العربي — سياق إخباري رئيسي؛ نضاعف أولويتها.
const ARAB_ISO2 = new Set([
  'SA','AE','EG','QA','KW','BH','OM','YE',
  'IQ','SY','LB','JO','PS','IL', // فلسطين وإسرائيل (سياق النزاع)
  'SD','SS','LY','TN','DZ','MA','MR','SO','DJ','KM','TD',
  'TR','IR',                     // جوار إقليمي مباشر
]);

const candidates = [];
for (const [gid, forms] of arByGid) {
  for (const form of forms) {
    const name = form.name;
    if (!name || name.length < 2) continue;
    const isCompound = /\s/.test(name);
    let priority = 1;
    let inArabRegion = false;
    if (countryIds.has(gid)) {
      priority = 4;
    } else {
      const meta = cityMeta.get(gid);
      if (!meta) continue;
      inArabRegion = ARAB_ISO2.has(meta.country);
      if (meta.fcode === 'PPLC') priority = 3;
      else if (meta.fcode === 'PPLA') priority = 2;
      else if (meta.fcode === 'PPLA2') priority = inArabRegion ? 2 : 1;
      else priority = 1;
      // مدن الدول العربية تحصل على درجة إضافية — السياق الإخباري الأهمّ.
      if (inArabRegion) priority = Math.min(3, priority + 1);
    }
    // ترقية الاسم المركّب — درجة إضافية دون تجاوز 4
    const finalPriority = isCompound ? Math.min(4, priority + 1) : priority;
    const meta = cityMeta.get(gid) ?? {};
    candidates.push({
      name,
      gid,
      priority: finalPriority,
      isCompound,
      inArabRegion,
      fcode: countryIds.has(gid) ? 'PCLI' : (meta.fcode ?? ''),
      country: meta.country ?? '',
      pop: meta.pop ?? 0,
    });
  }
}

// فرز: priority تنازلياً، ثم population تنازلياً، ثم isCompound (مركّب يسبق)
candidates.sort((a, b) => {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.isCompound !== a.isCompound) return b.isCompound ? 1 : -1;
  return b.pop - a.pop;
});

// **قرار تصميمي:** الاسم المفرد (بلا مسافة) لا يمكن كسره في السطر — طوكن
// واحد. الاسم المركّب فقط يفيد قاعدة place-name. نُبقي المفرد فقط للدول
// (قد يظهر بجانب لقب: «مصر تعلن…») وللعواصم PPLC (نفس السبب). البقيّة
// مركّبة حصراً.
const seenNames = new Set();
const filtered = [];
for (const c of candidates) {
  if (seenNames.has(c.name)) continue;
  if (!c.isCompound && c.priority < 3) continue; // مفرد يُحفَظ فقط عند priority ≥ 3
  seenNames.add(c.name);
  filtered.push(c);
  if (filtered.length >= MAX) break;
}

// المُخرج: قائمة أسماء فقط + إحصاءات
const names = filtered.map((c) => c.name).sort();
const stats = {
  total: filtered.length,
  compound: filtered.filter((c) => c.isCompound).length,
  countries: filtered.filter((c) => c.priority === 4 && !c.isCompound).length,
  capitals: filtered.filter((c) => c.fcode === 'PPLC').length,
  fromCountryList: filtered.filter((c) => countryIds.has(c.gid)).length,
};

const payload = {
  _meta: {
    description: 'أسماء أماكن عربية للسياق الإخباري (docs/07 §2 القاعدة الجديدة "place-name").',
    source: 'GeoNames alternateNamesV2 + cities15000 + countryInfo',
    license: 'CC-BY-4.0 — https://creativecommons.org/licenses/by/4.0/',
    attribution: 'This work uses GeoNames Gazetteer geographical database (https://www.geonames.org/)',
    generatedAt: new Date().toISOString(),
    stats,
  },
  places: names,
};

const json = JSON.stringify(payload, null, 0);
writeFileSync(OUT, json);
const bytes = Buffer.byteLength(json, 'utf8');
console.log(`kept: ${filtered.length}  bytes: ${bytes}  compound: ${stats.compound}  countries: ${stats.countries}  capitals: ${stats.capitals}`);
console.log(`sample compound: ${filtered.filter(c => c.isCompound).slice(0, 15).map(c => c.name).join(' · ')}`);
if (bytes > MAX_BYTES) {
  console.error(`FAIL: ${bytes} > ${MAX_BYTES} — needs stricter filter`);
  process.exit(1);
}
