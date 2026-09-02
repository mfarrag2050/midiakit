// scripts/diagnose-unknown-changes.mjs — يفحص الحالات غير المصنّفة.
//
// **المسألة:** من 33 عنواناً تغيّر تقسيمها، 12 صُنّفت unknown/other.
// نحتاج التأكد أن كل حالة تعود لقاعدة معروفة في `semantic-break.ts` —
// خصوصاً `isIdafaBareToDef` و`isBareToBare` (لم يصنّفهما الماسح الأول).
//
// **يطبع لكل حالة:**
//   • العنوان الكامل + المصدر
//   • التقسيم قبل/بعد مع علامات ⇢ عند الحدود
//   • كل حدّ متغيّر (removed من off، added في on):
//       - قيمة breakPenalty(base) و breakPenalty(extended)
//       - التصنيف الكامل (بما فيه idafa و bare-bare و neutral)
//   • حكم إجمالي: idafa · bare-bare · cost-redistribution · genuinely-other

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
  computeBreakPenalties,
} from '@pf-mediakit/engine';
import {
  BREAK_INFINITY,
  BREAK_STRONG,
  BREAK_MEDIUM,
  BREAK_NEUTRAL,
  breakPenalty,
} from '@pf-mediakit/engine';
import { parseTokens } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };

// ── الموارد ─────────────────────────────────────────
const places = JSON.parse(readFileSync(join(ROOT, 'data/external/places.json'), 'utf8')).places;
const entities = JSON.parse(readFileSync(join(ROOT, 'data/external/entities.json'), 'utf8')).entities;
const titles = JSON.parse(readFileSync(join(ROOT, 'data/external/titles.json'), 'utf8')).titles;
const baseLex = loadDefaultLexicon();
const extLex = extendLexicon(baseLex, { titles, places, entities });

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

/** تصنيف كامل مطابق لترتيب فحص `semantic-break.ts`. */
function classify(prevTok, currTok) {
  const prev = normalizeArabic(prevTok);
  const curr = normalizeArabic(currTok);
  if (!prev || !curr) return { rule: 'edge', penalty: BREAK_INFINITY };
  const pair = `${prev}|${curr}`;
  if (placePairs.has(pair)) return { rule: 'place-pair', penalty: BREAK_STRONG };
  if (entityPairs.has(pair)) return { rule: 'entity-pair', penalty: BREAK_STRONG };
  if (titleSet.has(prev)) return { rule: 'title-name', penalty: BREAK_STRONG };
  if (baseLex.isCompoundNamePrefix(prev)) {
    // تطابق شرطي داخل isCompoundName — نبقى محافظين
    if (prev === 'عبد') {
      if (startsWithAl(curr)) return { rule: 'compound-name(عبد+ال)', penalty: BREAK_STRONG };
    } else if (curr.length > 1) {
      return { rule: 'compound-name', penalty: BREAK_STRONG };
    }
  }
  if (baseLex.isInseparableParticle(prev)) return { rule: 'particle', penalty: BREAK_INFINITY };
  if (baseLex.isNumber(prev)) return { rule: 'number', penalty: BREAK_INFINITY };
  if (baseLex.isConjunction(prev)) return { rule: 'conjunction', penalty: BREAK_STRONG };
  if (!startsWithAl(prev) && startsWithAl(curr)) return { rule: 'idafa(bare→def)', penalty: BREAK_INFINITY };
  if (!startsWithAl(prev) && !startsWithAl(curr)) return { rule: 'bare-bare', penalty: BREAK_MEDIUM };
  return { rule: 'neutral', penalty: BREAK_NEUTRAL };
}

// ── هويّتان ──────────────────────────────────────────
const brandOff = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: { ...DEFAULT_BRAND.typography.semanticBreaks, enabled: false },
  },
});
const brandOn = resolveBrand(DEFAULT_BRAND);

const headlines = JSON.parse(readFileSync(join(ROOT, 'data/external/rss-headlines.json'), 'utf8')).headlines;

function planLines(headline, brand, lexicon) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx, size: SIZE, template: BREAKING, brand,
    content: { headline, source: 'المصدر' },
    ...(lexicon && { lexicon }),
    fps: 30,
  });
  const h = plan.headline;
  if (!h) return null;
  return {
    fs: h.fontSize,
    lines: h.linesJustified.map((l) => l.map((t) => t.text ?? '').join(' ')),
  };
}

/** يعيد قائمة فهارس التوكن التي تسبق كسر السطر. */
function boundariesOf(lines) {
  const out = [];
  let idx = -1;
  for (let li = 0; li < lines.length - 1; li++) {
    const words = lines[li].split(/\s+/).filter(Boolean);
    idx += words.length;
    out.push(idx);
  }
  return out;
}

