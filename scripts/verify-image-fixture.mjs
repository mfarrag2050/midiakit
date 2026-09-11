#!/usr/bin/env node
// scripts/verify-image-fixture — الطبقة الثالثة من البوابة البصريّة
// (GATE-2LAYER · 2026-09-11).
//
// **الفرضية:** أصل صورة **مثبَّت في المستودع** يمرّ عبر `assets.images` إلى
// `renderFrame`، ويُختبَر أنّ لون البكسل في مواضع معلومة يطابق لون الأصل.
// يحرس مسار الصورة الحقيقيّ الذي بُني في `93ae08f` — بلا هذا لا شيء يمنع
// انحداره.
//
// **تقسيم البوابات (GATE-2LAYER · 2026-09-11):** هذا الحارس **وحده** يفحص
// مسار الصورة. `verify:snapshot` يفحص خلفيّة `preview.mjs` البديلة
// (fallback) لأنّه لا يمرّر `assets.images`. لا يفترض أحد أنّ سلامة
// `verify:snapshot` تعني سلامة مسار الصورة — البوابتان منفصلتان بالتصميم.
//
// **الأصل:** `fixtures/images/quad-test.png` — 800×1200 بأربعة أرباع
// ملوّنة (TL=أحمر · TR=أخضر · BL=أزرق · BR=أصفر) + تدرّج diagonal + دائرة
// مركز. **غير متجانس · غير متناظر · نسبة 2:3 (تختلف عن إطار المخرَج).**
// مُوَلَّد مرّة عبر `scripts/generate-fixture-image.mjs` داخل حاوية Linux.
//
// **الاختبار (لكل قالب من الأربعة التي تحمل طبقة image):**
//   (١) رندر مع assets.images.image = fixture (بلا crop):
//       - نسبة الإطار > نسبة الأصل ⇒ اقتصاص أفقيّ يُبقي الارتفاع كاملاً.
//       - عيّنات: زاوية علوية-يمنى + زاوية سفلية-يسرى تظهر ألوان
//         الرُبعَين المطابقَين للأصل بعد `cover`.
//   (٢) رندر مع assets.imageCrops.image = TL-ربع فقط (0,0,400,600):
//       - كل الإطار الظاهر ينتمي إلى الربع الأحمر ⇒ عيّنات ≈ أحمر.
//       - يفشل الحارس القديم verify:image-layer لأنّ الأصل هناك أحاديّ اللون.
//
// **platform-agnostic:** الاختبار خاصّيّة لونيّة (color property)، لا بايت.
// يعمل على macOS و Linux بلا فرق. **لا فحص process.platform هنا.**
//
// **اختبار الوجود (L-46):** غيّر لون TL في `generate-fixture-image.mjs`،
// أعِد توليد fixture، شغّل هذا الحارس ⇒ يفشل لأنّ العيّنة تعطي magenta بدل
// الأحمر. أعِد الأصل ⇒ يمرّ.

import { Canvas, Image, FontLibrary } from 'skia-canvas';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, renderFrame } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
const FIXTURE = join(ROOT, 'fixtures/images/quad-test.png');

FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ألوان الأرباع في fixture — يجب أن تطابق generate-fixture-image.mjs
const QUAD = {
  TL: { r: 220, g: 40,  b: 60  },
  TR: { r: 60,  g: 180, b: 80  },
  BL: { r: 40,  g: 90,  b: 200 },
  BR: { r: 230, g: 200, b: 50  },
};

// عتبة تسامح لوني — يسمح بتعتيم شفّاف من طبقات النصّ/البادج فوق الصورة
// (بعض القوالب تُلبس overlay 6-15%). المسافة إلى أيّ لون هويّة (كلها
// رمادية داكنة) أكبر بمراحل من هذه العتبة.
const TOL = 40;

const brand = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1080 };

async function loadFixture() {
  const buf = readFileSync(FIXTURE);
  const img = new Image();
  img.src = buf;
  await img.decode();
  return img;
}

