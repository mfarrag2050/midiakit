#!/usr/bin/env node
// scripts/demo-live — يرندَر ٣ لقطات BREAKING بهويّة عميل مباشرة من
// ملفّ JSON. أمر واحد: `pnpm demo:live -- <path/to/live.json>`.
//
// **90-DEMO-LIVE · 2026-09-11.**
//
// **الشكل المتوقَّع لـlive.json:**
//   {
//     "brandName": "…",
//     "colors": { "primary": "#…", "accent": "#…", "text": "#…" },
//     "logo": "assets/brands/<x>.png",
//     "headlines": ["…", "…", "…"]   // ثلاثة تماماً
//   }
//
// **المخرَج:** `demo/live/<slug>-<1|2|3>.png` بحجم 1080×1350 (BREAKING).
//   `slug` مشتقّ من brandName بإزالة الرموز غير الأبجديّة والفراغات.
//
// **مطابقة الألوان (`live.colors` → `BrandKit.colors`):**
//   primary → urgentBg + urgentBadge (اللون السائد لـBREAKING bar)
//   accent  → accent (سطر التأكيد + الشريط)
//   text    → text (لون النصّ العلوي)
// حقول الألوان الأخرى (surface · placeholder · urgentBgTint · locationBadge)
// تبقى من `DEFAULT_BRAND` — تخصّ عناصر لا تظهر في BREAKING.
//
// **حقول live.json الأربعة إلزاميّة صريحاً** (L-71/L-73):
// حقل ناقص ⇒ رمي استثناء يسمّي الحقل + طريقة الإصلاح. **ممنوع ارتداد
// صامت إلى DEFAULT_BRAND** لحقل تركيبيّ live.json مسؤول عنه.
//
// **بنية BrandKit المتبقّية** (typography · badges · margins · motion ·
// fonts.primary.weights.*.metrics · إلخ) تُنسَخ من `DEFAULT_BRAND` — هذه
// حقول تركيبيّة عامّة لا يعنيها live.json. حين يريد العميل شيئاً منها،
// يُوسَّع الشكل — لا يُخترع افتراض صامت.
//
// **الاختبار السلبيّ (L-46):** راجع claude/reports/90-DEMO-LIVE.md §٣.

import { Canvas, Image, FontLibrary } from 'skia-canvas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  renderFrame,
  buildRenderPlan,
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

// ── قراءة الوسيط + التحقّق ───────────────────────────
// نتجاوز `--` (فاصل pnpm) إن ظهر في argv.
const argv = process.argv.slice(2).filter((a) => a !== '--');
const inputArg = argv[0];
if (!inputArg) {
  console.error('استعمال: pnpm demo:live -- <path/to/live.json>');
  process.exit(2);
}
const inputPath = resolve(inputArg);
if (!existsSync(inputPath)) {
  console.error(`✗ الملفّ غير موجود: ${inputPath}`);
  process.exit(2);
}

/** يرمي رسالة تسمّي الحقل والإصلاح — لا ارتداد صامت. */
function requireField(obj, path, description, hint) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      throw new Error(`[demo-live] حقل ناقص «${path}» (${description}). ${hint}`);
    }
    if (!(p in cur)) {
      throw new Error(`[demo-live] حقل ناقص «${path}» (${description}). ${hint}`);
    }
    cur = cur[p];
  }
  if (cur === null || cur === undefined || cur === '') {
    throw new Error(`[demo-live] حقل فارغ «${path}» (${description}). ${hint}`);
  }
  return cur;
}

const raw = readFileSync(inputPath, 'utf8');
let live;
try {
  live = JSON.parse(raw);
} catch (err) {
  throw new Error(`[demo-live] فشل تحليل JSON: ${err.message}`);
}

const brandName = requireField(live, 'brandName', 'اسم العلامة الظاهر في التقرير + slug',
  'أضِف "brandName": "اسم العلامة".');

const primary = requireField(live, 'colors.primary', 'اللون السائد (urgentBg + urgentBadge)',
  'أضِف "colors.primary": "#HHHHHH".');
