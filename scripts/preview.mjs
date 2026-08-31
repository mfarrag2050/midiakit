// scripts/preview.mjs — معاينة متعدّدة الهويات والقوالب عبر renderFrame.
//
// **الاستخدام:**
//   pnpm preview                                    # brand=default template=breaking
//   pnpm preview -- --brand=client-demo
//   pnpm preview -- --template=plain               # يثبت بوابة المرحلة 2
//   pnpm preview -- --brand=client-demo --template=plain
//
// **بوابة المرحلة 2 (2026-08-31):** إضافة قالب `plain` (خامس بعد الأربعة
// الأصلية) بلا سطر كود — يُرسم من JSON فقط عبر renderFrame.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  createCanvasMeasurer,
  detectFontCaps,
  renderFrame,
} from '@pf-mediakit/engine';
import { TEMPLATES } from '@pf-mediakit/templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── وسائط سطر الأوامر ─────────────────────────────────
function parseArgs() {
  const args = { brand: 'default', template: 'breaking' };
  for (const arg of process.argv.slice(2)) {
    const brandMatch = arg.match(/^--brand=(.+)$/);
    if (brandMatch) args.brand = brandMatch[1];
    const tplMatch = arg.match(/^--template=(.+)$/);
    if (tplMatch) args.template = tplMatch[1];
  }
  return args;
}

const CLI = parseArgs();

// ── تحميل الهوية والقالب ──────────────────────────────
async function loadBrandRaw(name) {
  if (name === 'default') return DEFAULT_BRAND;
  const path = join(ROOT, 'brands', `${name}.json`);
  if (!existsSync(path)) throw new Error(`brands/${name}.json غير موجود`);
  return JSON.parse(await readFile(path, 'utf8'));
}

const brandRaw = await loadBrandRaw(CLI.brand);
const brand = resolveBrand(brandRaw);

const template = TEMPLATES[CLI.template];
if (!template) {
  throw new Error(
    `[preview] template=${CLI.template} غير معروف. المتاح: ${Object.keys(TEMPLATES).join(', ')}`
  );
}

// ── تسجيل الخط ديناميكياً ─────────────────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
const IBM_PLEX_FALLBACK = [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
];

function resolveFontPath(url) {
  if (!url) return null;
  return isAbsolute(url) ? url : pathResolve(ROOT, url);
}

const weights = brand.fonts.primary.weights;
const fontPaths = [weights.light.url, weights.regular.url, weights.bold.url]
  .map(resolveFontPath)
  .filter(Boolean);

if (fontPaths.length > 0) {
  FontLibrary.use(brand.fonts.primary.family, fontPaths);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (${fontPaths.length} أوزان من brand.json)`
  );
} else {
  FontLibrary.use(brand.fonts.primary.family, IBM_PLEX_FALLBACK);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (تراجع IBM Plex — brand بلا مسارات)`
  );
}

// ── الثوابت ───────────────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};

const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// ── كشف قدرات الخط لمرة واحدة ─────────────────────────
{
  const probe = new Canvas(10, 10);
  const probeMeasure = createCanvasMeasurer(probe.getContext('2d'), brand);
  const detected = detectFontCaps(probeMeasure, 80);
  console.log(
    `[preview] detectFontCaps: kashida=${detected.kashida} method=${detected.kashidaMethod}`
  );
}

console.log(
  `[preview] brand=${brand.id} · template=${template.id} · قماش=${SIZE.w}×${SIZE.h}`
);

// ── دالة الرندر — مغلَّفة حول renderFrame ─────────────
async function renderCard({ label, outPath, kashidaOn }) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');

  // نبدّل mode=none لتعطيل الكشيدة (تُغلَّف بـ shallow clone كي لا نغيّر
  // الهوية الأصلية — الالتزام بـL-04: لا حالة مشتركة صامتة).
  const brandForFrame = kashidaOn
    ? brand
    : {
        ...brand,
        typography: {
          ...brand.typography,
          justify: { ...brand.typography.justify, mode: 'none' },
        },
      };

  renderFrame({
    ctx,
    size: SIZE,
    template,
    brand: brandForFrame,
    content: CONTENT,
  });

  await canvas.toFile(outPath);
  console.log(`   ${label} → ${outPath}`);
}

// ── تنفيذ ─────────────────────────────────────────────
const suffix = CLI.template === 'breaking' ? '' : `-${CLI.template}`;
const outMain = join(OUT_DIR, `preview-${CLI.brand}${suffix}.png`);
const outNoK = join(OUT_DIR, `preview-${CLI.brand}${suffix}-nokashida.png`);

await renderCard({
  label: `${brand.name} · ${template.name} · الكشيدة مفعّلة`,
  outPath: outMain,
  kashidaOn: true,
});

await renderCard({
  label: `${brand.name} · ${template.name} · بلا كشيدة`,
  outPath: outNoK,
  kashidaOn: false,
});