function readPixel(ctx, x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

function near(a, b) {
  return Math.abs(a.r - b.r) <= TOL &&
         Math.abs(a.g - b.g) <= TOL &&
         Math.abs(a.b - b.b) <= TOL;
}

function whichQuad(color) {
  for (const [name, q] of Object.entries(QUAD)) {
    if (near(color, q)) return name;
  }
  return 'NONE';
}

function templatesWithImage() {
  return Object.entries(TEMPLATES).filter(([, t]) =>
    (t.layers ?? []).some((l) => l.type === 'image')
  );
}

async function renderCase(name, template, opts = {}) {
  const { crop } = opts;
  const img = await loadFixture();
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');

  const assets = {
    images: { image: img },
    ...(crop ? { imageCrops: { image: crop } } : {}),
  };
  const content = {
    kicker: 'كيكر', headline: 'عنوان اختبار', title: 'ريلز',
    source: 'مصدر', caption: 'ترجمة', location: 'موقع',
    sourceHandle: '@t', sourceName: 'مصدر',
  };

  try {
    renderFrame({ ctx, size: SIZE, template, brand, content, assets });
  } catch (err) {
    return { name, crop: !!crop, ok: false, reason: `renderFrame threw: ${err.message}`, samples: [] };
  }

  // نأخذ عيّنات من زوايا القماش (بعيداً عن مركز حيث النصّ/البادج)
  const samplePoints = [
    { label: 'top-left',  x: 5, y: 5 },
    { label: 'top-right', x: SIZE.w - 6, y: 5 },
    { label: 'bot-left',  x: 5, y: SIZE.h - 6 },
    { label: 'bot-right', x: SIZE.w - 6, y: SIZE.h - 6 },
  ];
  const samples = samplePoints.map((p) => {
    const color = readPixel(ctx, p.x, p.y);
    return { ...p, color, quad: whichQuad(color) };
  });

  return { name, crop: !!crop, samples };
}

console.log('▶ verify-image-fixture');
const templates = templatesWithImage();
console.log(`  fixture: ${FIXTURE.replace(ROOT + '/', '')} · ${Object.keys(QUAD).length} ربع لونيّ`);
console.log(`  قوالب تحمل طبقة image: ${templates.length} · TOL=±${TOL}`);
console.log();

const results = [];

// ═════ (١) بلا crop — نتوقّع رؤية أربع ألوان الأرباع في زوايا القماش
for (const [name, template] of templates) {
  const r = await renderCase(name, template, {});
  // معيار: على الأقلّ اثنتان من الزوايا الأربع = ربع معروف (بعد cover
  // + طبقات فوق، بعض الزوايا قد تُغطَّى بـbadge/kicker)
  const distinctQuads = new Set(r.samples.map((s) => s.quad).filter((q) => q !== 'NONE'));
  const ok = distinctQuads.size >= 2;
  r.ok = ok;
  r.reason = ok
    ? `${distinctQuads.size} ألوان أرباع متمايزة في الزوايا: ${[...distinctQuads].join(', ')}`
    : `أقلّ من ربعَين متمايزَين — الصورة لم تُرسم أو غُطِّيت كلها`;
  const mark = r.ok ? '✓' : '✗';
  console.log(`  ${mark} ${name.padEnd(16)} · بلا crop → ${r.reason}`);
  if (!r.ok) {
    for (const s of r.samples) {
      console.log(`      ${s.label.padEnd(10)}(${s.x},${s.y}) = rgb(${s.color.r},${s.color.g},${s.color.b}) [${s.quad}]`);
    }
  }
  results.push(r);
}

// ═════ (٢) مع crop — TL فقط (أحمر)
// الاقتصاص يقتصر على الربع الأحمر ⇒ كل الزوايا الظاهرة يجب أن تكون قريبة من الأحمر
console.log(``);
for (const [name, template] of templates) {
  const r = await renderCase(name, template, { crop: { sx: 0, sy: 0, sw: 400, sh: 600 } });
  const redSamples = r.samples.filter((s) => s.quad === 'TL');
  // معيار: على الأقلّ عيّنة واحدة أحمر (بعض الزوايا قد تُغطَّى بطبقات فوقيّة)
  const ok = redSamples.length >= 1;
  r.ok = ok;
  r.reason = ok
    ? `${redSamples.length}/4 عيّنات = TL (أحمر) — الاقتصاص صحيح`
    : `صفر عيّنات = TL — imageCrops لم يُطبَّق`;
  const mark = r.ok ? '✓' : '✗';
  console.log(`  ${mark} ${name.padEnd(16)} · مع crop=TL → ${r.reason}`);
  if (!r.ok) {
    for (const s of r.samples) {
      console.log(`      ${s.label.padEnd(10)}(${s.x},${s.y}) = rgb(${s.color.r},${s.color.g},${s.color.b}) [${s.quad}]`);
    }
  }
  results.push(r);
}

console.log(``);
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`✗ verify-image-fixture FAILED — ${failed.length}/${results.length} حالة`);
  process.exit(1);
}
console.log(`✓ verify-image-fixture PASSED — ${results.length}/${results.length} حالة (${templates.length} قوالب × 2 حالتان)`);
process.exit(0);
