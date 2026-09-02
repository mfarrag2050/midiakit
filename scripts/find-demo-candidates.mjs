// scripts/find-demo-candidates.mjs — يمشط عناوين RSS ويصنّفها:
// (١) هل تغيّر التقسيم فعلاً (word-to-line) بين off/on؟
// (٢) ما القاعدة التي تدخّلت عند كل حدّ مُغيَّر؟
// (٣) درجة وضوح الفرق للعرض التجاري.
//
// **درس L-11 (2026-09-02):** المقارنة القديمة `off.lines.join(' | ') ===
// on.lines.join(' | ')` كانت تشمل محارف الكشيدة (U+0640) — عناوين نفس
// word-to-line تماماً لكن بتوزيع كشيدة مختلف كانت تُحسب «تغيّرت»، مما
// أنتج فئة كاذبة `unknown`. الحل: تجريد الكشيدة قبل المقارنة، وفصل
// المخرج إلى `visual-only` (نفس التوزيع) و `genuine-reflow` (تغيّر فعلي).
// المخرج: قائمة مرشّحين مفروزين حسب النوع (particle · place · entity ·
// title · compound-name · conjunction · number · idafa · bare-bare · neutral).

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  buildRenderPlan,
  loadDefaultLexicon,
  extendLexicon,
  normalizeArabic,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };

// ── تحميل القوائم ────────────────────────────────
const places = JSON.parse(readFileSync(join(ROOT, 'data/external/places.json'), 'utf8')).places;
const entities = JSON.parse(readFileSync(join(ROOT, 'data/external/entities.json'), 'utf8')).entities;
const titles = JSON.parse(readFileSync(join(ROOT, 'data/external/titles.json'), 'utf8')).titles;
const baseLex = loadDefaultLexicon();
const extLex = extendLexicon(baseLex, { titles, places, entities });

// ── فهارس تصنيف السبب ──────────────────────────
const titleSet = new Set(titles.map((s) => normalizeArabic(s)));

function pairsOf(names) {
  const out = new Set();
  for (const n of names) {
    const w = n.split(/\s+/).map(normalizeArabic).filter(Boolean);
    for (let i = 0; i < w.length - 1; i++) out.add(`${w[i]}|${w[i + 1]}`);
  }
  return out;
}
const placePairs = pairsOf(places);
const entityPairs = pairsOf(entities);

function startsWithAl(s) {
  const n = normalizeArabic(s);
  return n.length > 2 && n.startsWith('ال');
}

// ── الهويتان ─────────────────────────────────────
const brandOff = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: { ...DEFAULT_BRAND.typography.semanticBreaks, enabled: false },
  },
});
const brandOn = resolveBrand(DEFAULT_BRAND); // enabled=true افتراضياً

const headlines = JSON.parse(
  readFileSync(join(ROOT, 'data/external/rss-headlines.json'), 'utf8')
).headlines;

/** تجريد الكشيدة (U+0640) قبل أي مقارنة. */
const stripKashida = (s) => s.replace(/ـ/g, '');

function measure(headline, brand, lexicon) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const content = { headline, source: 'المصدر' };
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content,
    ...(lexicon && { lexicon }),
    fps: 30,
  });
  const h = plan.headline;
  if (!h) return null;
  // أسطر مُنظَّفة من الكشيدة — للمقارنة الدلالية.
  const linesClean = h.linesJustified.map((line) =>
    stripKashida(line.map((t) => t.text ?? '').join(' '))
  );
  // أسطر خام — للعرض في التقرير.
  const linesRaw = h.linesJustified.map((line) =>
    line.map((t) => t.text ?? '').join(' ')
  );
  return { fs: h.fontSize, chosenBoxW: h.chosenBoxW, linesClean, linesRaw };
}

