// scripts/preview-placement.mjs — بوابة إثبات «الهوية تحكم أين» على
// أربعة عناصر (logo · badge · source · attribution).
//
// **الفكرة:** نفس المحتوى، نفس التركيبة، **هويّتان بمواضع مختلفة**.
// إن أنتجت الهويّة تصميماً مختلفاً بنيوياً — الفصل صحّ. إن أنتجت
// نفس الشيء بألوان مختلفة — الفصل لم يصل بعد.
//
// **التركيبة (بلا قالب رسمي — نرسم يدوياً بأدوات المحرك):**
//   solid background
//   → مربع placeholder صغير في المركز يمثّل صورة/عنوان
//   → logo عبر drawLogo — يقرأ brand.placement.logo
//   → badge عبر drawBadge — نحسب rx/bottomY من brand.placement.badge
//   → source خطياً — نحسب x/y من brand.placement.source
//   → attribution عبر drawAttribution — يقرأ brand.placement.attribution
//
// **الهويّتان:**
//   A: logo BL · badge TR · source BR · attribution BR
//   B: logo TR · badge BL · source TL · attribution TL

import { Canvas, FontLibrary, Path2D, Image } from 'skia-canvas';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  drawLogo,
  drawBadge,
  drawAttribution,
  PLATFORM_PATH_STRINGS,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

const clientDemoRaw = JSON.parse(
  await readFile(join(ROOT, 'brands/client-demo.json'), 'utf-8')
);
const clientDemo = resolveBrand(clientDemoRaw);

const registerFontsFor = async (brand) => {
  const weights = brand.fonts?.primary?.weights;
  if (!weights) return;
  for (const [_n, w] of Object.entries(weights)) {
    if (typeof w?.url === 'string' && w.url.length > 0) {
      const abs = join(ROOT, w.url);
      if (existsSync(abs)) {
        try { FontLibrary.use(brand.fonts.primary.family, [abs]); } catch (_e) {}
      }
    }
  }
};
await registerFontsFor(clientDemo);

// ── هويّة A (المواضع الافتراضية) ───────────────────────
// نستعمل client-demo كمصدر ألوان ثابت لتفادي تشتيت المقارنة بلونين.
// المتغيّر الوحيد: placement.
const brandA = {
  ...clientDemo,
  attribution: { ...clientDemo.attribution, logoMode: 'generic' },
  placement: {
    logo:        { anchor: 'bottom-left',  offset: { x: 60, y: 60 } },
    badge:       { anchor: 'top-right',    offset: { x: 60, y: 60 } },
    source:      { anchor: 'bottom-right', offset: { x: 60, y: 220 } },
    attribution: { anchor: 'bottom-right', offset: { x: 60, y: 130 } },
  },
};

const brandB = {
  ...clientDemo,
  attribution: { ...clientDemo.attribution, logoMode: 'generic' },
  placement: {
    logo:        { anchor: 'top-right',   offset: { x: 60, y: 60 } },
    badge:       { anchor: 'bottom-left', offset: { x: 60, y: 60 } },
    source:      { anchor: 'top-left',    offset: { x: 60, y: 220 } },
    attribution: { anchor: 'top-left',    offset: { x: 60, y: 130 } },
  },
};

// ── قماش لكل هوية (1080×1350) + قماش المقارنة ──────────
const CARD_W = 1080;
const CARD_H = 1350;
const GAP = 60;
const HEADER = 90;
const COMPARE_W = 2 * CARD_W + GAP + 2 * 40;
const COMPARE_H = CARD_H + HEADER + 40;

const compare = new Canvas(COMPARE_W, COMPARE_H);
const bg = compare.getContext('2d');

// خلفية خارجية داكنة للفصل البصري
bg.fillStyle = '#0F1218';
bg.fillRect(0, 0, COMPARE_W, COMPARE_H);

// عنوان علوي
bg.fillStyle = '#F8F4E9';
bg.font = '700 32px "IBM Plex Sans Arabic", sans-serif';
bg.textAlign = 'center';
bg.textBaseline = 'top';
bg.direction = 'rtl';
bg.fillText(
  'نفس المحتوى · نفس تركيبة الطبقات · هويّتان بمواضع مختلفة',
  COMPARE_W / 2,
  20
);
bg.font = '400 22px "IBM Plex Sans Arabic", sans-serif';
bg.fillStyle = '#B8B8B8';
bg.fillText(
  'brand.placement يتحكّم بموضع كل من logo · badge · source · attribution',
  COMPARE_W / 2,
  56
);

