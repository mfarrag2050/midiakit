// scripts/eval-semantic-rss.mjs — القياس على 265 عنوان RSS حقيقي.
//
// **قرار المالك (2026-09-01):** لا مجموعة يدوية — تُقاس الرقعة على عناوين
// حقيقية لتفادي فخّ L-05 (اختبار يوافق قواعده). WojoodGaza مطلوبة لبوابتي
// (أ) و (ب) — تُعلَّق حتى وصولها.
//
// **البوابات المُقاسة هنا:**
//   (ج) لا تدهور > 5% في الملء أو انحراف الأطوال
//   (د) تراجع softness ≤ 3% من الجمل  (softness = minFill بعد الكشيدة)
//   الأداء: buildRenderPlan ≤ 800ms مع تحميل القوائم
//
// **المقارنة:** لكل عنوان، نبني RenderPlan مرتين — semantic off/on —
// ونجمع الفرق.

import { Canvas, FontLibrary } from 'skia-canvas';
import { performance } from 'node:perf_hooks';
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
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── تحميل خطوط skia-canvas عالمياً ─────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };

// ── تحميل القوائم الخارجية ──────────────────────────
const t0 = performance.now();
const places = JSON.parse(readFileSync(join(ROOT, 'data/external/places.json'), 'utf8')).places;
const entities = JSON.parse(readFileSync(join(ROOT, 'data/external/entities.json'), 'utf8')).entities;
const titles = JSON.parse(readFileSync(join(ROOT, 'data/external/titles.json'), 'utf8')).titles;
const baseLex = loadDefaultLexicon();
const extLex = extendLexicon(baseLex, { titles, places, entities });
const loadMs = performance.now() - t0;
console.log(`load: places=${places.length} entities=${entities.length} titles=${titles.length}  buildTime=${loadMs.toFixed(1)}ms`);

// ── تحميل العناوين ─────────────────────────────────
const headlines = JSON.parse(readFileSync(join(ROOT, 'data/external/rss-headlines.json'), 'utf8')).headlines;
console.log(`headlines: ${headlines.length}`);

// ── هويّتان: أساسي و ممتدّ ──────────────────────────
const brandOff = resolveBrand(DEFAULT_BRAND);
const brandOn = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: {
      ...DEFAULT_BRAND.typography.semanticBreaks,
      enabled: true,
    },
  },
});

// ── مقاييس التخطيط لكل عنوان ────────────────────────
function measureHeadline(headline, brand, lexicon) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const content = { headline, source: 'المصدر' };
  const t0 = performance.now();
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content,
    ...(lexicon && { lexicon }),
    fps: 30,
  });
  const dt = performance.now() - t0;
  const h = plan.headline;
  if (!h) return null;
  const widths = h.linesJustified.map((line) => {
    // نستعمل chosenBoxW كطول أقصى، ونحسب النسبة بمعرفة عرض الكلمات فقط
    // ليست دقيقة كـmeasure، لكن كافية للمقارنة النسبية بين off/on.
    return line.map((t) => (t.text ?? '').length).reduce((a, b) => a + b, 0);
  });
  // نحسب fill = width_ratio نسبة إلى أطول سطر
  const maxW = Math.max(...widths, 1);
  const fills = widths.map((w) => w / maxW);
  const minFill = Math.min(...fills);
  const meanFill = fills.reduce((a, b) => a + b, 0) / fills.length;
  const stddev = Math.sqrt(
    fills.reduce((s, f) => s + (f - meanFill) ** 2, 0) / fills.length
  );
  return {
    dt,
    fs: h.fontSize,
    lines: h.linesJustified.length,
    minFill,
    meanFill,
    stddev,
    split: h.linesJustified.map((line) => line.map((t) => t.text ?? '').join(' ')).join(' | '),
  };
}

// ── الحلقة على العناوين ─────────────────────────────
const results = [];
let failedOff = 0;
let failedOn = 0;
let n = 0;
for (const item of headlines) {
  n++;
  try {
    const off = measureHeadline(item.headline, brandOff, undefined);
    const on = measureHeadline(item.headline, brandOn, extLex);
    if (!off) { failedOff++; continue; }
    if (!on) { failedOn++; continue; }
    results.push({
      source: item.source,
      tokens: item.tokens,
      off,
      on,
    });
  } catch (e) {
    console.error(`[${n}] error:`, e.message);
  }
}
console.log(`processed: ${results.length}/${headlines.length}  offFailed=${failedOff}  onFailed=${failedOn}`);

