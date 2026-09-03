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
// **باغ 2026-09-02 (كُشف باسترجاع النمط):** DEFAULT_BRAND.enabled
// تحوّلت إلى true في 4ca3242. brandOff كان يرث الافتراضي فصار on
// بلا قصد، وقارن السكربت on ضد on (دلتا 0.04% ضجيج). الإصلاح:
// **فرض enabled=false صراحةً** على brandOff — نفس النمط في
// find-demo-candidates.mjs. راجع docs/LESSONS.md §L-35.
const brandOff = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: {
      ...DEFAULT_BRAND.typography.semanticBreaks,
      enabled: false,
    },
  },
});
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
  // نحسب fill = width_ratio نسبة إلى أطول سطر (مقياس ملء موجود)
  const maxW = Math.max(...widths, 1);
  const fills = widths.map((w) => w / maxW);
  const minFill = Math.min(...fills);
  const meanFill = fills.reduce((a, b) => a + b, 0) / fills.length;
  const stddev = Math.sqrt(
    fills.reduce((s, f) => s + (f - meanFill) ** 2, 0) / fills.length
  );
  // **Coefficient of Variation** لأطوال الأسطر داخل العنوان:
  //   cov = stddev(widths) / mean(widths)
  // مقياس اتساق مباشر — انخفاضه = أسطر أقرب في الطول (بصرف النظر عن
  // fs أو boxW). راجع docs/LESSONS.md §L-38.
  const meanWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
  const stdWidth = Math.sqrt(
    widths.reduce((s, w) => s + (w - meanWidth) ** 2, 0) / widths.length
  );
  const cov = meanWidth > 0 ? stdWidth / meanWidth : 0;
  return {
    dt,
    fs: h.fontSize,
    lines: h.linesJustified.length,
    minFill,
    meanFill,
    stddev,
    cov,
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

// ── تصنيف كل نتيجة (2026-09-02، L-36):
//   identical      — على وoff أنتجا نفس word-to-line تماماً (بايت-بايت)
//   visual-only    — نفس word-to-line بعد تجريد الكشيدة (كشيدة فقط)
//   genuine-reflow — word-to-line اختلف فعلاً
// **الحكمة:** المتوسط على 265 يخفّف الأثر بحالات لم تتدخّل فيها الميزة.
// الرقم الحقيقي = متوسط الأثر على genuine-reflow (23) — «تدخّلت فعلاً».
const TATWEEL = /ـ/g;
function stripKashida(s) {
  return s.replace(TATWEEL, '');
}
for (const r of results) {
  if (r.on.split === r.off.split) {
    r.category = 'identical';
  } else if (stripKashida(r.on.split) === stripKashida(r.off.split)) {
    r.category = 'visual-only';
  } else {
    r.category = 'genuine-reflow';
  }
}
const identical = results.filter((r) => r.category === 'identical');
const visualOnly = results.filter((r) => r.category === 'visual-only');
const genuineReflow = results.filter((r) => r.category === 'genuine-reflow');

// ── الحساب: البوابات الأربع + قسم أثر الميزة (L-36) ─

// (ج) الملء وانحراف الأطوال — متوسط الفرق على المجموع (للشفافية)
const fillDeltas = results.map((r) => r.on.minFill - r.off.minFill);
const stddevDeltas = results.map((r) => r.on.stddev - r.off.stddev);

const avgFillDelta = fillDeltas.reduce((a, b) => a + b, 0) / fillDeltas.length;
const avgStddevDelta = stddevDeltas.reduce((a, b) => a + b, 0) / stddevDeltas.length;

// أثر الميزة الفعلي — على genuine-reflow فقط (لا يخفّف بحالات محايدة)
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
// قياسان لـfill: minFill (أضعف سطر) وmeanFill (متوسط الأسطر). التفسيران
// مختلفان: minFill يقيس أسوأ حالة، meanFill يقيس المتوسط.
const grFillMinDelta  = mean(genuineReflow.map((r) => r.on.minFill  - r.off.minFill));
const grFillMeanDelta = mean(genuineReflow.map((r) => r.on.meanFill - r.off.meanFill));
const grStddevDelta   = mean(genuineReflow.map((r) => r.on.stddev   - r.off.stddev));
const voFillMinDelta  = mean(visualOnly.map((r) => r.on.minFill  - r.off.minFill));
const voFillMeanDelta = mean(visualOnly.map((r) => r.on.meanFill - r.off.meanFill));
const voStddevDelta   = mean(visualOnly.map((r) => r.on.stddev   - r.off.stddev));
const idFillMinDelta  = mean(identical.map((r) => r.on.minFill  - r.off.minFill));
const idFillMeanDelta = mean(identical.map((r) => r.on.meanFill - r.off.meanFill));
const idStddevDelta   = mean(identical.map((r) => r.on.stddev   - r.off.stddev));

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

// ── أثر الميزة بالتقسيم (L-36) ─────────────────────
console.log('');
console.log('════════ أثر الميزة بالتقسيم (L-36) ════════');
console.log('المتوسط العام يخفّف الأثر بحالات محايدة — الرقم الحاسم');
console.log('على genuine-reflow (تدخّلت فيها الميزة فعلاً).');
console.log('');
console.log('المجموعة        | العدد | Δ ملء (min)     | Δ اتساق (stddev)');
console.log('----------------|-------|-----------------|-----------------');
function fmtPct(v) {
  const s = (v * 100).toFixed(2) + '%';
  return s.padStart(9);
}
console.log(`genuine-reflow  | ${String(genuineReflow.length).padStart(5)} | ${fmtPct(grFillMinDelta).padEnd(16)}| ${fmtPct(grStddevDelta)}`);
console.log(`visual-only     | ${String(visualOnly.length).padStart(5)} | ${fmtPct(voFillMinDelta).padEnd(16)}| ${fmtPct(voStddevDelta)}`);
console.log(`identical       | ${String(identical.length).padStart(5)} | ${fmtPct(idFillMinDelta).padEnd(16)}| ${fmtPct(idStddevDelta)}`);
console.log(`─────────────────────────────────────────────────────────────`);
console.log(`المتوسط العام   | ${String(results.length).padStart(5)} | ${fmtPct(avgFillDelta).padEnd(16)}| ${fmtPct(avgStddevDelta)}  ← مخفَّف`);

// ── الاتساق الحقيقي: coefficient of variation (L-38) ─
console.log('');
console.log('════════ الاتساق الحقيقي (CoV = stddev/mean widths) ════════');
console.log('مقياس مباشر لتقارب الأسطر في الطول داخل كل عنوان.');
console.log('انخفاض CoV = أسطر أقرب في الطول (اتساق أعلى).');
console.log('');
console.log('المجموعة        | العدد | CoV قبل  | CoV بعد  | Δ CoV');
console.log('----------------|-------|----------|----------|----------');
function fmtCov(v) { return v.toFixed(4).padStart(8); }
function fmtCovPct(v) {
  const s = (v * 100).toFixed(2) + '%';
  return s.padStart(9);
}
function report(name, group) {
  const before = mean(group.map((r) => r.off.cov));
  const after = mean(group.map((r) => r.on.cov));
  const delta = after - before;
  console.log(`${name.padEnd(16)}| ${String(group.length).padStart(5)} | ${fmtCov(before)} | ${fmtCov(after)} | ${fmtCovPct(delta)}`);
}
report('genuine-reflow', genuineReflow);
report('visual-only', visualOnly);
report('identical', identical);
report('المتوسط العام', results);

// أيضاً: meanFill delta لكل مجموعة (طلب المالك للتوضيح)
console.log('');
console.log('════════ meanFill Delta (توضيح مقاييس الملء) ════════');
console.log('المجموعة        | العدد | Δ minFill      | Δ meanFill');
console.log('----------------|-------|----------------|----------------');
console.log(`genuine-reflow  | ${String(genuineReflow.length).padStart(5)} | ${fmtPct(grFillMinDelta).padEnd(15)}| ${fmtPct(grFillMeanDelta)}`);
console.log(`visual-only     | ${String(visualOnly.length).padStart(5)} | ${fmtPct(voFillMinDelta).padEnd(15)}| ${fmtPct(voFillMeanDelta)}`);
console.log(`identical       | ${String(identical.length).padStart(5)} | ${fmtPct(idFillMinDelta).padEnd(15)}| ${fmtPct(idFillMeanDelta)}`);

if (regressed.length > 0) {
  console.log('\nعيّنات التراجع (أوّل 5):');
  for (const r of regressed.slice(0, 5)) {
    console.log(`  off: minFill=${r.off.minFill.toFixed(2)} on: ${r.on.minFill.toFixed(2)}  Δ=${(r.off.minFill - r.on.minFill).toFixed(3)}`);
    console.log(`    off split: ${r.off.split.slice(0, 100)}`);
    console.log(`    on  split: ${r.on.split.slice(0, 100)}`);
  }
}