// ── تصنيف كامل مطابق لترتيب فحص `semantic-break.ts` ─────
// يشمل الآن idafa و bare-bare و neutral — لا فئة «other» فارغة.
function classifyBoundary(prev, curr) {
  const p = normalizeArabic(prev);
  const c = normalizeArabic(curr);
  if (!p || !c) return 'edge';
  const pair = `${p}|${c}`;
  if (placePairs.has(pair)) return 'place-pair';
  if (entityPairs.has(pair)) return 'entity-pair';
  if (titleSet.has(p)) return 'title-name';
  if (baseLex.isCompoundNamePrefix(p)) return 'compound-name';
  if (baseLex.isInseparableParticle(p)) return 'particle';
  if (baseLex.isNumber(p)) return 'number';
  if (baseLex.isConjunction(p)) return 'conjunction';
  if (!startsWithAl(p) && startsWithAl(c)) return 'idafa';
  if (!startsWithAl(p) && !startsWithAl(c)) return 'bare-bare';
  return 'neutral';
}

// كل هذه قواعد موثّقة في semantic-break.ts — لا فئة `other`.
const KNOWN_RULES = new Set([
  'place-pair', 'entity-pair', 'title-name', 'compound-name',
  'particle', 'number', 'conjunction', 'idafa', 'bare-bare', 'neutral',
  'edge',
]);

/** حدود سطور = فهرس آخر كلمة في كل سطر (ما عدا الأخير). */
function boundariesOf(linesClean) {
  const out = [];
  let idx = -1;
  for (let li = 0; li < linesClean.length - 1; li++) {
    const words = linesClean[li].split(/\s+/).filter(Boolean);
    idx += words.length;
    out.push(idx);
  }
  return out;
}

function analyze(headline) {
  const off = measure(headline, brandOff, undefined);
  const on = measure(headline, brandOn, extLex);
  if (!off || !on) return null;

  const cleanSame = off.linesClean.join(' | ') === on.linesClean.join(' | ');
  const rawSame = off.linesRaw.join(' | ') === on.linesRaw.join(' | ');

  if (rawSame) return { headline, category: 'identical' };

  // نفس النص بعد تجريد الكشيدة ⇒ نفس word-to-line ⇒ visual-only.
  if (cleanSame) {
    return {
      headline,
      category: 'visual-only',
      fsOff: off.fs,
      fsOn: on.fs,
      boxWOff: off.chosenBoxW,
      boxWOn: on.chosenBoxW,
      lines: off.linesClean, // كلاهما متطابق بعد التجريد
    };
  }

  // نص مختلف بعد التجريد ⇒ تعيين word-to-line تغيّر فعلاً.
  const words = headline.split(/\s+/).filter(Boolean);
  const bOff = new Set(boundariesOf(off.linesClean));
  const bOn = new Set(boundariesOf(on.linesClean));
  const removed = [...bOff].filter((b) => !bOn.has(b));
  const added = [...bOn].filter((b) => !bOff.has(b));

  const rulesRejected = [];
  for (const b of removed) {
    const prev = words[b];
    const curr = words[b + 1];
    if (!prev || !curr) continue;
    rulesRejected.push({ boundary: b, prev, curr, rule: classifyBoundary(prev, curr) });
  }

  // القاعدة الأساسية = أول قاعدة رُفضت غير-عامة (neutral آخر مطاف).
  // ترتيب الأولوية للعرض: الأخصّ قبل الأعمّ (نفس منطق L-08).
  const priority = [
    'place-pair', 'entity-pair', 'title-name', 'compound-name',
    'particle', 'number', 'conjunction', 'idafa', 'bare-bare', 'neutral', 'edge',
  ];
  const primaryRule =
    rulesRejected
      .slice()
      .sort((a, b) => priority.indexOf(a.rule) - priority.indexOf(b.rule))[0]?.rule
    ?? 'no-removed-boundary'; // حالة نظرية: reflow بلا إزالة حد — إضافة فقط

  return {
    headline,
    category: 'genuine-reflow',
    fsOff: off.fs,
    fsOn: on.fs,
    boxWOff: off.chosenBoxW,
    boxWOn: on.chosenBoxW,
    off: off.linesClean,
    on: on.linesClean,
    removedBoundaries: removed,
    addedBoundaries: added,
    rulesRejected,
    primaryRule,
  };
}

