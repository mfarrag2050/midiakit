// scripts/preview-attribution.mjs — بوابة الطور 3.8 بند 1 (طبقة الإسناد).
//
// **الهدف:** رسم ثلاث بطاقات على قماش واحد تظهر الأوضاع الثلاثة للطبقة:
//   1. mode='handle'  — «تيك توك · @user»
//   2. mode='name'    — «أحمد الشاعر على تيك توك»
//   3. mode='both'    — «تيك توك · أحمد الشاعر · @user»
//
// ثم مقارنة بين:
//   • logoMode='none'    (يخفي الأيقونة — نصّ فقط)
//   • logoMode='generic' (شكل هندسي بلون brandKit — لا علامة تجارية)
//   • logoMode='official'(شعار simple-icons ملوَّناً — يشترط licenseAck)
//
// **قواعد قانونية (راجع ATTRIBUTIONS.md):**
//   • الأيقونة الرسمية تحتاج `brand.attribution.logoAcks[platform].licenseAck=true`.
//   • هذا السكربت يبني هوية *اختبار* تحمل الإقرار (ackBy='gate-script') —
//     لا يعكس إقراراً حقيقياً من عميل.
//
// **الاستخدام:**
//   pnpm preview:attribution
//   pnpm preview:attribution -- --brand=client-demo
//
// يُصدر:
//   out/attribution-demo.png       (شبكة 6 بطاقات: 3 modes × 2 برانديز)
//   out/attribution-demo-handle.png
//   out/attribution-demo-name.png
//   out/attribution-demo-both.png

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

// ── تحميل هوية client-demo (تسجيل خطوطها) ──────────────
const clientDemoRaw = JSON.parse(
  await readFile(join(ROOT, 'brands/client-demo.json'), 'utf-8')
);
const clientDemo = resolveBrand(clientDemoRaw);

// تسجيل خطوط الهويّتين على FontLibrary (كما في preview.mjs)
const registerFontsFor = async (brand) => {
  const weights = brand.fonts?.primary?.weights;
  if (!weights) return;
  for (const [_name, w] of Object.entries(weights)) {
    if (typeof w?.url === 'string' && w.url.length > 0) {
      const abs = join(ROOT, w.url);
      if (existsSync(abs)) {
        try {
          FontLibrary.use(brand.fonts.primary.family, [abs]);
        } catch (e) {
          // مسجَّل مسبقاً — تجاهل
        }
      }
    }
  }
};
await registerFontsFor(clientDemo);

