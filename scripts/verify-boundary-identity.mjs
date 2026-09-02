// scripts/verify-boundary-identity.mjs — يفحص فرضية: هل «unknown/other»
// هي حقاً تغييرات في تعيين الكلمات للأسطر، أم فقط تباين بصري (كشيدة/عرض)
// مع تعيين مطابق؟
//
// **المنهج:** لكل حالة "no-removed"، نقارن:
//   • فهارس التوكن على كل حدّ (word-to-line assignment)
//   • fs المُختار
//   • chosenBoxW
// إذا تطابقت الفهارس والـfs، الفرق كشيدة فقط ⇒ ليس تغييراً دلالياً بأي معنى.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand, buildRenderPlan, loadDefaultLexicon, extendLexicon,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);
const SIZE = { w: 1080, h: 1350 };

const places = JSON.parse(readFileSync(join(ROOT, 'data/external/places.json'), 'utf8')).places;
const entities = JSON.parse(readFileSync(join(ROOT, 'data/external/entities.json'), 'utf8')).entities;
const titles = JSON.parse(readFileSync(join(ROOT, 'data/external/titles.json'), 'utf8')).titles;
const extLex = extendLexicon(loadDefaultLexicon(), { titles, places, entities });

const brandOff = resolveBrand({
  ...DEFAULT_BRAND,
  typography: { ...DEFAULT_BRAND.typography, semanticBreaks: { ...DEFAULT_BRAND.typography.semanticBreaks, enabled: false } },
});
const brandOn = resolveBrand(DEFAULT_BRAND);

function inspect(headline, brand, lex) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx, size: SIZE, template: BREAKING, brand,
    content: { headline, source: 'المصدر' },
    ...(lex && { lexicon: lex }),
    fps: 30,
  });
  const h = plan.headline;
  const linesJust = h.linesJustified;
  // نُنظّف الكشيدة (U+0640) قبل العدّ — عدد الكلمات على السطر لا يتأثّر
  // بمقدار التمطيط، فقط بالتقسيم الحقيقي.
  const lineTexts = linesJust.map((line) =>
    line.map((t) => (t.text ?? '').replace(/ـ/g, '')).join(' ')
  );
  const wordCounts = lineTexts.map(
    (s) => s.trim().split(/\s+/).filter(Boolean).length
  );
  return {
    fs: h.fontSize,
    chosenBoxW: h.chosenBoxW,
    wordCounts,
    lineTexts, // نصّ بلا كشيدة — للمقارنة المُطابِقة للمعنى لا للبصر
    linesRaw: linesJust.map((line) => line.map((t) => t.text ?? '').join(' ')),
  };
}

const headlines = JSON.parse(readFileSync(join(ROOT, 'data/external/rss-headlines.json'), 'utf8')).headlines;

console.log('العنوان                                                 | fs off/on | boxW off/on | word-counts off/on | مطابق؟');
console.log('─'.repeat(115));

// مقياس «تغيّر بصري» = الأسطر بعد إزالة الكشيدة تختلف بأي وجه.
// مقياس «تغيّر تعيين word-to-line» = عدد الكلمات على أيّ سطر يختلف.
let visualOnly = 0;   // تغيّر كشيدة/boxW فقط (نفس التوزيع)
let genuineChange = 0; // توزيع مختلف فعلاً
const genuines = [];

for (const item of headlines) {
  const a = inspect(item.headline, brandOff, undefined);
  const b = inspect(item.headline, brandOn, extLex);
  const rawDifferent = a.linesRaw.join(' | ') !== b.linesRaw.join(' | ');
  if (!rawDifferent) continue;
  const cleanDifferent = a.lineTexts.join(' | ') !== b.lineTexts.join(' | ');
  const countsSame = JSON.stringify(a.wordCounts) === JSON.stringify(b.wordCounts);
  if (!cleanDifferent && countsSame) {
    visualOnly++;
    const short = item.headline.slice(0, 55) + (item.headline.length > 55 ? '…' : '');
    console.log(
      `${short.padEnd(56)} | fs ${a.fs}/${b.fs} | boxW ${String(a.chosenBoxW).padStart(3)}/${String(b.chosenBoxW).padStart(3)} | words [${a.wordCounts}]`
    );
  } else {
    genuineChange++;
    genuines.push({ item, a, b });
  }
}

console.log('\n═══════════════════════════════════════════════');
console.log(`إجمالي تغيّر بصري:                   ${visualOnly + genuineChange}`);
console.log(`  ↳ نفس word-to-line + نفس fs:      ${visualOnly}  (فرق كشيدة/boxW فقط — لا تغيّر دلالي)`);
console.log(`  ↳ توزيع word-to-line مختلف فعلاً: ${genuineChange}  (تغيّر دلالي حقيقي)`);
console.log('═══════════════════════════════════════════════');

console.log(`\nالتغييرات الحقيقية (${genuineChange}):`);
for (const d of genuines) {
  console.log(`\n  «${d.item.headline}»  [${d.item.source}]`);
  console.log(`    fs ${d.a.fs}/${d.b.fs}   boxW ${d.a.chosenBoxW}/${d.b.chosenBoxW}   words [${d.a.wordCounts}] → [${d.b.wordCounts}]`);
  console.log(`    قبل: ${d.a.lineTexts.join(' | ')}`);
  console.log(`    بعد: ${d.b.lineTexts.join(' | ')}`);
}