// ── الحساب: البوابات الأربع ──────────────────────────

// (ج) الملء وانحراف الأطوال — متوسط الفرق
const fillDeltas = results.map((r) => r.on.minFill - r.off.minFill);
const stddevDeltas = results.map((r) => r.on.stddev - r.off.stddev);

const avgFillDelta = fillDeltas.reduce((a, b) => a + b, 0) / fillDeltas.length;
const avgStddevDelta = stddevDeltas.reduce((a, b) => a + b, 0) / stddevDeltas.length;

// (د) softness regression = نسبة العناوين التي minFill انخفض فيها >2%
// «softness» = ملء ما بعد الكشيدة (نستعمل minFill كتقدير مباشر — الأدنى
// هو أضعف نقطة بصرية). الحدّ 2% تقدير معتدل: أقل من ذلك = ضمن حدود الضجيج.
const REGRESSION_THRESHOLD = 0.02;
const regressed = results.filter((r) => r.off.minFill - r.on.minFill > REGRESSION_THRESHOLD);
const regressionRate = regressed.length / results.length;

// (أ) و (ب) — تحتاجان وسم كيانات (WojoodGaza) — تُعلَّق هنا.

// الأداء: متوسط ووسيط buildRenderPlan
const onTimes = results.map((r) => r.on.dt).sort((a, b) => a - b);
const p50 = onTimes[Math.floor(onTimes.length / 2)];
const p95 = onTimes[Math.floor(onTimes.length * 0.95)];
const max = onTimes[onTimes.length - 1];

console.log('\n════════ بوابات المرحلة 3.5 ب-2 (RSS) ════════');
console.log(`عيّنة: ${results.length} عنواناً حقيقياً (${results[0].source}...) — WojoodGaza معلَّق`);
console.log('');
console.log('البوابة | المعيار                       | القيمة        | الحكم');
console.log('--------|-------------------------------|---------------|-------');
console.log(`  أ    | صفر كسر داخل Infinity        | —             | معلَّق (WojoodGaza)`);
console.log(`  ب    | ≥70% انخفاض في كسور 1000     | —             | معلَّق (WojoodGaza)`);
const fillOk = Math.abs(avgFillDelta) <= 0.05;
const stdOk = Math.abs(avgStddevDelta) <= 0.05;
console.log(`  ج₁   | Δملء ≤ 5%                    | ${(avgFillDelta * 100).toFixed(2)}%${' '.repeat(10 - (avgFillDelta * 100).toFixed(2).length)}| ${fillOk ? '✓' : '✗'}`);
console.log(`  ج₂   | Δانحراف ≤ 5%                | ${(avgStddevDelta * 100).toFixed(2)}%${' '.repeat(10 - (avgStddevDelta * 100).toFixed(2).length)}| ${stdOk ? '✓' : '✗'}`);
const softOk = regressionRate <= 0.03;
console.log(`  د    | تراجع softness ≤ 3%          | ${(regressionRate * 100).toFixed(2)}%${' '.repeat(10 - (regressionRate * 100).toFixed(2).length)}| ${softOk ? '✓' : '✗'}`);
const perfOk = p95 <= 800;
console.log(`  ⏱   | buildRenderPlan p95 ≤ 800ms  | ${p95.toFixed(0)}ms${' '.repeat(10 - p95.toFixed(0).length - 2)}| ${perfOk ? '✓' : '✗'}`);
console.log('');
console.log(`أداء: p50=${p50.toFixed(0)}ms  p95=${p95.toFixed(0)}ms  max=${max.toFixed(0)}ms`);
console.log(`تراجع فرديّ (>2%): ${regressed.length} من ${results.length}`);

if (regressed.length > 0) {
  console.log('\nعيّنات التراجع (أوّل 5):');
  for (const r of regressed.slice(0, 5)) {
    console.log(`  off: minFill=${r.off.minFill.toFixed(2)} on: ${r.on.minFill.toFixed(2)}  Δ=${(r.off.minFill - r.on.minFill).toFixed(3)}`);
    console.log(`    off split: ${r.off.split.slice(0, 100)}`);
    console.log(`    on  split: ${r.on.split.slice(0, 100)}`);
  }
}