// ── هويّة مع licenseAck=true لاختبار وضع 'official' ────
function withOfficialAcks(brand) {
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

function withGeneric(brand) {
  return {
    ...brand,
    attribution: { ...brand.attribution, logoMode: 'generic' },
  };
}

function withNone(brand) {
  return {
    ...brand,
    attribution: { ...brand.attribution, logoMode: 'none' },
  };
}

// ── بناء Path2D لكل منصة (env: skia-canvas) ────────────
const officialPaths = {
  tiktok:    new Path2D(PLATFORM_PATH_STRINGS.tiktok),
  x:         new Path2D(PLATFORM_PATH_STRINGS.x),
  instagram: new Path2D(PLATFORM_PATH_STRINGS.instagram),
  youtube:   new Path2D(PLATFORM_PATH_STRINGS.youtube),
  telegram:  new Path2D(PLATFORM_PATH_STRINGS.telegram),
  facebook:  new Path2D(PLATFORM_PATH_STRINGS.facebook),
};

// ── قماش واحد كبير للمقارنة (شبكة 6 بطاقات) ────────────
// 3 modes (handle/name/both) × 2 برانديز (default/client-demo)
// حجم كل بطاقة 800×220، فاصل 40، إجمالي 2000+ عرض
const CELL_W = 900;
const CELL_H = 240;
const GAP = 40;
const PAD = 60;
const GRID_W = 3 * CELL_W + 2 * GAP + 2 * PAD;
const GRID_H = 2 * CELL_H + GAP + 2 * PAD + 80; // 80 = header

const grid = new Canvas(GRID_W, GRID_H);
const gridCtx = grid.getContext('2d');

// خلفية خافتة للفصل البصري
gridCtx.fillStyle = '#0F1218';
gridCtx.fillRect(0, 0, GRID_W, GRID_H);

// عناوين
gridCtx.fillStyle = '#F8F4E9';
gridCtx.font = '700 32px "IBM Plex Sans Arabic", sans-serif';
gridCtx.textAlign = 'center';
gridCtx.textBaseline = 'top';
gridCtx.direction = 'rtl';

const modes = ['handle', 'name', 'both'];
const modeLabels = { handle: 'mode=handle', name: 'mode=name', both: 'mode=both' };
modes.forEach((m, i) => {
  const cx = PAD + i * (CELL_W + GAP) + CELL_W / 2;
  gridCtx.fillText(modeLabels[m], cx, 20);
});

// دالة رسم بطاقة واحدة
function drawCell(ctx, x, y, brand, mode) {
  // إطار
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(x, y, CELL_W, CELL_H);

  // اسم الهوية أعلى البطاقة
  ctx.fillStyle = brand.colors.text;
  ctx.font = '400 22px "IBM Plex Sans Arabic", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  const style = brand.attribution.logoMode;
  ctx.fillText(`${brand.name} · logoMode=${style}`, x + CELL_W - 30, y + 20);

  // رسم الطبقة
  drawAttribution(
    ctx,
    { w: CELL_W, h: CELL_H },
    brand,
    {
      platform: 'tiktok',
      mode,
      handle: '@ahmadalshaer',
      name: 'أحمد الشاعر',
      anchor: { x: x + 40, y: y + CELL_H - 80 },
      officialPath: officialPaths.tiktok,
    }
  );
}

// شبكة: صف أول = default (logoMode=official)، صف ثاني = client-demo (logoMode=generic)
const defaultOfficial = withOfficialAcks(resolveBrand(DEFAULT_BRAND));
const clientGeneric = withGeneric(clientDemo);

modes.forEach((mode, i) => {
  const cx = PAD + i * (CELL_W + GAP);
  const cy1 = PAD + 80;
  const cy2 = cy1 + CELL_H + GAP;
  drawCell(gridCtx, cx, cy1, defaultOfficial, mode);
  drawCell(gridCtx, cx, cy2, clientGeneric, mode);
});

const gridBuffer = grid.toBufferSync('png');
await writeFile(join(OUT_DIR, 'attribution-demo.png'), gridBuffer);
console.log(`[preview-attribution] out/attribution-demo.png (${GRID_W}×${GRID_H})`);

// ── ثلاث بطاقات منفردة للمعاينة السريعة ───────────────
async function renderSingle(mode, brand, filename) {
  const c = new Canvas(1080, 400);
  const ctx = c.getContext('2d');
  ctx.fillStyle = brand.colors.surface;
  ctx.fillRect(0, 0, 1080, 400);

  drawAttribution(
    ctx,
    { w: 1080, h: 400 },
    brand,
    {
      platform: 'tiktok',
      mode,
      handle: '@ahmadalshaer',
      name: 'أحمد الشاعر',
      anchor: 'bottom-right',
      margin: 80,
      officialPath: officialPaths.tiktok,
    }
  );

  await writeFile(join(OUT_DIR, filename), c.toBufferSync('png'));
  console.log(`[preview-attribution] out/${filename}`);
}

const officialClient = withOfficialAcks(clientDemo);
await renderSingle('handle', officialClient, 'attribution-demo-handle.png');
await renderSingle('name', officialClient, 'attribution-demo-name.png');
await renderSingle('both', officialClient, 'attribution-demo-both.png');

// ── بطاقة إضافية للتحقّق من BiDi (@user لاتيني داخل عربي) ─
{
  const c = new Canvas(1080, 400);
  const ctx = c.getContext('2d');
  ctx.fillStyle = officialClient.colors.surface;
  ctx.fillRect(0, 0, 1080, 400);
  drawAttribution(
    ctx,
    { w: 1080, h: 400 },
    officialClient,
    {
      platform: 'x',
      mode: 'handle',
      handle: '@sample_handle',
      anchor: 'bottom-right',
      margin: 80,
      officialPath: officialPaths.x,
      prefixLabel: 'المصدر:',
    }
  );
  await writeFile(join(OUT_DIR, 'attribution-demo-bidi.png'), c.toBufferSync('png'));
  console.log('[preview-attribution] out/attribution-demo-bidi.png');
}

console.log('[preview-attribution] done — راجع البطاقات في out/');