// ── التنفيذ ─────────────────────────────────────
const visualOnly = [];
const genuine = [];
let identical = 0;
for (const item of headlines) {
  const a = analyze(item.headline);
  if (!a) continue;
  if (a.category === 'identical') { identical++; continue; }
  const enriched = { ...a, source: item.source };
  if (a.category === 'visual-only') visualOnly.push(enriched);
  else genuine.push(enriched);
}

// فرز genuine حسب القاعدة للعرض
const byRule = {};
for (const c of genuine) {
  (byRule[c.primaryRule] ??= []).push(c);
}
for (const key of Object.keys(byRule)) {
  byRule[key].sort((a, b) => {
    const ra = a.removedBoundaries.length;
    const rb = b.removedBoundaries.length;
    if (ra !== rb) return ra - rb;
    return a.headline.length - b.headline.length;
  });
}

// ── التقرير ────────────────────────────────────
console.log(`\nإجمالي العناوين المفحوصة: ${headlines.length}`);
console.log(`  identical         : ${identical}`);
console.log(`  visual-only       : ${visualOnly.length}  (نفس word-to-line، اختلاف boxW/كشيدة فقط — لا تغيّر دلالي)`);
console.log(`  genuine-reflow    : ${genuine.length}  (تعيين word-to-line تغيّر فعلاً)`);

console.log(`\n════ توزيع genuine-reflow حسب القاعدة (${genuine.length}) ════`);
const displayOrder = [
  'particle', 'bare-bare', 'place-pair', 'entity-pair',
  'title-name', 'number', 'conjunction', 'compound-name',
  'idafa', 'neutral', 'no-removed-boundary',
];
for (const rule of displayOrder) {
  const list = byRule[rule];
  if (!list?.length) continue;
  console.log(`  ${rule.padEnd(22)} : ${list.length}`);
}
// أي فئة غير متوقّعة (لن تحدث بعد الإصلاح، لكن نُبقي التحقق):
const unexpected = Object.keys(byRule).filter((k) => !displayOrder.includes(k));
if (unexpected.length) {
  console.log(`\n⚠ فئات غير متوقّعة (تحقّق من classifyBoundary):`);
  for (const rule of unexpected) console.log(`  ${rule.padEnd(22)} : ${byRule[rule].length}`);
}

console.log('\n\n════ أوّل 5 مرشّحين لكل قاعدة (للعرض التجاري) ════');
for (const rule of displayOrder) {
  const list = byRule[rule] ?? [];
  if (list.length === 0) continue;
  console.log(`\n── ${rule.toUpperCase()} (${list.length}) ──`);
  for (const c of list.slice(0, 5)) {
    console.log(`  [${c.source}] "${c.headline}"`);
    console.log(`    off (fs=${c.fsOff}, boxW=${c.boxWOff}): ${c.off.join(' | ')}`);
    console.log(`    on  (fs=${c.fsOn}, boxW=${c.boxWOn}): ${c.on.join(' | ')}`);
    console.log(`    القاعدة: ${c.rulesRejected.map((r) => `${r.rule}(${r.prev}→${r.curr})`).join(', ')}`);
  }
}

// عيّنة صغيرة من visual-only للسجلّ — لا لعرض تجاري
if (visualOnly.length > 0) {
  console.log(`\n\n════ عيّنة visual-only (${visualOnly.length}) — للسجلّ، لا للعرض ════`);
  for (const c of visualOnly.slice(0, 3)) {
    console.log(`  [${c.source}] "${c.headline}"`);
    console.log(`    fs=${c.fsOff}/${c.fsOn}  boxW=${c.boxWOff}/${c.boxWOn}  (نفس الأسطر)`);
  }
}
