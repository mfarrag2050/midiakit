// scripts/verify-text-contrast — بوّابة تباين WCAG على أدنى نقطة نصّ فوق صورة.
//
// **العلّة (99-SCRIM-CONTRAST · 2026-09-11 · قياس mkau في 220-CONTRAST-MEASURE):**
// طبقة `layer[1] gradient · onlyIf='hasImage'` في breaking.json تُغمِّق قاع
// الخلفيّة (peak=0.72 · direction=bottom · reach=0.9)، لكنّ عند سطر العنوان
// الأوّل (y≈715) الشدّة الفعليّة ≈49% — لا تكفي فوق خلفيّة ساطعة. 220 قاس:
//   - أبيض #F8F8F8: headline 4.06:1 ✗
//   - سماء #FFF→#B3D9F5: headline 4.51:1 ✓ بفارق 0.01
//   - شبكة 40px: headline 3.84:1 ✗
//   - داكن #1A1A1A: headline 19.44:1 ✓
//
// وصفر فاحص تباين في المستودع كلّه (2026-09-11).
//
// **ما يفعله هذا الفاحص:**
//   1. يولّد ٤ خلفيّات في `out/text-contrast/` (بلا اعتماد على /tmp
//      عند غيرك — دليلٌ لا يُعاد إنتاجه ليس دليلاً).
//   2. لكلّ خلفيّة: يُرندَر بطاقة breaking (1080×1350) مرّتَين — A مع
//      نصّ، B بلا طبقات النصّ (فِلترة قوالب headline/badge/source/attribution).
//   3. يستخرج قناع النصّ: بكسل ساطع (≥600 مجموع RGB) و A≠B بفارق ≥60.
//   4. لكلّ بكسل مُقنَّع: يحسب WCAG contrast = 1.05 / (L_B + 0.05)
//      (نصّ التصميم #FFFFFF ⇒ L_text=1.0).
//   5. يجمّع البكسلات في أسطر بفجوة عموديّة ≤15px.
//   6. يوكِّد: **أدنى** تباين للعنوان (السطر الأطول) ≥ 4.5. المصدر (سطر
//      أدنى) كذلك. الشارة تُقاس وتُبلَّغ لكن لا تُوكَّد (قياسها يخصّ الصندوق
//      الأحمر لا الخلفيّة — راجع 220 §تحفّظ).
//
// **الاسم والزمن لسلسلة pnpm test:** `check:text-contrast` (اقتراح لـmkci)،
// زمن التشغيل الحاليّ ≈ 8–12 ثانية على الميني (٤ خلفيّات × ٢ رندَر × 1080×1350).
//
// **اختبار حياة L-46:** غيّر temporarily القيمة `SAFE_CONTRAST` أدناه إلى
// رقم فوقيّ (مثلاً 10.0) → أحمر يسمّي العيّنة والسطر والرقم. أعِد إلى 4.5
// → أخضر. طريقة أخرى: خفّض opacity في `packages/templates/src/templates/breaking.json`
// عمداً (مثلاً 0.5) → أحمر بأرقام أدنى.
//
// **platform-agnostic:** خاصّيّة لونيّة (property)، لا بايت. macOS+Linux
// يعطيان نفس القياس بالنسبة (فروق sub-pixel لا تغيّر منطقة LB بمقدار
// ملحوظ).

import { Canvas, Image, FontLibrary } from 'skia-canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, renderFrame } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
const OUT_DIR = join(ROOT, 'out/text-contrast');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── ثوابت ────────────────────────────────────────────────
const W = 1080, H = 1350;
const SIZE = { w: W, h: H };
const SAFE_CONTRAST = 4.5;                    // WCAG AA نصّ عادي
const TEXT_LUMINANCE = 1.0;                   // #FFFFFF
const HEADLINE_CONTENT = {
  headline: 'انفجار في محطّة الوقود يودي بحياة ثلاثة أشخاص',
  source: 'وكالات',
};
const BADGE_Y_RANGE = [620, 680];             // شارة العاجل — تُبلَّغ لا تُوكَّد
const LINE_GAP_TOL = 15;                      // فجوة عموديّة تفصل الأسطر