// ── جمع كل التغييرات ────────────────────────────────
const changed = [];
for (const item of headlines) {
  const off = planLines(item.headline, brandOff, undefined);
  const on = planLines(item.headline, brandOn, extLex);
  if (!off || !on) continue;
  const same = off.lines.join(' | ') === on.lines.join(' | ');
  if (same) continue;

  const words = item.headline.split(/\s+/).filter(Boolean);
  const bOff = boundariesOf(off.lines);
  const bOn = boundariesOf(on.lines);
  const bOffSet = new Set(bOff);
  const bOnSet = new Set(bOn);
  const removed = bOff.filter((b) => !bOnSet.has(b));
  const added = bOn.filter((b) => !bOffSet.has(b));

  // فحص كل حدّ مُزال — نعرف قاعدته
  const rulesRejected = removed.map((b) => {
    const prev = words[b];
    const curr = words[b + 1];
    return { b, prev, curr, ...classify(prev, curr) };
  });

  // الصنف الأولي — مثل الماسح السابق
  const knownRules = new Set(['place-pair', 'entity-pair', 'title-name', 'compound-name', 'compound-name(عبد+ال)', 'particle', 'number', 'conjunction']);
  const primary = rulesRejected.find((r) => knownRules.has(r.rule))
    ?? rulesRejected[0]
    ?? null;
  const primaryLabel = primary?.rule ?? 'no-removed';

  changed.push({
    headline: item.headline,
    source: item.source,
    fsOff: off.fs,
    fsOn: on.fs,
    offLines: off.lines,
    onLines: on.lines,
    words,
    removed,
    added,
    rulesRejected,
    primaryLabel,
  });
}

// ── التصنيف الأصلي (لتحديد "الاثني عشر") ─────────────
const originalUnknown = changed.filter((c) => {
  // الصنف "unknown" الأصلي = removed.length === 0
  // الصنف "other" الأصلي = كل rulesRejected.rule === 'other' (لم يصنّف)
  // في نظام التصنيف الجديد، 'idafa', 'bare-bare', 'neutral' كانت تظهر كـ'other'
  // لكن primaryLabel قد يكون 'no-removed' (unknown) أو أحد الجدد
  return c.rulesRejected.length === 0
      || c.rulesRejected.every((r) => !['place-pair','entity-pair','title-name','compound-name','compound-name(عبد+ال)','particle','number','conjunction'].includes(r.rule));
});

// ── الطباعة ─────────────────────────────────────────
console.log(`\nتم فحص ${headlines.length} عنواناً، تغيّر تقسيمها في ${changed.length}.`);
console.log(`الحالات غير المصنّفة سابقاً (unknown/other): ${originalUnknown.length}\n`);

console.log('══════ التوزيع الجديد بعد فتح idafa و bare-bare ══════');
const buckets = {};
for (const c of originalUnknown) {
  // نأخذ أوّل قاعدة removed غير-neutral، وإلا نضع "cost-redistribution"
  const first = c.rulesRejected.find((r) => r.rule !== 'neutral') ?? c.rulesRejected[0];
  const bucket = first?.rule ?? 'cost-redistribution';
  (buckets[bucket] ??= []).push(c);
}
for (const [rule, list] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rule.padEnd(30)} : ${list.length}`);
}

console.log('\n\n══════ التفصيل: 12 حالة، مع breakPenalty الفعلي ══════');
for (let i = 0; i < originalUnknown.length; i++) {
  const c = originalUnknown[i];
  console.log(`\n─── ${i + 1}/${originalUnknown.length} · ${c.source} ───`);
  console.log(`العنوان: ${c.headline}`);
  console.log(`fs: off=${c.fsOff}  on=${c.fsOn}`);
  console.log(`قبل: ${c.offLines.map((l, i) => (i < c.offLines.length - 1 ? l + ' ⇢' : l)).join(' | ')}`);
  console.log(`بعد: ${c.onLines.map((l, i) => (i < c.onLines.length - 1 ? l + ' ⇢' : l)).join(' | ')}`);

  // penalties from computeBreakPenalties with extended lexicon
  const tokens = parseTokens(c.headline);
  const penalties = computeBreakPenalties(tokens, extLex);
  const fmtPen = (p) => (p === Infinity ? '∞' : String(p));

  if (c.removed.length === 0) {
    console.log(`  ⚑ لا حدود مُزالة — on أضاف ${c.added.length} حدود جديدة.`);
    console.log(`     أسباب محتملة: تغيّر عدد الأسطر أو إعادة توزيع كلي للكلفة.`);
    for (const b of c.added) {
      const prev = c.words[b] ?? '?';
      const curr = c.words[b + 1] ?? '?';
      const penIdx = b + 1; // الفهرس داخل tokens = index الكلمة التي بعدها
      const pen = penalties[penIdx];
      const cls = classify(prev, curr);
      console.log(`     ➕ حدّ جديد بعد "${prev}" (index=${b}) → "${curr}"  breakPenalty=${fmtPen(pen)}  تصنيف=${cls.rule}`);
    }
  } else {
    for (const r of c.rulesRejected) {
      const penIdx = r.b + 1;
      const pen = penalties[penIdx];
      console.log(`  ➖ حدّ مُزال بعد "${r.prev}" (index=${r.b}) → "${r.curr}"  breakPenalty=${fmtPen(pen)}  تصنيف=${r.rule}`);
    }
    if (c.added.length > 0) {
      for (const b of c.added) {
        const prev = c.words[b] ?? '?';
        const curr = c.words[b + 1] ?? '?';
        const penIdx = b + 1;
        const pen = penalties[penIdx];
        const cls = classify(prev, curr);
        console.log(`  ➕ حدّ جديد بعد "${prev}" (index=${b}) → "${curr}"  breakPenalty=${fmtPen(pen)}  تصنيف=${cls.rule}`);
      }
    }
  }
}
