#!/usr/bin/env node
// scripts/verify-plan-all-templates — يستدعي buildRenderPlan على كل
// قالب مبنيّ ويؤكّد أنّه يُنتج خطة صالحة.
//
// **السياق (KICKER-2 · 2026-09-09):** KICKER-1 كشف أنّ buildRenderPlan
// كان يفشل على card_kicker (anchor=below-kicker) بلا فاحص يمرّ على
// النطاق. هذا الفاحص يسدّ الفجوة — أيّ anchor مستقبلي بتبعية على state
// سيُكتشف هنا لا في إنتاج MP4.
//
// **ما يفعله:**
//   - يحمّل كل template من packages/templates (breaking · card-bottom ·
//     card-centered · card-kicker · plain · reel).
//   - يستدعي buildRenderPlan على كلٍّ بمحتوى قياسي.
//   - يفشل إن رمى أيّ استدعاء، أو إن كانت plan.headline غائبة لقالب
//     فيه طبقة headline.
//
// **ما لا يفعله:** لا يستدعي renderVideo (رندر MP4 على الست يستغرق
// دقائق ويتطلّب ffmpeg). ذاك فاحص مستقلّ إن اقتُضي.

import { resolveBrand, buildRenderPlan } from '@pf-mediakit/engine';
import { TEMPLATES } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { Canvas } from 'skia-canvas';

const brand = resolveBrand(DEFAULT_BRAND);
// المحتوى القياسي يحمل مفاتيح كل الحقول الممكنة في القوالب الستّة
// (breaking · card_* · reel · plain). reel يستعمل `title` بدل `headline`.
const CONTENT = {
  kicker: 'كيكر تجريبي قصير',
  headline: 'عنوان تجريبي متوسّط الطول لاختبار buildRenderPlan',
  title: 'عنوان ريلز تجريبي',
  source: 'مصدر',
  caption: 'ترجمة تجريبية',
  location: 'موقع',
  sourceHandle: '@test',
  sourceName: 'مصدر اختبار',
};

const canvas = new Canvas(1080, 1080);
const ctx = canvas.getContext('2d');

console.log('▶ verify-plan-all-templates');
console.log(`  ${Object.keys(TEMPLATES).length} قالب:`, Object.keys(TEMPLATES).join(' · '));
console.log();

const results = [];
for (const [name, template] of Object.entries(TEMPLATES)) {
  const hasHeadline = template.layers.some((l) => l.type === 'headline');
  try {
    const plan = buildRenderPlan({
      ctx,
      size: { w: 1080, h: 1080 },
      template,
      brand,
      content: CONTENT,
      fps: 30,
    });
    const lineCount = plan.headline?.linesJustified.length ?? 0;
    const fontSize = plan.headline?.fontSize;

    if (hasHeadline && !plan.headline) {
      results.push({ name, status: 'FAIL', reason: 'plan.headline غائبة رغم وجود طبقة headline' });
      console.log(`  ✗ ${name}: plan.headline غائبة رغم وجود طبقة headline`);
      continue;
    }
    results.push({ name, status: 'OK', lineCount, fontSize });
    console.log(`  ✓ ${name}: lines=${lineCount} · fs=${fontSize ?? '(بلا headline)'}`);
  } catch (err) {
    results.push({ name, status: 'THROW', message: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

console.log();
const failed = results.filter((r) => r.status !== 'OK');
if (failed.length > 0) {
  console.error(`✗ verify-plan-all-templates FAILED — ${failed.length} من ${results.length} قوالب فشلت`);
  for (const f of failed) {
    console.error(`  ${f.name}: ${f.reason ?? f.message}`);
  }
  process.exit(1);
}
console.log(`✓ verify-plan-all-templates PASSED — ${results.length} قوالب كلها بخطة صالحة`);
process.exit(0);
