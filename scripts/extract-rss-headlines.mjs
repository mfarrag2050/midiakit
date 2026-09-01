// scripts/extract-rss-headlines.mjs
//
// يستخرج 60 عنواناً لكل مصدر (5 مصادر × 60 = 300) من ملفات RSS
// المحمّلة في data/external/rss. **قرار المالك:** لا مجموعة يدوية —
// نقيس على عناوين حقيقية لتفادي فخّ L-05 (الاختبار لا يفوز على القواعد).
//
// المصادر: aljazeera, bbc-arabic, aawsat, dw-arabic, almasryalyoum.
// المخرج: data/external/rss-headlines.json — [{ source, headline, tokens }]
//   • tokens: عدد الكلمات بعد parseTokens.
//   • نصفّي إلى 8-25 كلمة (مطابق مواصفة WojoodGaza).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RSS = join(ROOT, 'data/external/rss');
const OUT = join(ROOT, 'data/external/rss-headlines.json');

const PER_SOURCE = 60;
const MIN_TOKENS = 8;
const MAX_TOKENS = 25;

const sources = [
  { file: 'aljazeera.xml', tag: 'aljazeera' },
  { file: 'aljazeera-mideast.xml', tag: 'aljazeera-me' },
  { file: 'bbc-arabic.xml', tag: 'bbc-arabic' },
  { file: 'aawsat.xml', tag: 'aawsat' },
  { file: 'dw-arabic.xml', tag: 'dw-arabic' },
  { file: 'almasryalyoum.xml', tag: 'almasryalyoum' },
  { file: 'rt-arabic.xml', tag: 'rt-arabic' },
  { file: 'middleeastonline.xml', tag: 'me-online' },
];

/** يستخرج نص item.title من xml نصياً — بلا اعتماد على مكتبة. */
function extractTitles(xml) {
  const titles = [];
  // نبحث عن <item>...<title>...</title>... مع دعم CDATA.
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const item = m[1];
    // نبحث عن أول <title> — قد يكون CDATA أو نصاً عادياً
    const cdataMatch = item.match(/<title\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/);
    const plainMatch = item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/);
    let raw = cdataMatch?.[1] ?? plainMatch?.[1] ?? '';
    raw = raw.trim();
    // فكّ كيانات HTML الأساسية
    raw = raw
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    if (raw) titles.push(raw);
  }
  return titles;
}

/** يعدّ الكلمات في عنوان — بلا الاعتماد على المحرك (لتفادي دورة). */
function countTokens(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const collected = [];
const perSource = {};
for (const s of sources) {
  const xml = readFileSync(join(RSS, s.file), 'utf8');
  const titles = extractTitles(xml);
  const filtered = titles.filter((t) => {
    const n = countTokens(t);
    return n >= MIN_TOKENS && n <= MAX_TOKENS;
  });
  const seen = new Set();
  const kept = [];
  for (const t of filtered) {
    if (seen.has(t)) continue;
    seen.add(t);
    kept.push({ source: s.tag, headline: t, tokens: countTokens(t) });
    if (kept.length >= PER_SOURCE) break;
  }
  perSource[s.tag] = { available: titles.length, filtered: filtered.length, kept: kept.length };
  collected.push(...kept);
}

const payload = {
  _meta: {
    description: 'عيّنة عناوين إخبارية عربية حقيقية للقياس المرجعي — لا وسم كيانات، لكنها واقعية.',
    source: 'RSS من 5 مصادر — استخراج تلقائي، بلا اختيار انتقائي.',
    fetchedAt: new Date().toISOString(),
    perSource,
    total: collected.length,
    tokenRange: [MIN_TOKENS, MAX_TOKENS],
  },
  headlines: collected,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`extracted: ${collected.length} headlines`);
for (const [tag, stat] of Object.entries(perSource)) {
  console.log(`  ${tag}: ${stat.kept}/${stat.filtered} filtered (of ${stat.available} available)`);
}
