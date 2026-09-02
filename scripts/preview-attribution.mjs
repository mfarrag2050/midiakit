// scripts/preview-attribution.mjs — بوابة الطور 3.8 بند 1 (طبقة الإسناد).
//
// **الهدف (2026-09-02 v2):** شبكة **3 أوضاع نص × 3 أوضاع شعار × هويتين** =
// **18 خلية** — لعرض فصل الشعار عن النص واختلاف النتيجة بين الوضعين
// generic/official/none، ولتأكيد أن brand.placement.attribution يحكم
// الموضع افتراضياً.
//
// أوضاع النص:  handle · name · both
// أوضاع الشعار: none · generic · official
// الهويّتان: default (اللون: رمادي محايد) · client-demo (اللون: بيج/برتقالي)
//
// **قواعد قانونية (راجع ATTRIBUTIONS.md):**
//   • official تحتاج `brand.attribution.logoAcks[platform].licenseAck=true`.
//     السكربت يبني نسخة اختبار حاملة الإقرار (ackBy='gate-script').
//
// **الاستخدام:**
//   pnpm preview:attribution
//
// يُصدر:
//   out/attribution-demo.png       شبكة 18 خلية (3×6)
//   out/attribution-demo-bidi.png  بطاقة BiDi (X + prefix)
//   out/attribution-demo-placement.png  اختبار brand.placement (بلا anchor)

import { Canvas, FontLibrary, Path2D } from 'skia-canvas';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  drawAttribution,
  PLATFORM_PATH_STRINGS,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

// ── تحميل هويّة client-demo (تسجيل خطوطها) ─────────────
const clientDemoRaw = JSON.parse(
  await readFile(join(ROOT, 'brands/client-demo.json'), 'utf-8')
);
const clientDemo = resolveBrand(clientDemoRaw);

const registerFontsFor = async (brand) => {
  const weights = brand.fonts?.primary?.weights;
  if (!weights) return;
  for (const [_name, w] of Object.entries(weights)) {
    if (typeof w?.url === 'string' && w.url.length > 0) {
      const abs = join(ROOT, w.url);
      if (existsSync(abs)) {
        try {
          FontLibrary.use(brand.fonts.primary.family, [abs]);
        } catch (_e) {
          // مسجَّل مسبقاً — تجاهل
        }
      }
    }
  }
};
await registerFontsFor(clientDemo);

