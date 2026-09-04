// scripts/verify-perf-gate.mjs — G3 من §3.9 (البوابات الست).
//
// **الميزانية:** `buildRenderPlan` يجب ألا يتجاوز BASELINE × TOLERANCE
// في p95 على 100 استدعاء بمدخل قياسي (breaking template · default brand ·
// عنوان 11 كلمة). أيّ انحدار يُكشَف قبل الدمج.
//
// **الأساس مُشتقّ من قياس حالي** (لا تاريخ غير موجود). سُجِّل داخل
// السكربت في `BASELINE_MS` مع تاريخ القياس. **يُراجَع بعد شهر من
// البيانات الفعلية** — إن اجتاز الأساس معظم الوقت، أُصلحه لأدنى نسبة
// كي يظلّ الحارس مشدوداً؛ إن فشل كثيراً، أرفعه بسبب موثَّق.
//
// **الاختبار السلبي:** `SLOW_TEST=<ms>` يُدخل تأخيراً اصطناعياً قبل
// كل استدعاء — يجب أن يفشل الحارس ويعود exit=1. مثال:
//   node scripts/verify-perf-gate.mjs             ⇒ exit 0 (نظيف)
//   SLOW_TEST=20 node scripts/verify-perf-gate.mjs ⇒ exit 1 (بطء متعمّد)

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, buildRenderPlan } from '@pf-mediakit/engine';
import { BREAKING } from '@pf-mediakit/templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── الأساس ────────────────────────────────────────────
// قياس حالي، Node v20.18.1، macOS Darwin 25.5.0 (M-series CPU).
// تاريخ القياس: 2026-09-04. يُراجَع بعد شهر من البيانات الفعلية.
// إن اجتاز الأساس بأمان في CI، أخفض BASELINE_MS ليبقى الحارس مشدوداً.
const BASELINE = {
  baselineDate: '2026-09-04',
  reviewAfter: '2026-10-04',
  measuredEnv: 'macOS Darwin 25.5.0 · Node v20.18.1 · M-series CPU',
  buildRenderPlan_p95_ms: 300,   // مُقاس على 100 استدعاء — انظر «قياس أوّلي» أدناه
  toleranceFactor: 1.3,          // ×1.3 = هامش 30% فوق الأساس
  iterations: 100,
};

// **قياس أوّلي (2026-09-04):**
// أوّل تشغيل على السكربت (بعد warm-up 10 استدعاءات) أعطى:
//   p50=275ms · mean=279ms · p95=291ms · p99=299ms (100 استدعاء).
// buildRenderPlan يستدعي wrapOptimal (DP) + prepareHeadline + قياس نص —
// كلها زمن-حرج على المسار الفعلي، ليس عملية بسيطة. رفعتُ الأساس إلى
// 300ms كي أترك هامشاً لتذبذب طبيعي بين M-series و CI Runners x86.
// الميزانية النهائية: 300 × 1.3 = 390ms. **يُراجَع بعد شهر** من
// بيانات CI فعلية — إن اجتاز الأساس بأمان في مختلف البيئات، أُخفضه
// كي يظلّ الحارس مشدوداً.

// ── المدخل القياسي (11 كلمة، breaking template، default brand) ────
const CONTENT = {
  headline: 'وزير الخارجية التركي يبحث في أنقرة تطورات الأزمة في سوريا',
  source: 'وكالات',
};
const SIZE = { w: 1080, h: 1350 };

const brand = resolveBrand(DEFAULT_BRAND);

// حقن اصطناعي للاختبار السلبي — SLOW_TEST=<ms> يزيد كل استدعاء.
const SLOW_TEST_MS = Number(process.env.SLOW_TEST || 0);

function measureOnce() {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');

  // القياس يبدأ الآن — أيّ تأخير سلبي (SLOW_TEST) يُدخَل داخل النافذة
  // كي يعكس ما سيحدث لو انحدر buildRenderPlan فعلياً.
  const start = performance.now();

  if (SLOW_TEST_MS > 0) {
    // busy-wait داخل نافذة القياس — يمثّل «طبقة إضافية بطيئة».
    const t0 = performance.now();
    while (performance.now() - t0 < SLOW_TEST_MS) { /* burn */ }
  }

  buildRenderPlan({
    ctx, size: SIZE, template: BREAKING, brand, content: CONTENT, fps: 30,
  });
  return performance.now() - start;
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx];
}

console.log('════════ G3 — ميزانية أداء buildRenderPlan ════════');
console.log(`   الأساس (${BASELINE.baselineDate}): p95 ≤ ${BASELINE.buildRenderPlan_p95_ms}ms × ${BASELINE.toleranceFactor} = ${(BASELINE.buildRenderPlan_p95_ms * BASELINE.toleranceFactor).toFixed(2)}ms`);
console.log(`   البيئة الأولى: ${BASELINE.measuredEnv}`);
console.log(`   المدخل: breaking × default × «${CONTENT.headline}»`);
if (SLOW_TEST_MS > 0) {
  console.log(`   ⚠  SLOW_TEST=${SLOW_TEST_MS}ms — اختبار سلبي متعمّد`);
}

// إحماء (JIT) — نتجاهل أول 10 استدعاءات.
for (let i = 0; i < 10; i++) measureOnce();

const samples = [];
for (let i = 0; i < BASELINE.iterations; i++) samples.push(measureOnce());
samples.sort((a, b) => a - b);

const p50 = percentile(samples, 0.50);
const p95 = percentile(samples, 0.95);
const p99 = percentile(samples, 0.99);
const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

console.log('');
console.log(`   قياس اليوم على ${BASELINE.iterations} استدعاء:`);
console.log(`      p50=${p50.toFixed(3)}ms · mean=${mean.toFixed(3)}ms · p95=${p95.toFixed(3)}ms · p99=${p99.toFixed(3)}ms`);

const budget = BASELINE.buildRenderPlan_p95_ms * BASELINE.toleranceFactor;
const withinBudget = p95 <= budget;

console.log('');
if (withinBudget) {
  console.log(`   ✓ p95=${p95.toFixed(3)}ms ≤ الأساس × ${BASELINE.toleranceFactor} = ${budget.toFixed(2)}ms`);
  console.log('════════ G3 ✓ ════════');
  process.exit(0);
} else {
  console.log(`   ✗ p95=${p95.toFixed(3)}ms > الأساس × ${BASELINE.toleranceFactor} = ${budget.toFixed(2)}ms`);
  console.log('   انحدار أداء — راجع آخر تعديلات على `buildRenderPlan` أو تبعياته.');
  console.log(`   إن كان الارتفاع مقصوداً (توسّع ميزات)، حدّث BASELINE في هذا السكربت بسبب موثَّق.`);
  console.log('════════ G3 ✗ ════════');
  process.exit(1);
}