// ── ١) توليد الخلفيّات الأربع ─────────────────────────────
async function generateBg(name, drawFn) {
  const c = new Canvas(W, H);
  const ctx = c.getContext('2d');
  drawFn(ctx);
  const buf = await c.toBuffer('png');
  await writeFile(join(OUT_DIR, name), buf);
  const img = new Image();
  img.src = buf;
  await img.decode();
  return img;
}

async function makeBackgrounds() {
  return {
    'bg-1-white': await generateBg('bg-1-white.png', (ctx) => {
      ctx.fillStyle = '#F8F8F8';
      ctx.fillRect(0, 0, W, H);
    }),
    'bg-2-sky': await generateBg('bg-2-sky.png', (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(1, '#B3D9F5');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }),
    'bg-3-checker': await generateBg('bg-3-checker.png', (ctx) => {
      const CELL = 40;
      for (let y = 0; y < H; y += CELL) {
        for (let x = 0; x < W; x += CELL) {
          const dark = ((x / CELL + y / CELL) % 2) === 0;
          ctx.fillStyle = dark ? '#000000' : '#FFFFFF';
          ctx.fillRect(x, y, CELL, CELL);
        }
      }
    }),
    'bg-4-dark': await generateBg('bg-4-dark.png', (ctx) => {
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(0, 0, W, H);
    }),
  };
}

// ── ٢) رندَر البطاقة مرّتَين — كامل + بلا نصّ ─────────────
const TEXT_LAYER_TYPES = new Set(['headline', 'badge', 'source', 'attribution']);
const brand = resolveBrand(DEFAULT_BRAND);
const BREAKING = TEMPLATES.breaking;

function templateWithoutText(t) {
  return {
    ...t,
    layers: t.layers.filter((l) => !TEXT_LAYER_TYPES.has(l.type)),
  };
}

async function renderCard(bgImage, includeText) {
  const c = new Canvas(W, H);
  const ctx = c.getContext('2d');
  renderFrame({
    ctx,
    size: SIZE,
    template: includeText ? BREAKING : templateWithoutText(BREAKING),
    brand,
    content: HEADLINE_CONTENT,
    assets: { images: { image: bgImage } },
  });
  return c;
}

// ── ٣) WCAG luminance من قناة sRGB (تلينة كاملة) ────────
function sRgbToLinear(v) {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function relativeLuminance(r, g, b) {
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

// ── ٤) قناع النصّ (A - B) + قياس التباين لكلّ بكسل مُقنَّع ─
function measureContrastMap(imgA, imgB) {
  const dataA = imgA.data, dataB = imgB.data;
  const points = []; // { x, y, contrast }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const rA = dataA[i], gA = dataA[i + 1], bA = dataA[i + 2];
      const rB = dataB[i], gB = dataB[i + 1], bB = dataB[i + 2];
      const sumA = rA + gA + bA;
      const diff = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);
      if (sumA >= 600 && diff >= 60) {
        const L_B = relativeLuminance(rB, gB, bB);
        const contrast = (TEXT_LUMINANCE + 0.05) / (L_B + 0.05);
        points.push({ x, y, contrast, L_B });
      }
    }
  }
  return points;
}

// تجميع في أسطر بفجوة عموديّة ≤ LINE_GAP_TOL
function groupIntoLines(points) {
  if (points.length === 0) return [];
  const byY = new Map();
  for (const p of points) {
    if (!byY.has(p.y)) byY.set(p.y, []);
    byY.get(p.y).push(p);
  }
  const ys = [...byY.keys()].sort((a, b) => a - b);
  const lines = [];
  let current = { yStart: ys[0], yEnd: ys[0], points: [...byY.get(ys[0])] };
  for (let k = 1; k < ys.length; k++) {
    const y = ys[k];
    if (y - current.yEnd <= LINE_GAP_TOL) {
      current.yEnd = y;
      current.points.push(...byY.get(y));
    } else {
      lines.push(current);
      current = { yStart: y, yEnd: y, points: [...byY.get(y)] };
    }
  }
  lines.push(current);
  return lines.map((l) => {
    let worst = l.points[0];
    for (const p of l.points) if (p.contrast < worst.contrast) worst = p;
    return {
      yStart: l.yStart, yEnd: l.yEnd, count: l.points.length,
      minContrast: worst.contrast,
      worstAt: { x: worst.x, y: worst.y },
      worstLB: worst.L_B,
    };
  });
}

