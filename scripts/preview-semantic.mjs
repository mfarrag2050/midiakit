// scripts/preview-semantic.mjs — لقطتان للمقارنة البصرية.
//
// نفس النصّ التجريبي (نصّ العاجل الافتراضي)، عرضٌ بـ enabled=true
// (out/preview-semantic.png) وآخر بـ enabled=false (out/preview-nosemantic.png).
//
// **لا يعدّل snapshots/ الحاليّة** — تلك مرجع «بلا كسر دلالي» ويجب أن
// تبقى (verify:snapshot يعتمدها). اللقطات الجديدة اختيارية ما لم يطلبها
// المالك للاحتفاظ.

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  buildRenderPlan,
  drawAt,
  detectFontCaps,
  createCanvasMeasurer,
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
// **العنوان يبرز الفرق الأقوى** (من eval الداخلي، هيدلاين #2):
// بلا الدلالي: يكسر بعد «في» → خطأ نحوي كلاسيكي في السطر الأول
// مع الدلالي: يبقي «في أنقرة» متلاصقين — التصحيح المطلوب
const CONTENT = {
  headline: 'وزير الخارجية التركي يبحث في أنقرة تطورات الأزمة في سوريا',
  source: 'الأناضول',
};

const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

async function render(enabled, outName) {
  const brand = resolveBrand({
    ...DEFAULT_BRAND,
    typography: {
      ...DEFAULT_BRAND.typography,
      semanticBreaks: {
        ...DEFAULT_BRAND.typography.semanticBreaks,
        enabled,
      },
    },
  });

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

  // إطار ثابت في T=0.5 كي تظهر الحركة إذا وُجدت (سنستعمل قالب static)
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
  drawAt({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: CONTENT,
    t: 5, // بعد كل الحركات، قبل outro
    plan,
  });

  await canvas.toFile(join(OUT, outName));

  const h = plan.headline;
  if (h) {
    const split = h.linesJustified
      .map((line) => line.map((t) => t.text ?? '').join(' '))
      .join(' | ');
    console.log(
      `  ${outName}: fs=${h.fontSize} boxW=${h.chosenBoxW} lines=${h.linesJustified.length}\n    ${split}`
    );
  }
}

console.log('[preview-semantic] العنوان:', CONTENT.headline);
console.log('');
await render(false, 'preview-nosemantic.png');
await render(true, 'preview-semantic.png');