// ── دالة رسم بطاقة واحدة عن هوية ───────────────────────
// نمرّر ctx بإزاحة أفقية حتى تُرسم البطاقة داخل قماش المقارنة.
async function drawCard(cardCtx, offsetX, offsetY, brand, label) {
  // خلفية البطاقة
  cardCtx.save();
  cardCtx.translate(offsetX, offsetY);
  cardCtx.fillStyle = brand.colors.surface;
  cardCtx.fillRect(0, 0, CARD_W, CARD_H);

  // شبكة إشارية خفيفة
  cardCtx.strokeStyle = 'rgba(255,255,255,0.05)';
  cardCtx.lineWidth = 1;
  for (let i = 60; i < CARD_W; i += 60) {
    cardCtx.beginPath(); cardCtx.moveTo(i, 0); cardCtx.lineTo(i, CARD_H); cardCtx.stroke();
  }
  for (let i = 60; i < CARD_H; i += 60) {
    cardCtx.beginPath(); cardCtx.moveTo(0, i); cardCtx.lineTo(CARD_W, i); cardCtx.stroke();
  }

  // مربع placeholder مركزي يمثّل «مساحة العنوان» — لا نرسم headline لأن
  // فحص placement مستقل عن اللف/التبرير.
  cardCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  cardCtx.lineWidth = 2;
  cardCtx.strokeRect(140, 420, CARD_W - 280, 510);
  cardCtx.fillStyle = '#F8F4E9';
  cardCtx.font = '400 40px "IBM Plex Sans Arabic", sans-serif';
  cardCtx.textAlign = 'center';
  cardCtx.textBaseline = 'middle';
  cardCtx.direction = 'rtl';
  cardCtx.fillText('مساحة العنوان', CARD_W / 2, 420 + 255);

  // ── الطبقات المموضعة عبر brand.placement ────────────
  // 1. logo — drawLogo يقرأ brand.placement.logo. نصنع شعاراً وهمياً
  //    (مربع ملوَّن باسم الهوية) لأن الهويّة الافتراضية بلا صورة شعار.
  const logoCanvas = new Canvas(brand.logo.size, brand.logo.size);
  const lctx = logoCanvas.getContext('2d');
  lctx.fillStyle = brand.colors.accent;
  lctx.fillRect(0, 0, brand.logo.size, brand.logo.size);
  lctx.fillStyle = brand.colors.surface;
  lctx.font = `700 ${Math.round(brand.logo.size * 0.35)}px "IBM Plex Sans Arabic", sans-serif`;
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText('LOGO', brand.logo.size / 2, brand.logo.size / 2);
  const logoBuf = logoCanvas.toBufferSync('png');
  const logoImg = new Image();
  logoImg.src = logoBuf;
  drawLogo(cardCtx, { w: CARD_W, h: CARD_H }, brand, { image: logoImg });

  // 2. badge — نستعمل drawBadge مباشرة مع rx/bottomY محسوبين من
  //    brand.placement.badge (نمط مطابق لما يفعله runBadge في المسار الشاشي).
  const badge = brand.badges.urgent;
  const placementBadge = brand.placement?.badge;
  if (placementBadge) {
    const [vert, horiz] = placementBadge.anchor.split('-');
    // rx على الحافّة اليمنى للشارة
    let rx;
    if (horiz === 'right') {
      rx = CARD_W - placementBadge.offset.x;
    } else if (horiz === 'left') {
      rx = placementBadge.offset.x + 260; // تقدير عرض
    } else {
      rx = CARD_W / 2 + 130;
    }
    let bottomY;
    if (vert === 'top') {
      bottomY = placementBadge.offset.y + badge.height;
    } else if (vert === 'bottom') {
      bottomY = CARD_H - placementBadge.offset.y;
    } else {
      bottomY = CARD_H / 2 + badge.height / 2;
    }
    drawBadge(cardCtx, { w: CARD_W, h: CARD_H }, brand, {
      badge,
      rx,
      bottomY,
    });
  }

  // 3. source — نصّ خطي مموضَع يدوياً وفقاً لـplacement
  const placementSource = brand.placement?.source;
  if (placementSource) {
    const [svert, shoriz] = placementSource.anchor.split('-');
    const srcCfg = brand.typography.source;
    const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
    cardCtx.font = `${srcCfg.weight} ${srcCfg.size}px ${family}`;
    cardCtx.fillStyle = brand.colors.text;
    cardCtx.textBaseline = 'alphabetic';
    let sx;
    if (shoriz === 'right') { sx = CARD_W - placementSource.offset.x; cardCtx.textAlign = 'right'; }
    else if (shoriz === 'left') { sx = placementSource.offset.x; cardCtx.textAlign = 'left'; }
    else { sx = CARD_W / 2; cardCtx.textAlign = 'center'; }
    const sy =
      svert === 'top'
        ? placementSource.offset.y + srcCfg.size
        : svert === 'bottom'
        ? CARD_H - placementSource.offset.y
        : CARD_H / 2;
    cardCtx.direction = 'rtl';
    cardCtx.fillText('مصدر طبي — مراسلنا', sx, sy);
  }

  // 4. attribution — نمرّر Path2D (وضع generic لا يحتاجه فعلياً)
  const tiktokPath = new Path2D(PLATFORM_PATH_STRINGS.tiktok);
  drawAttribution(cardCtx, { w: CARD_W, h: CARD_H }, brand, {
    platform: 'tiktok',
    mode: 'both',
    handle: '@ahmadalshaer',
    name: 'أحمد الشاعر',
    officialPath: tiktokPath,
  });

  // تسمية الهوية أعلى البطاقة
  cardCtx.fillStyle = 'rgba(248,244,233,0.75)';
  cardCtx.font = '400 22px "IBM Plex Sans Arabic", sans-serif';
  cardCtx.textAlign = 'right';
  cardCtx.textBaseline = 'top';
  cardCtx.direction = 'ltr';
  cardCtx.fillText(label, CARD_W - 20, 20);

  cardCtx.restore();
}

// ── ارسم البطاقتين ─────────────────────────────────────
await drawCard(bg, 40, HEADER, brandA,
  'هويّة A · logo=BL · badge=TR · source=BR · attribution=BR');
await drawCard(bg, 40 + CARD_W + GAP, HEADER, brandB,
  'هويّة B · logo=TR · badge=BL · source=TL · attribution=TL');

// ── حدود بين البطاقتين ─────────────────────────────────
bg.strokeStyle = 'rgba(255,255,255,0.15)';
bg.lineWidth = 1;
bg.strokeRect(40, HEADER, CARD_W, CARD_H);
bg.strokeRect(40 + CARD_W + GAP, HEADER, CARD_W, CARD_H);

await writeFile(join(OUT_DIR, 'placement-demo.png'), compare.toBufferSync('png'));
console.log(`[preview-placement] out/placement-demo.png (${COMPARE_W}×${COMPARE_H})`);
console.log('[preview-placement] done');
