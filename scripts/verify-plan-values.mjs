#!/usr/bin/env node
// scripts/verify-plan-values — الطبقة الأولى من البوابة البصريّة (GATE-2LAYER).
//
// **الفرضية:** قيَم `RenderPlan` (fontSize · lineHeight · bounds · baselines
// · linesJustified · إلخ) أعمق طبقة في الأنبوب — تكشف الانحراف قبل أن يصير
// بكسلاً. المقارنة **بلا تسامح**: deep-equal على JSON مُنَظَّف من
// `Measurer` closure. إن اختلفت قيمة رقميّة واحدة، البوابة حمراء.
//
// **المرجع Linux فقط** (PLATFORM-2 · BASELINE-A):
// bounds/firstBaseline/lastBaseline تعتمد على `computeHeadlineAnchorY`
// الذي يقرأ ascent/descent من `measureText` (لجميع الحقول عدا headline
// الذي حُرِّر في BASELINE-A). الفرق ~2px بين macOS و Linux يُنتج خططاً
// مختلفة. المرجع مُوَلَّد داخل حاوية Linux (`./bin/mk-ci --regen-refs`
// لاحقاً · حالياً يدوياً عبر `scripts/generate-plan-golden.mjs`).
//
// **الاستعمال:** `pnpm verify:plan-values` (داخل حاوية Linux فقط).
// **الخروج:** 0 عند التطابق التام · 1 عند اختلاف أو غياب مرجع.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, FontLibrary } from 'skia-canvas';

// فحص المنصّة أوّلاً
if (process.platform !== 'linux') {
  console.error('');
  console.error(`✗ verify-plan-values: هذا المرجع لينكس حصراً.`);
  console.error(`  المنصّة الحاليّة: ${process.platform} · المطلوبة: linux`);
  console.error(`  الحل: ./bin/mk-ci`);
  process.exit(1);
}

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, buildRenderPlan } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
const GOLDEN_DIR = join(ROOT, 'snapshots-plan');

FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);
FontLibrary.use('Almarai', [
  join(FONTS_DIR, 'Almarai-Light.ttf'),
  join(FONTS_DIR, 'Almarai-Regular.ttf'),
  join(FONTS_DIR, 'Almarai-Bold.ttf'),
]);

const BRANDS = {
  default: DEFAULT_BRAND,
  'client-demo': JSON.parse(readFileSync(join(ROOT, 'brands/client-demo.json'), 'utf8')),
};

// نفس المحتوى الذي يستعمله `generate-plan-golden.mjs`
const CONTENT = {
  headline: 'مصدر مطّلع يكشف: بروكسل تدعو إلى وقف فوري لإطلاق النار وتفتح ممرّاً إنسانياً',
  kicker: 'كيكر تجريبي',
  title: 'عنوان ريلز تجريبي',
  source: 'مصدر',
  caption: 'ترجمة',
  location: 'موقع',
  sourceHandle: '@test',
  sourceName: 'مصدر اختبار',
};

const SIZE = { w: 1080, h: 1350 };

function stripPlan(plan) {
  if (!plan) return null;
  if (!plan.headline) return { headline: null, headlineLineCount: plan.headlineLineCount };
  const h = plan.headline;
  return {
    headline: {
      fontSize: h.fontSize,
      lineHeight: h.lineHeight,
      chosenBoxW: h.chosenBoxW,
      rightX: h.rightX,
      centerX: h.centerX,
      ...(h.firstBaseline !== undefined && { firstBaseline: h.firstBaseline }),
      ...(h.lastBaseline !== undefined && { lastBaseline: h.lastBaseline }),
      linesJustified: h.linesJustified,
      align: h.align,
      ...(h.bounds !== undefined && { bounds: h.bounds }),
      accentSpans: h.accentSpans,
    },
    headlineLineCount: plan.headlineLineCount,
  };
}

console.log('▶ verify-plan-values');
let failures = 0;
let passed = 0;

for (const [brandName, brandRaw] of Object.entries(BRANDS)) {
  const brand = resolveBrand(brandRaw);
  for (const tplName of Object.keys(TEMPLATES)) {
    const template = TEMPLATES[tplName];
    const goldenPath = join(GOLDEN_DIR, `${brandName}__${tplName}.json`);
    if (!existsSync(goldenPath)) {
      console.error(`  ✗ ${brandName} × ${tplName} — لا مرجع في ${goldenPath}`);
      failures++;
      continue;
    }
    const canvas = new Canvas(SIZE.w, SIZE.h);
    const ctx = canvas.getContext('2d');
    const plan = buildRenderPlan({
      ctx, size: SIZE, template, brand, content: CONTENT, fps: 30,
    });
    const actual = JSON.stringify(stripPlan(plan), null, 2) + '\n';
    const expected = readFileSync(goldenPath, 'utf8');

    if (actual === expected) {
      console.log(`  ✓ ${brandName.padEnd(14)} × ${tplName}`);
      passed++;
    } else {
      console.error(`  ✗ ${brandName.padEnd(14)} × ${tplName} — قيَم الخطّة اختلفت`);
      // اطبع أوّل اختلاف
      const actualLines = actual.split('\n');
      const expectedLines = expected.split('\n');
      for (let i = 0; i < Math.max(actualLines.length, expectedLines.length); i++) {
        if (actualLines[i] !== expectedLines[i]) {
          console.error(`      سطر ${i + 1}:`);
          console.error(`        متوقّع: ${expectedLines[i] ?? '(نهاية)'}`);
          console.error(`        فعلي:   ${actualLines[i] ?? '(نهاية)'}`);
          break;
        }
      }
      failures++;
    }
  }
}

console.log(``);
if (failures > 0) {
  console.error(`✗ verify-plan-values FAILED — ${failures} فشل من ${passed + failures}`);
  console.error(`  لتحديث المرجع بعد قرار مالك: أعِد توليده داخل الحاوية:`);
  console.error(`    ./bin/mk-ci --regen-plan-golden`);
  console.error(`  أو يدوياً: node scripts/generate-plan-golden.mjs داخل الحاوية.`);
  process.exit(1);
}

console.log(`✓ verify-plan-values PASSED — ${passed}/${passed} خطّة متطابقة القيَم`);
process.exit(0);
