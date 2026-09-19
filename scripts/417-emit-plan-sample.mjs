// scripts/417-emit-plan-sample.mjs — يُنتج ملفَّ خطّةٍ واحداً من رندرٍ فعليّ.
//
// **الغرض (417 §٥):** بوّابةُ التذكرة تطلب ملفَّ خطّةٍ حقيقيّاً — هذا
// السكربتُ يستدعي نفسَ الدالة `buildRenderPlan` التي أضفتُها إلى
// `apps/renderer/src/api-worker.ts:319+`، فيُنتج JSON بنفس الشكل الذي
// سيرفعه العاملُ بجوار الرفع (`<tenantId>/renders/<renderId>/output.plan.json`).
//
// الاستعمال:  node scripts/417-emit-plan-sample.mjs > out/417-plan-sample.json

import { Canvas } from 'skia-canvas';
import { buildRenderPlan } from '../packages/engine/src/index.ts';
import { BREAKING } from '../packages/templates/src/index.ts';
import { DEFAULT_BRAND } from '../packages/shared/src/index.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out/417-plan-sample.json');
mkdirSync(dirname(OUT), { recursive: true });

const template = BREAKING;
const brand = DEFAULT_BRAND;
const templateId = 'breaking';

const size = { w: 1080, h: 1080 };
const content = {
  headline: 'اختبارُ الخطّة — سطرٌ مصنوعٌ لإخراج مستخلصِ العنوان',
  source: 'الوكالة',
};

const canvas = new Canvas(size.w, size.h);
const ctx = canvas.getContext('2d');
const plan = buildRenderPlan({ ctx, size, template, brand, content });

const snapshot = {
  renderId: '417-sample-plan',
  tenantId: 'sample-tenant',
  templateId,
  format: 'png',
  size,
  headline: plan.headline
    ? {
        fontSize: plan.headline.fontSize,
        lineHeight: plan.headline.lineHeight,
        chosenBoxW: plan.headline.chosenBoxW,
        rightX: plan.headline.rightX,
        centerX: plan.headline.centerX,
        firstBaseline: plan.headline.firstBaseline ?? null,
        lastBaseline: plan.headline.lastBaseline ?? null,
        align: plan.headline.align,
        bounds: plan.headline.bounds ?? null,
        linesCount: plan.headline.linesJustified.length,
      }
    : null,
  headlineLineCount: plan.headlineLineCount,
  generatedAt: new Date().toISOString(),
};

const json = JSON.stringify(snapshot, null, 2);
writeFileSync(OUT, json);
console.log(json);
console.error(`[417-emit-plan-sample] ✓ كُتب ${OUT}`);
