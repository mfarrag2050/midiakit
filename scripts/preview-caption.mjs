// scripts/preview-caption.mjs — بوابة بصرية لطبقة الترجمة.
//
// **الفكرة:** نرسم ستّة إطارات عبر الزمن على نفس المقطع، فنرى تقدّم
// التلوين من اليمين إلى اليسار. لقطة واحدة تُثبت السلوك.
//
// **الاستعمال:**
//   pnpm preview:caption
// المُخرج:
//   out/caption-demo.png  شبكة 3×2 = 6 إطارات عند [1.0, 2.0, 3.0, 4.0, 4.7, 5.5]s

import { Canvas, FontLibrary } from 'skia-canvas';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, drawCaption } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// ── تسجيل خطوط ─────────────────────────────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── تحميل الفكستشر ─────────────────────────────────────
const fixture = JSON.parse(
  await readFile(join(ROOT, 'fixtures/caption/breaking-news.json'), 'utf-8')
);
const segments = fixture.segments;

// ── هويّة بألوان واضحة للعرض (DEFAULT_BRAND رمادي — لا تباين) ────
const brand = resolveBrand({
  ...DEFAULT_BRAND,
  colors: {
    ...DEFAULT_BRAND.colors,
    text: '#F8F4E9',      // كريمي
    accent: '#E8815A',    // برتقالي حيّ — يميّز الكلمة النشطة
    surface: '#0B2340',   // أزرق داكن — خلفية
  },
});

// ── شبكة 3×2 = 6 إطارات ────────────────────────────────
const TIMES = [1.0, 2.0, 3.0, 4.0, 4.7, 5.5]; // ثوانٍ داخل المقطع
const CELL_W = 1080;
const CELL_H = 400;   // ارتفاع مصغَّر يُظهر منطقة الترجمة
const GAP = 24;
const PAD = 40;
const HEADER = 60;
const COLS = 3;
const ROWS = 2;

const GRID_W = COLS * CELL_W + (COLS - 1) * GAP + 2 * PAD;
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP + 2 * PAD + HEADER;

const grid = new Canvas(GRID_W, GRID_H);
const gctx = grid.getContext('2d');

// خلفية داكنة عامة
gctx.fillStyle = '#0F1218';
gctx.fillRect(0, 0, GRID_W, GRID_H);

// عنوان
gctx.fillStyle = '#F8F4E9';
gctx.font = '700 24px "IBM Plex Sans Arabic", sans-serif';
gctx.textAlign = 'center';
gctx.textBaseline = 'top';
gctx.direction = 'rtl';
gctx.fillText(
  'طبقة الترجمة — التلوين يتقدّم من اليمين مع تقدّم الزمن',
  GRID_W / 2,
  16
);

// ── رسم إطار واحد للترجمة ─────────────────────────────
function drawFrame(offX, offY, t) {
  const c = new Canvas(1080, 1350);
  const ctx = c.getContext('2d');
  // خلفية بسيطة للإطار
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(0, 0, 1080, 1350);

  // نرسم الترجمة على قماش 1080×1350 كما ستكون في بطاقة/فيديو حقيقي.
  drawCaption(ctx, { w: 1080, h: 1350 }, brand, { segments, t });

  // نأخذ المنطقة السفلى فقط (حيث الترجمة) ونضعها في الخلية.
  // نصف الارتفاع السفلي = 675..1350 → ارتفاع 675 نصغّره إلى CELL_H=400.
  const srcY = 950;   // نبدأ من 950 لإظهار الترجمة (bottom-center offset 180)
  const srcH = 400;
  gctx.drawImage(c, 0, srcY, 1080, srcH, offX, offY, CELL_W, CELL_H);

  // إطار
  gctx.strokeStyle = 'rgba(255,255,255,0.15)';
  gctx.lineWidth = 1;
  gctx.strokeRect(offX, offY, CELL_W, CELL_H);

  // تسمية الوقت
  gctx.fillStyle = 'rgba(248,244,233,0.85)';
  gctx.font = '700 20px "IBM Plex Sans Arabic", sans-serif';
  gctx.textAlign = 'left';
  gctx.textBaseline = 'top';
  gctx.direction = 'ltr';
  gctx.fillText(`t = ${t.toFixed(2)}s`, offX + 14, offY + 12);
}

for (let i = 0; i < TIMES.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = PAD + col * (CELL_W + GAP);
  const y = PAD + HEADER + row * (CELL_H + GAP);
  drawFrame(x, y, TIMES[i]);
}

await writeFile(join(OUT_DIR, 'caption-demo.png'), grid.toBufferSync('png'));
console.log(`[preview-caption] out/caption-demo.png (${GRID_W}×${GRID_H})`);
console.log('[preview-caption] done');
