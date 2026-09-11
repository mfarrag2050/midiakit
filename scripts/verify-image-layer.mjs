#!/usr/bin/env node
// scripts/verify-image-layer — بوابة انحدار لطبقة الصورة (IMAGE-FIX).
//
// **السياق (2026-09-11 · IMAGE-FIX):** كان `runImage` في `render.ts`
// يمرّر الصورة في مرتبة `_brand` من `drawImage(ctx, size, brand, params)`،
// فتصل الصورة إلى الوسيط الثالث (يُلقى فيه `_brand`) و `params` يصل
// `{crop}` بلا `image` ⇒ `image === undefined` ⇒ (أ) بلا `crop`
// الرسم لا يقع، (ب) مع `crop` رمي `TypeError: Cannot read properties
// of undefined (reading 'width')`. هذا الحارس يمسك الصنفَين.
//
// **لماذا لم يمسكه أحد قبل اليوم:** لا اختبار في السلسلة يوفِّر
// `assets.images.image` صريحاً؛ كل الحرّاس القائمة تسقط على مسار
// fallback (solid/gradient) لأن CONTENT الافتراضي بلا `assets`. هذا
// الحارس يوفّر أصل صورة اصطناعية بلون مركز معلوم.
//
// **الاختبار (لكل قالب من الأربعة):**
//   1. توليد صورة اصطناعية 1080×1080 بلون واحد فريد (`#FF00AA` maggenta).
//   2. renderFrame على قماش `SIZE` مع `assets.images.image = synthImg`.
//   3. قراءة **خمس عيّنات بكسل زواياً** (لا مركزاً — لتفادي طبقات النصّ).
//   4. توكيد: على الأقل عيّنة واحدة تساوي لون الصورة ± عتبة صغيرة
//      (خلفية الهويّة `#0D1B2A` مثلاً لا تتقاطع مع magenta).
//
// **الحالة الثانية — مع `crop`:** تُوفَّر `assets.imageCrops.image` أيضاً.
// كانت هذه هي التي ترمي التسثناء اليوم.
//
// **اختبار الوجود (L-46):** أَعِد سطر render.ts:240 إلى صورته المعطوبة
//   `drawImage(args.ctx, args.size, image, crop ? { crop } : {});`
// شغّل هذا الحارس ⇒ يجب أن يفشل (بلا crop: بكسل الزاوية لا يساوي magenta;
// مع crop: يُرمى TypeError). أَعِده لـ
//   `drawImage(args.ctx, args.size, args.brand, { image, ...(crop ? { crop } : {}) });`
// يمرّ. **مُثبَّت بمخرَج (2026-09-11)** — راجع claude/reports/45-IMAGE-FIX.md.
//
// **القوالب المشمولة (تحديد بعدد، لا تقدير):** أربعة قوالب فيها
// `type: "image"` كطبقة قابلة للتنفيذ في مسار runImage — breaking ·
// card-bottom · card-centered · card-kicker. القالبان `plain` و `reel`
// لا يحملان طبقة صورة (فحص برمجيّ في هذا السكربت — يخرج قائمة القوالب
// المشمولة قبل بدء الفحص).

import { Canvas, Image, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, renderFrame } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');

FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── لون المدخل الاصطناعيّ (فريد — لا يتقاطع مع لوحة الهويّة) ──
const MAGENTA = { r: 0xFF, g: 0x00, b: 0xAA };
// عتبة كبيرة نسبياً — كل ألوان DEFAULT_BRAND رمادية داكنة، والمسافة
// إلى magenta كبيرة (>200 لكل قناة). العتبة تسمح بطبقة تعتيم شفّافة
// (بعض القوالب تُلبس الخلفية طبقة داكنة 6-15% لتحسين قراءة النص).
const COLOR_TOLERANCE = 32;

const brand = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1080 };

// توليد صورة اصطناعية بلون واحد
async function synthImage(w, h, { r, g, b }) {
  const c = new Canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);
  const buf = await c.toBuffer('png');
  const img = new Image();
  img.src = buf;
  await img.decode();
  return img;
}

// اختيار القوالب التي تحمل طبقة type=image فعلاً
function templatesWithImageLayer() {
  const out = [];
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const hasImage = (template.layers ?? []).some((l) => l.type === 'image');
    if (hasImage) out.push([name, template]);
  }
  return out;
}

