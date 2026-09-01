// scripts/diagnose-semantic-perf.mjs — يقيس عبء الكسر الدلالي.
//
// **يقارن:** buildRenderPlan + إطار واحد drawAt، مرتين:
//   (١) enabled = false (السلوك الحالي)
//   (٢) enabled = true (بعد التفعيل)
//
// **الأهداف (docs/07 §تكامل):**
//   • زيادة buildRenderPlan ≤ 50ms
//   • زمن الإطار لا يتغيّر إطلاقاً (breakPenalties خارج حلقة الرندر)

import { Canvas, FontLibrary } from 'skia-canvas';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  buildRenderPlan,
  drawAt,
  loadDefaultLexicon,
  computeBreakPenalties,
  parseTokens,
  preprocessBidi,
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
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};
const N = 100;

function withSemantic(enabled) {
  return resolveBrand({
    ...DEFAULT_BRAND,
    typography: {
      ...DEFAULT_BRAND.typography,
      semanticBreaks: {
        ...DEFAULT_BRAND.typography.semanticBreaks,
        enabled,
      },
    },
  });
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function p95(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ── (١) عبء computeBreakPenalties منفرداً ────────
const lex = loadDefaultLexicon();
const tokens = parseTokens(
  preprocessBidi(CONTENT.headline, { numerals: 'latin' })
);
console.log(`[perf] عدد الرموز: ${tokens.length}`);

const bpTimes = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  computeBreakPenalties(tokens, lex);
  bpTimes.push(performance.now() - t0);
}
console.log(
  `\n── computeBreakPenalties منفرداً (${N} استدعاء) ──` +
    `\n  متوسط ${mean(bpTimes).toFixed(3)}ms · وسيط ${median(bpTimes).toFixed(3)}ms · p95 ${p95(bpTimes).toFixed(3)}ms`
);

// ── (٢) buildRenderPlan قبل/بعد ──────────────────
async function measureBuildPlan(brand, label) {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const canvas = new Canvas(SIZE.w, SIZE.h);
    const ctx = canvas.getContext('2d');
    const t0 = performance.now();
    buildRenderPlan({
      ctx,
      size: SIZE,
      template: BREAKING,
      brand,
      content: CONTENT,
      fps: 30,
    });
    times.push(performance.now() - t0);
  }
  console.log(
    `  ${label.padEnd(35)} متوسط ${mean(times).toFixed(1)}ms · وسيط ${median(times).toFixed(1)}ms · p95 ${p95(times).toFixed(1)}ms`
  );
  return mean(times);
}

console.log(`\n── buildRenderPlan (20 مرة) ──`);
const meanPlanOff = await measureBuildPlan(
  withSemantic(false),
  'enabled = false (السلوك الحالي)'
);
const meanPlanOn = await measureBuildPlan(
  withSemantic(true),
  'enabled = true (بعد التفعيل)'
);
const planDelta = meanPlanOn - meanPlanOff;
console.log(
  `\n  الفرق: ${planDelta.toFixed(1)}ms — البوابة ≤ 50ms ⇒ ${planDelta <= 50 ? '✓ عبرت' : '✗ فشلت'}`
);

// ── (٣) drawAt لكل إطار قبل/بعد ─────────────────
async function measureDrawAt(brand, label) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: CONTENT,
    fps: 30,
  });
  const times = [];
  for (let f = 0; f < N; f++) {
    ctx.clearRect(0, 0, SIZE.w, SIZE.h);
    const t0 = performance.now();
    drawAt({
      ctx,
      size: SIZE,
      template: BREAKING,
      brand,
      content: CONTENT,
      t: f / 30,
      plan,
    });
    times.push(performance.now() - t0);
  }
  console.log(
    `  ${label.padEnd(35)} متوسط ${mean(times).toFixed(3)}ms · وسيط ${median(times).toFixed(3)}ms · p95 ${p95(times).toFixed(3)}ms`
  );
  return mean(times);
}

console.log(`\n── drawAt (${N} إطار مع plan) ──`);
const meanDrawOff = await measureDrawAt(
  withSemantic(false),
  'enabled = false'
);
const meanDrawOn = await measureDrawAt(
  withSemantic(true),
  'enabled = true'
);
const drawDelta = meanDrawOn - meanDrawOff;
console.log(
  `\n  الفرق: ${drawDelta.toFixed(3)}ms — البوابة: صفر تغيير ⇒ ${Math.abs(drawDelta) < 0.5 ? '✓ عبرت (ضجيج قياس)' : '✗ عبء غير متوقع'}`
);
