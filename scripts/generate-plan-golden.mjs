#!/usr/bin/env node
// generate-plan-golden — يُنتج قيم RenderPlan لكل قالب × هويّة، بلا حقول
// غير قابلة للتسلسل (Measurer closure)، للاستعمال كـgolden لبوابة الطبقة ١.
//
// **الاستعمال:** يُشغَّل مرّةً داخل حاوية Linux وقت الإعداد. المخرج:
//   snapshots-plan/<brand>__<template>.json
//
// **الحقول:** كل ما في PreparedHeadline عدا `measure` (closure) — بما فيها
// bounds و baselines (BASELINE-A: مصدرها الآن font-header · deterministic
// عبر المنصّات لكن الاختبار يفترض المرجع Linux لضمان تطابق كامل).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, FontLibrary } from 'skia-canvas';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, buildRenderPlan } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
const OUT_DIR = join(ROOT, 'snapshots-plan');
mkdirSync(OUT_DIR, { recursive: true });

// حمّل خطوط IBM Plex + Almarai (كل ما نشحنه)
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

// محتوى قياسيّ يطابق ما تستهلكه preview.mjs
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

// يجرّد PreparedHeadline من حقول غير قابلة للتسلسل ويعيده مسطَّحاً.
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
      // `measure` closure — مطروح
    },
    headlineLineCount: plan.headlineLineCount,
  };
}

const rows = [];
for (const [brandName, brandRaw] of Object.entries(BRANDS)) {
  const brand = resolveBrand(brandRaw);
  for (const [tplName, template] of Object.entries(TEMPLATES)) {
    const canvas = new Canvas(SIZE.w, SIZE.h);
    const ctx = canvas.getContext('2d');
    const plan = buildRenderPlan({
      ctx, size: SIZE, template, brand, content: CONTENT, fps: 30,
    });
    const stripped = stripPlan(plan);
    const outPath = join(OUT_DIR, `${brandName}__${tplName}.json`);
    writeFileSync(outPath, JSON.stringify(stripped, null, 2) + '\n', 'utf8');
    rows.push({ brand: brandName, template: tplName, path: outPath, lineCount: stripped.headlineLineCount });
  }
}

console.log(`\n▶ generate-plan-golden — ${rows.length} خطّة`);
for (const r of rows) {
  console.log(`  ${r.brand.padEnd(14)} × ${r.template.padEnd(16)} → lines=${r.lineCount}`);
}
console.log(`\n✓ مكتمل — راجع snapshots-plan/`);