// قراءة بكسل من canvas — إرجاع {r,g,b}
function readPixel(ctx, x, y) {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2] };
}

function near(a, b) {
  return Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
         Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
         Math.abs(a.b - b.b) <= COLOR_TOLERANCE;
}

async function renderAndCheck(name, template, opts = {}) {
  const { withCrop } = opts;
  const imgW = 2000, imgH = 2000;
  const img = await synthImage(imgW, imgH, MAGENTA);
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');

  const assets = {
    images: { image: img },
    ...(withCrop ? { imageCrops: { image: { sx: 200, sy: 200, sw: 1600, sh: 1600 } } } : {}),
  };

  const content = {
    kicker: 'كيكر',
    headline: 'عنوان اختبار',
    title: 'ريلز',
    source: 'مصدر',
    caption: 'ترجمة',
    location: 'موقع',
    sourceHandle: '@t',
    sourceName: 'مصدر',
  };

  try {
    renderFrame({ ctx, size: SIZE, template, brand, content, assets });
  } catch (err) {
    return { name, withCrop, ok: false, reason: `renderFrame threw: ${err.message}`, samples: [] };
  }

  // خمس عيّنات: أربع زوايا + مركز
  const samplePoints = [
    { label: 'top-left',  x: 5, y: 5 },
    { label: 'top-right', x: SIZE.w - 6, y: 5 },
    { label: 'bot-left',  x: 5, y: SIZE.h - 6 },
    { label: 'bot-right', x: SIZE.w - 6, y: SIZE.h - 6 },
    { label: 'center',    x: (SIZE.w / 2) | 0, y: (SIZE.h / 2) | 0 },
  ];
  const samples = samplePoints.map((p) => ({ ...p, color: readPixel(ctx, p.x, p.y) }));
  const magentaCount = samples.filter((s) => near(s.color, MAGENTA)).length;

  return {
    name,
    withCrop,
    ok: magentaCount >= 1,
    reason: magentaCount >= 1
      ? `${magentaCount}/5 عيّنة = magenta`
      : `صفر عيّنة تساوي magenta — الطبقة لم تُرسم`,
    samples,
  };
}

// ── تشغيل الحارس ─────────────────────────────
console.log('▶ verify-image-layer');
const templates = templatesWithImageLayer();
console.log(`  قوالب تحمل طبقة image: ${templates.length} → ${templates.map(([n]) => n).join(', ')}`);
console.log(`  لون المدخل: rgb(${MAGENTA.r},${MAGENTA.g},${MAGENTA.b}) · SIZE ${SIZE.w}×${SIZE.h} · TOLERANCE ±${COLOR_TOLERANCE}`);
console.log();

const results = [];
for (const [name, template] of templates) {
  // (١) بلا crop
  const r1 = await renderAndCheck(name, template, { withCrop: false });
  results.push(r1);
  const mark1 = r1.ok ? '✓' : '✗';
  console.log(`  ${mark1} ${name} · بلا crop → ${r1.reason}`);
  if (!r1.ok) {
    for (const s of r1.samples) {
      console.log(`      ${s.label}(${s.x},${s.y}) = rgb(${s.color.r},${s.color.g},${s.color.b})`);
    }
  }

  // (٢) مع crop — كانت الحالة التي ترمي TypeError
  const r2 = await renderAndCheck(name, template, { withCrop: true });
  results.push(r2);
  const mark2 = r2.ok ? '✓' : '✗';
  console.log(`  ${mark2} ${name} · مع crop → ${r2.reason}`);
  if (!r2.ok) {
    for (const s of r2.samples) {
      console.log(`      ${s.label}(${s.x},${s.y}) = rgb(${s.color.r},${s.color.g},${s.color.b})`);
    }
  }
}

console.log();
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`✗ verify-image-layer FAILED — ${failed.length}/${results.length} حالة فشلت`);
  for (const f of failed) console.error(`  فشل: ${f.name} ${f.withCrop ? 'مع crop' : 'بلا crop'} — ${f.reason}`);
  process.exit(1);
}

console.log(`✓ verify-image-layer PASSED — ${results.length}/${results.length} حالة (${templates.length} قوالب × 2 حالتان)`);
process.exit(0);