const accent = requireField(live, 'colors.accent', 'لون التأكيد (accent)',
  'أضِف "colors.accent": "#HHHHHH".');
const text = requireField(live, 'colors.text', 'لون النصّ',
  'أضِف "colors.text": "#HHHHHH".');

const logoPath = requireField(live, 'logo', 'مسار PNG الشعار (نسبيّ للجذر)',
  'أضِف "logo": "assets/brands/name.png".');
const logoAbs = resolve(ROOT, logoPath);
if (!existsSync(logoAbs)) {
  throw new Error(`[demo-live] ملفّ الشعار غير موجود: ${logoAbs}. تأكّد أنّ "logo" مسار صحيح نسبةً لجذر المستودع.`);
}

if (!Array.isArray(live.headlines)) {
  throw new Error('[demo-live] حقل ناقص «headlines» (قائمة العناوين). أضِف "headlines": [...] مصفوفة نصوص.');
}
if (live.headlines.length !== 3) {
  throw new Error(`[demo-live] عدد العناوين المطلوب = 3 (المخرَج ثلاث بطاقات <1|2|3>). الحاليّ = ${live.headlines.length}.`);
}
for (let i = 0; i < 3; i++) {
  if (typeof live.headlines[i] !== 'string' || live.headlines[i].trim() === '') {
    throw new Error(`[demo-live] العنوان headlines[${i}] فارغ أو ليس نصّاً. كل عنوان يجب أن يكون سلسلة غير فارغة.`);
  }
}

// ── slug من brandName ─────────────────────────────
// نحافظ على العربيّة + اللاتينيّة + الأرقام، ونستبدل الباقي بشرطة.
function slugify(name) {
  const s = String(name).toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'brand';
}
const slug = slugify(brandName);

// ── بناء BrandKit ──────────────────────────────────
// نسخة عميقة من DEFAULT_BRAND (كل الحقول التركيبيّة) + استبدال ما يعنيه live.
const brandBase = JSON.parse(JSON.stringify(DEFAULT_BRAND));
const brand = resolveBrand({
  ...brandBase,
  name: brandName,
  colors: {
    ...brandBase.colors,
    text,
    accent,
    urgentBg: primary,
    urgentBadge: primary,
  },
  logo: {
    ...brandBase.logo,
    url: logoPath,
  },
});

// ── تحميل الشعار (إن كان القالب يستهلكه) ──────────
const logoImg = new Image();
logoImg.src = readFileSync(logoAbs);
await logoImg.decode();

// ── الرسم + القياس ────────────────────────────────
async function renderCard(headline, outPath) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  renderFrame({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: { headline, source: 'المصدر' },
    assets: { images: { logo: logoImg } },
  });
  await canvas.toFile(outPath);
}

function measureLayout(headline) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: { headline, source: 'المصدر' },
    fps: 30,
  });
  const h = plan.headline;
  return {
    fs: h.fontSize,
    lines: h.linesJustified.map((l) => l.map((t) => t.text ?? '').join(' ')),
  };
}

// ── التنفيذ ────────────────────────────────────────
const OUT_DIR = join(ROOT, 'demo/live');
await mkdir(OUT_DIR, { recursive: true });

console.log(`▶ demo:live · brandName=${brandName} · slug=${slug}`);
console.log(`  colors: primary=${primary} · accent=${accent} · text=${text}`);
console.log(`  logo: ${logoPath} (${(readFileSync(logoAbs).length / 1024).toFixed(1)}KB)`);
console.log('');

for (let i = 0; i < 3; i++) {
  const headline = live.headlines[i];
  const outPath = join(OUT_DIR, `${slug}-${i + 1}.png`);
  const m = measureLayout(headline);
  await renderCard(headline, outPath);
  console.log(`  ✓ ${basename(outPath)} · fs=${m.fs} · ${m.lines.length} سطر`);
  for (const line of m.lines) console.log(`      ${line}`);
  console.log('');
}

console.log(`✓ demo-live · 3/3 بطاقات · ${OUT_DIR.replace(ROOT + '/', '')}`);
