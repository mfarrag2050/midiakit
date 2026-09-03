// scripts/preview-svg.mjs — يرسم علامة SVG على قماشين بهويّتين مختلفتين.
//
// **الغرض:** إثبات ربط الألوان بالهوية — نفس ملف SVG (data-brand-*)
// يُنتج شكلاً بلونَي default + client-demo مختلفَين، بلا لمس السكربت.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, drawSvg, prepareSvg } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const svgSource = await readFile(
  join(ROOT, 'fixtures/svg/newsroom-mark.svg'),
  'utf-8'
);
const prepared = prepareSvg(svgSource);
console.log(`[preview-svg] viewBox=${JSON.stringify(prepared.viewBox)}  shapes=${prepared.shapes.length}`);

// طباعة تصنيف الأشكال — L-46 اختبار وجود.
const kinds = {};
for (const s of prepared.shapes) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
console.log(`[preview-svg] تصنيف الأشكال: ${JSON.stringify(kinds)}`);

// هويّتان: default + client-demo (لو موجودة)
const BRANDS = [
  { name: 'default', brand: resolveBrand({
      ...DEFAULT_BRAND,
      colors: {
        ...DEFAULT_BRAND.colors,
        text: '#F8F4E9',
        accent: '#E8815A',
        surface: '#0B2340',
        urgentBg: '#B31E1E',
      },
    }),
  },
  { name: 'contrast', brand: resolveBrand({
      ...DEFAULT_BRAND,
      colors: {
        ...DEFAULT_BRAND.colors,
        text: '#1A1A1A',
        accent: '#F4A623',
        surface: '#FFFFFF',
        urgentBg: '#0F5D3F',
      },
    }),
  },
];

const CARD_W = 540, CARD_H = 540, GAP = 40;
const canvasW = CARD_W * BRANDS.length + GAP * (BRANDS.length + 1);
const canvasH = CARD_H + GAP * 2 + 80;

const canvas = new Canvas(canvasW, canvasH);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0F1218';
ctx.fillRect(0, 0, canvasW, canvasH);

// عنوان
ctx.fillStyle = '#F8F4E9';
ctx.font = '600 24px "IBM Plex Sans Arabic", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.direction = 'rtl';
ctx.fillText('SVG — نفس المصدر · هويّتان · ربط الألوان عبر data-brand-*', canvasW / 2, 20);

for (let i = 0; i < BRANDS.length; i++) {
  const { name, brand } = BRANDS[i];
  const bx = GAP + i * (CARD_W + GAP);
  const by = 80;

  // خلفية البطاقة من الهوية
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(bx, by, CARD_W, CARD_H);

  // ارسم SVG داخل مربّع مركزي 380×380
  drawSvg(ctx, { w: canvasW, h: canvasH }, brand, {
    prepared,
    bounds: { x: bx + 80, y: by + 80, w: 380, h: 380 },
    fit: 'contain',
  });

  // تسمية الهوية
  ctx.fillStyle = '#F8F4E9';
  ctx.font = '500 18px "IBM Plex Sans Arabic", sans-serif';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText(`brand: ${name}  ·  accent=${brand.colors.accent}`, bx + 14, by + CARD_H - 30);

  // إطار خفيف
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, CARD_W, CARD_H);
}

const OUT_PNG = join(OUT, 'svg-demo.png');
await canvas.toFile(OUT_PNG);
console.log(`[preview-svg] ✓ ${OUT_PNG}  (${canvasW}×${canvasH})`);