// تصنيف: هل هذا سطر شارة (يقع في نطاق شارة العاجل)؟
function isBadgeLine(line) {
  const [b0, b1] = BADGE_Y_RANGE;
  return line.yStart >= b0 && line.yEnd <= b1;
}

// ── ٥) الحلقة الرئيسة ──────────────────────────────────
console.log('▶ verify-text-contrast · WCAG على أدنى نقطة نصّ فوق صورة');
console.log(`  الخلفيّات: ٤ · الأبعاد: ${W}×${H} · القالب: breaking`);
console.log(`  عتبة العنوان والمصدر: ≥ ${SAFE_CONTRAST}:1 (WCAG AA)`);
console.log('');

const bgs = await makeBackgrounds();
console.log(`  ✓ ${Object.keys(bgs).length} خلفيّات مُولَّدة في ${OUT_DIR.replace(ROOT + '/', '')}/`);
console.log('');

let anyFail = false;
const failures = [];

for (const [name, img] of Object.entries(bgs)) {
  console.log(`═══════════ ${name} ═══════════`);
  const canvasA = await renderCard(img, true);
  const canvasB = await renderCard(img, false);
  await writeFile(join(OUT_DIR, `card-${name.slice(3)}.png`), canvasA.toBufferSync('png'));
  await writeFile(join(OUT_DIR, `card-${name.slice(3)}-notext.png`), canvasB.toBufferSync('png'));

  const ctxA = canvasA.getContext('2d');
  const ctxB = canvasB.getContext('2d');
  const imgDataA = ctxA.getImageData(0, 0, W, H);
  const imgDataB = ctxB.getImageData(0, 0, W, H);

  const points = measureContrastMap(imgDataA, imgDataB);
  const lines = groupIntoLines(points);
  console.log(`    بكسلات نصّ مُقنَّعة: ${points.length} · أسطر مُكتشَفة: ${lines.length}`);

  for (const line of lines) {
    const badge = isBadgeLine(line);
    const label = badge ? '‹badge› (تُقاس لا تُوكَّد)' : `y=${line.yStart}–${line.yEnd}`;
    const mark = badge
      ? '·'
      : line.minContrast >= SAFE_CONTRAST ? '✓' : '✗';
    console.log(
      `    ${mark} ${label.padEnd(35)} min=${line.minContrast.toFixed(2)}:1 ` +
      `· (${line.worstAt.x},${line.worstAt.y}) · L_bg=${line.worstLB.toFixed(4)} ` +
      `· ${line.count}px`
    );
    if (!badge && line.minContrast < SAFE_CONTRAST) {
      anyFail = true;
      failures.push({
        bg: name, y: `${line.yStart}-${line.yEnd}`, min: line.minContrast,
        at: line.worstAt, lb: line.worstLB, count: line.count,
      });
    }
  }
  console.log('');
}

console.log('');
if (anyFail) {
  console.error('✗ verify-text-contrast FAILED');
  console.error('');
  for (const f of failures) {
    console.error(`  ${f.bg} · y=${f.y} · ${f.min.toFixed(2)}:1 < ${SAFE_CONTRAST}`);
    console.error(`    أسوأ نقطة: (${f.at.x}, ${f.at.y}) · L_bg=${f.lb.toFixed(4)} · ${f.count} بكسل نصّ`);
  }
  console.error('');
  console.error('  الحلّ: قوِّ overlay طبقة gradient onlyIf=hasImage في breaking.json');
  console.error('  أو أضف طبقة scrim ثابتة الشدّة عند نطاق النصّ.');
  process.exit(1);
}
console.log(`✓ verify-text-contrast PASSED — كل الأسطر ≥ ${SAFE_CONTRAST}:1`);
