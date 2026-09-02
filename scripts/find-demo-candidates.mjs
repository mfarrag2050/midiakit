// scripts/find-demo-candidates.mjs — يمشط 265 عنوان RSS ويصنّفها:
// (١) أي عنوان تغيّر تقسيمه بين off/on
// (٢) ما القاعدة التي تدخّلت عند الحد المُغيَّر
// (٣) درجة وضوح الفرق (كم من الأسطر تغيّرت)
//
// المخرج: قائمة مرشّحين مفروزين حسب النوع (particle · place · entity · title)،
// مع أوّل 5 مرشّحين لكل نوع.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile } from 'node:fs/promises';
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

// ── القوائم كأزواج لتصنيف السبب ──────────────────
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
  const lines = h.linesJustified.map((line) => line.map((t) => t.text ?? '').join(' '));
  return { fs: h.fontSize, lines };
}

// ── قوائم فحص القاعدة عند حدّ ─────────────────
// نأخذ (last word of prev-line, first word of next-line) ونصنّف:
//   • particle: prev كلمة نحوية ملازمة (حرف جر، ناسخ، نافي، استفهام...)
//   • place: (prev, curr) في placePairs
//   • entity: (prev, curr) في entityPairs
//   • title: prev في titleSet
//   • compound-name: prev من عبد/أبو/ابن/آل/... (isCompoundNamePrefix)
//   • idafa-bare-def, bare-bare — عام
function classifyBoundary(prev, curr) {
  const p = normalizeArabic(prev);
  const c = normalizeArabic(curr);
  const pair = `${p}|${c}`;
  if (placePairs.has(pair)) return 'place';
  if (entityPairs.has(pair)) return 'entity';
  if (titleSet.has(p)) return 'title';
  if (baseLex.isCompoundNamePrefix(p)) return 'compound-name';
  if (baseLex.isInseparableParticle(p)) return 'particle';
  if (baseLex.isNumber(p)) return 'number';
  if (baseLex.isConjunction(p)) return 'conjunction';
  return 'other';
}

// حدود سطور off = الكلمات في نهاية كل سطر (ما عدا الأخير)
// نقارن بحدود on؛ فرق يعني إما إزالة حدّ off أو إضافة حدّ جديد.
function boundariesOf(lines) {
  // نبني قائمة (endIdx, endWord) — endIdx = فهرس آخر كلمة في السطر
  // كتوكن ضمن العنوان كاملاً.
  const out = [];
  let idx = -1;
  for (let li = 0; li < lines.length - 1; li++) {
    const words = lines[li].split(/\s+/).filter(Boolean);
    idx += words.length;
    out.push(idx);
  }
  return out;
}

// نجمع لكل عنوان: هل تغيّر التقسيم؟ ما القواعد التي شاركت؟
function analyze(headline) {
  const off = measure(headline, brandOff, undefined);
  const on = measure(headline, brandOn, extLex);
  if (!off || !on) return null;
  const same = off.lines.join(' | ') === on.lines.join(' | ');
  if (same) return { headline, same: true };

  const words = headline.split(/\s+/).filter(Boolean);
  const bOff = new Set(boundariesOf(off.lines));
  const bOn = new Set(boundariesOf(on.lines));

  const removed = [...bOff].filter((b) => !bOn.has(b)); // موجود في off وليس في on
  const added = [...bOn].filter((b) => !bOff.has(b));   // موجود في on وليس في off

  // كل حدّ off مُزال يعني: on رفض الكسر هناك — نصنّف السبب من (words[b], words[b+1])
  const rulesRejected = [];
  for (const b of removed) {
    const prev = words[b];
    const curr = words[b + 1];
    if (!prev || !curr) continue;
    rulesRejected.push({ boundary: b, prev, curr, rule: classifyBoundary(prev, curr) });
  }

  return {
    headline,
    same: false,
    fsOff: off.fs,
    fsOn: on.fs,
    off: off.lines,
    on: on.lines,
    removedBoundaries: removed,
    addedBoundaries: added,
    rulesRejected,
    // نوع أساسي = أول قاعدة رُفضت غير-عام
    primaryRule: rulesRejected.find((r) => r.rule !== 'other')?.rule
      ?? rulesRejected[0]?.rule
      ?? 'unknown',
  };
}

// ── التنفيذ ─────────────────────────────────────
const changed = [];
for (const item of headlines) {
  const a = analyze(item.headline);
  if (!a || a.same) continue;
  changed.push({ ...a, source: item.source });
}

// فرز ضمن كل صنف: عناوين قصيرة (أوضح بصرياً) وحدّ واحد مُزال (أنقى دلالياً)
const byRule = {};
for (const c of changed) {
  const key = c.primaryRule;
  (byRule[key] ??= []).push(c);
}
for (const key of Object.keys(byRule)) {
  byRule[key].sort((a, b) => {
    // أولاً: القرارات المُميَّزة عدد = 1
    const removedA = a.removedBoundaries.length;
    const removedB = b.removedBoundaries.length;
    if (removedA !== removedB) return removedA - removedB;
    // ثم: العنوان الأقصر — أوضح للعرض
    return a.headline.length - b.headline.length;
  });
}

console.log(`\nمجموع تغيّرات التقسيم: ${changed.length} من ${headlines.length}`);
console.log('التوزّع حسب القاعدة:');
for (const [rule, items] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rule.padEnd(15)} : ${items.length}`);
}

console.log('\n\n══════ أوّل 5 مرشّحين لكل قاعدة ══════');
for (const rule of ['particle', 'place', 'entity', 'title', 'compound-name', 'conjunction', 'number', 'other']) {
  const list = byRule[rule] ?? [];
  if (list.length === 0) continue;
  console.log(`\n── ${rule.toUpperCase()} (${list.length}) ──`);
  for (const c of list.slice(0, 5)) {
    console.log(`  [${c.source}] "${c.headline}"`);
    console.log(`    off (fs=${c.fsOff}): ${c.off.join(' | ')}`);
    console.log(`    on  (fs=${c.fsOn}): ${c.on.join(' | ')}`);
    console.log(`    القاعدة: ${c.rulesRejected.map((r) => `${r.rule}(${r.prev}→${r.curr})`).join(', ')}`);
  }
}
