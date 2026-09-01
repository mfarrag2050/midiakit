// scripts/build-entities.mjs — يبني data/external/entities.json من Wikidata (CC0).
//
// المدخل: خمسة استفسارات SPARQL (منظمات دولية، هيئات حكومية، أحزاب،
// وسائل إعلام، جامعات، أندية) — كل واحد بحد أقصى 500، إجمالي ≤3000.
// المخرج: أسماء عربية مركّبة (متعدد الكلمات) — الاسم المفرد لا يحتاج
// قاعدة (طوكن واحد لا يُكسر).
// **الترشيح:** إزالة اللاتينية، الحروف غير العربية، السلاسل القصيرة جداً.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'data/external/raw');
const OUT = join(ROOT, 'data/external/entities.json');

const MAX = 3000;
const MAX_BYTES = 500 * 1024;

const TASHKEEL_RE = /[ً-ٰٟ]/g;
const KASHIDA_RE = /ـ/g;
const ALEF_WASLA = /ٱ/g;
const TRIM_PUNCT_RE = /^[،؛؟\.,;:?!\s"'«»()\[\]]+|[،؛؟\.,;:?!\s"'«»()\[\]]+$/g;
function normalize(s) {
  return s.replace(TASHKEEL_RE, '').replace(KASHIDA_RE, '').replace(ALEF_WASLA, 'ا').replace(TRIM_PUNCT_RE, '').replace(/\s+/g, ' ').trim();
}

const ARABIC_ONLY_RE = /[ء-غـ-ي٠-٩]/;
const NON_ARABIC_LETTER_RE = /[پچژگٹڈڑںھۀ-ۏې-ۣک]/;
const HAS_LATIN_RE = /[A-Za-z]/;

function isCleanArabic(s) {
  if (!s) return false;
  if (HAS_LATIN_RE.test(s)) return false;
  if (NON_ARABIC_LETTER_RE.test(s)) return false;
  if (!ARABIC_ONLY_RE.test(s)) return false;
  return true;
}

/** يقرأ CSV بسيطاً بحقلين — قد يحوي علامات اقتباس مزدوجة. */
function parseCsv(text) {
  const lines = text.split('\n').filter(Boolean);
  if (lines[0]?.startsWith('item,')) lines.shift();
  const out = [];
  for (const line of lines) {
    // نبحث عن الفاصلة الأولى — الاسم قد يحوي فواصل مقتبسة
    const idx = line.indexOf(',');
    if (idx < 0) continue;
    let label = line.slice(idx + 1);
    // إن كان محاطاً بعلامات اقتباس، أزلها
    if (label.startsWith('"') && label.endsWith('"')) {
      label = label.slice(1, -1).replace(/""/g, '"');
    }
    out.push(label);
  }
  return out;
}

const sources = [
  { file: 'wd-intl-org.csv', tag: 'intl' },
  { file: 'wd-gov.csv', tag: 'gov' },
  { file: 'wd-party.csv', tag: 'party' },
  { file: 'wd-media.csv', tag: 'media' },
  { file: 'wd-univ.csv', tag: 'univ' },
  { file: 'wd-football.csv', tag: 'football' },
];

const byName = new Map(); // normalized name → source-tag
const perSource = new Map();
for (const s of sources) {
  const text = readFileSync(join(RAW, s.file), 'utf8');
  const labels = parseCsv(text);
  let kept = 0;
  for (const raw of labels) {
    if (!isCleanArabic(raw)) continue;
    const norm = normalize(raw);
    if (norm.length < 3) continue;
    if (!/\s/.test(norm)) continue; // مفرد لا يحتاج قاعدة (طوكن واحد)
    if (byName.has(norm)) continue;
    byName.set(norm, s.tag);
    kept++;
  }
  perSource.set(s.tag, kept);
}

// ترتيب: مدخول موحد بالحروف العربية
const names = [...byName.keys()].sort();
const capped = names.slice(0, MAX);

const payload = {
  _meta: {
    description: 'كيانات عربية للسياق الإخباري (docs/07 §2 قاعدة organizational-entity).',
    source: 'Wikidata SPARQL — دفعات: منظمات دولية، هيئات حكومية، أحزاب، إعلام، جامعات، أندية.',
    license: 'CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'Data from Wikidata (https://www.wikidata.org/), released to the public domain under CC0.',
    generatedAt: new Date().toISOString(),
    stats: {
      total: capped.length,
      bySource: Object.fromEntries(perSource),
    },
  },
  entities: capped,
};

const json = JSON.stringify(payload, null, 0);
writeFileSync(OUT, json);
const bytes = Buffer.byteLength(json, 'utf8');
console.log(`kept: ${capped.length}  bytes: ${bytes}  by source:`, Object.fromEntries(perSource));
console.log('sample:', capped.slice(0, 15).join(' · '));
if (bytes > MAX_BYTES) {
  console.error(`FAIL: ${bytes} > ${MAX_BYTES}`);
  process.exit(1);
}