// ── هويّات باختلاف logoMode ────────────────────────────
function withLogoMode(brand, logoMode) {
  if (logoMode === 'official') {
    return {
      ...brand,
      attribution: {
        ...brand.attribution,
        logoMode: 'official',
        logoAcks: {
          tiktok:    { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
          x:         { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
          instagram: { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
          youtube:   { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
          telegram:  { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
          facebook:  { licenseAck: true, ackBy: 'gate-script', ackAt: '2026-09-02' },
        },
      },
    };
  }
  return { ...brand, attribution: { ...brand.attribution, logoMode } };
}

// ── Path2D لكل منصة (env: skia-canvas) ────────────────
const officialPaths = {
  tiktok:    new Path2D(PLATFORM_PATH_STRINGS.tiktok),
  x:         new Path2D(PLATFORM_PATH_STRINGS.x),
  instagram: new Path2D(PLATFORM_PATH_STRINGS.instagram),
  youtube:   new Path2D(PLATFORM_PATH_STRINGS.youtube),
  telegram:  new Path2D(PLATFORM_PATH_STRINGS.telegram),
  facebook:  new Path2D(PLATFORM_PATH_STRINGS.facebook),
};

// ── شبكة 3×6 = 18 خلية ────────────────────────────────
// أعمدة (3): أوضاع نص [handle, name, both]
// صفوف (6): 3 أوضاع شعار × 2 هويتين
//   الصف 0: default  · logoMode=none
//   الصف 1: default  · logoMode=generic
//   الصف 2: default  · logoMode=official
//   الصف 3: client   · logoMode=none
//   الصف 4: client   · logoMode=generic
//   الصف 5: client   · logoMode=official
const CELL_W = 900;
const CELL_H = 220;
const GAP = 32;
const PAD = 60;
const HEADER = 80;
const ROWLABEL = 260;   // عرض عمود اسم الصف على اليمين
const COLS = 3;
const ROWS = 6;

const GRID_W = COLS * CELL_W + (COLS - 1) * GAP + 2 * PAD + ROWLABEL;
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP + 2 * PAD + HEADER;

const grid = new Canvas(GRID_W, GRID_H);
const ctx = grid.getContext('2d');

// خلفية عامة داكنة للفصل البصري
ctx.fillStyle = '#0F1218';
ctx.fillRect(0, 0, GRID_W, GRID_H);

// عناوين الأعمدة (أوضاع النص)
ctx.fillStyle = '#F8F4E9';
ctx.font = '700 30px "IBM Plex Sans Arabic", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.direction = 'ltr';

const modes = ['handle', 'name', 'both'];
const modeLabels = { handle: 'mode = handle', name: 'mode = name', both: 'mode = both' };
modes.forEach((m, i) => {
  const cx = PAD + i * (CELL_W + GAP) + CELL_W / 2;
  ctx.fillText(modeLabels[m], cx, 24);
});

// الصفوف: كل هوية × كل logoMode
const rows = [
  { brand: withLogoMode(resolveBrand(DEFAULT_BRAND), 'none'),     brandLabel: 'default',     logoMode: 'none' },
  { brand: withLogoMode(resolveBrand(DEFAULT_BRAND), 'generic'),  brandLabel: 'default',     logoMode: 'generic' },
  { brand: withLogoMode(resolveBrand(DEFAULT_BRAND), 'official'), brandLabel: 'default',     logoMode: 'official' },
  { brand: withLogoMode(clientDemo,                   'none'),    brandLabel: 'client-demo', logoMode: 'none' },
  { brand: withLogoMode(clientDemo,                   'generic'), brandLabel: 'client-demo', logoMode: 'generic' },
  { brand: withLogoMode(clientDemo,                   'official'),brandLabel: 'client-demo', logoMode: 'official' },
];

function drawCell(x, y, brand, mode) {
  // خلفية الخلية = brand.colors.surface
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(x, y, CELL_W, CELL_H);

  // نرسم الطبقة بأنكور صريح بداخل الخلية (لا نستعمل brand.placement هنا
  // لأنّ الحاوية 900×220 لا 1080×1350 — نُموقع يدوياً وسط الخلية).
  drawAttribution(ctx, { w: CELL_W, h: CELL_H }, brand, {
    platform: 'tiktok',
    mode,
    handle: '@ahmadalshaer',
    name: 'أحمد الشاعر',
    anchor: { x: x + 60, y: y + CELL_H - 90 },
    officialPath: officialPaths.tiktok,
  });
}

// رسم كل الخلايا + بطاقة تسمية صف على اليمين
ctx.font = '500 22px "IBM Plex Sans Arabic", sans-serif';
rows.forEach((row, r) => {
  const cy = PAD + HEADER + r * (CELL_H + GAP);
  modes.forEach((mode, c) => {
    const cx = PAD + c * (CELL_W + GAP);
    drawCell(cx, cy, row.brand, mode);
  });
  // تسمية الصف على اليمين
  ctx.fillStyle = '#B8B8B8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.direction = 'ltr';
  const labelX = GRID_W - PAD;
  ctx.fillText(row.brandLabel, labelX, cy + 20);
  ctx.fillStyle = '#F8F4E9';
  ctx.fillText(`logoMode = ${row.logoMode}`, labelX, cy + 52);
});

await writeFile(join(OUT_DIR, 'attribution-demo.png'), grid.toBufferSync('png'));
console.log(`[preview-attribution] out/attribution-demo.png (${GRID_W}×${GRID_H})`);

// ── بطاقة BiDi (X + prefix + LTR handle داخل عربي) ────
{
  const c = new Canvas(1080, 400);
  const cx = c.getContext('2d');
  const officialClient = withLogoMode(clientDemo, 'official');
  cx.fillStyle = officialClient.colors.surface;
  cx.fillRect(0, 0, 1080, 400);
  drawAttribution(cx, { w: 1080, h: 400 }, officialClient, {
    platform: 'x',
    mode: 'handle',
    handle: '@sample_handle',
    anchor: 'bottom-right',
    margin: 80,
    officialPath: officialPaths.x,
    prefixLabel: 'المصدر:',
  });
  await writeFile(join(OUT_DIR, 'attribution-demo-bidi.png'), c.toBufferSync('png'));
  console.log('[preview-attribution] out/attribution-demo-bidi.png');
}

// ── اختبار brand.placement — بلا anchor في الاستدعاء ──
// الهدف: نتأكّد أن الطبقة تستهلك brand.placement.attribution صحيحاً
// حين لا يمرّر القالب anchor. نرسم على قماش 1080×1350 (نفس مقاس البطاقات).
{
  const c = new Canvas(1080, 1350);
  const cx = c.getContext('2d');
  const brand = withLogoMode(clientDemo, 'generic');
  cx.fillStyle = brand.colors.surface;
  cx.fillRect(0, 0, 1080, 1350);

  // شبكة إشارية لتوضيح الأنكور (خطوط بيضاء)
  cx.strokeStyle = 'rgba(255,255,255,0.06)';
  cx.lineWidth = 1;
  for (let i = 60; i < 1080; i += 60) {
    cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, 1350); cx.stroke();
  }
  for (let i = 60; i < 1350; i += 60) {
    cx.beginPath(); cx.moveTo(0, i); cx.lineTo(1080, i); cx.stroke();
  }

  // مرَّة واحدة بلا anchor → brand.placement.attribution
  drawAttribution(cx, { w: 1080, h: 1350 }, brand, {
    platform: 'tiktok',
    mode: 'both',
    handle: '@ahmadalshaer',
    name: 'أحمد الشاعر',
    officialPath: officialPaths.tiktok,
  });

  // نص توضيحي في الأعلى
  cx.fillStyle = '#F8F4E9';
  cx.font = '400 28px "IBM Plex Sans Arabic", sans-serif';
  cx.textAlign = 'left';
  cx.textBaseline = 'top';
  cx.direction = 'ltr';
  cx.fillText('brand.placement.attribution = {anchor: bottom-right, offset: {60,60}}', 60, 60);
  cx.fillText('لا anchor في الاستدعاء — الهوية تحكم.', 60, 100);

  await writeFile(join(OUT_DIR, 'attribution-demo-placement.png'), c.toBufferSync('png'));
  console.log('[preview-attribution] out/attribution-demo-placement.png (1080×1350)');
}

console.log('[preview-attribution] done');
