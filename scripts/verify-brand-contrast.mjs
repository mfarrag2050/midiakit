// scripts/verify-brand-contrast — بوّابة تباين WCAG على البكسلِ المرسوم،
// لكلِّ (هويّة × قالب).
//
// **العلّة (mk/478b · 2026-09-24):** `verify:text-contrast` كان يقيسُ على
// خلفيّاتٍ اصطناعيّةٍ لا على البطاقةِ المرسومة، ونصّاً أبيضَ مفترضاً. فحين
// أنشأنا هويّةً بلوحةٍ فاتحة (`manara-agency`)، سقطتْ بطاقةُ العاجل بلا
// أن يصرخَ فاحصٌ آليّ. المشكلةُ الأعمقُ: **نصٌّ داكنٌ على خلفيّةٍ داكنة
// لا يُنتج فرقاً بيكسليّاً بين A(نصّ) و B(بلا نصّ)** — لأنّه غيرُ مرئيّ
// أصلاً. فقياسُ التباينِ من قناعِ الفرقِ يعمى عن أوضح عطب.
//
// **الحلّ:** لا نُبصِرُ النصَّ من الفارق. نعرفُ من الهويّةِ **ما اللونُ
// الذي سيُطبَعُ به العنوانُ** (`brand.colors.text` — أو `colors.urgentText`
// حين يُقدَّم)، ونقيسُ الخلفيّةَ **في الشريطِ الرأسيّ للعنوان** من نسخةٍ
// بلا طبقات النص. الحسابُ نظريٌّ لا مبنيٌّ على مقارنةِ بايتات.
//
// **ما يفعله هذا الفاحص:**
//   لكلّ هويّة في `brands/` + `DEFAULT_BRAND` × كلّ قالب في `TEMPLATES`:
//   1. رَنْدَرَ B: قالبٌ بلا طبقاتِ النص (headline · badge · source ·
//      attribution · kicker) — يبقى substrate (image · solid · gradient
//      · logo) فقط.
//   2. حدّدْ لونَ العنوانِ من الهويّة والقالب:
//        - `breaking` (يحملُ solid=urgentBg في fallback) ⇒ يُستعمل
//          `colors.urgentText` إن قُدِّم، وإلّا `colors.text`.
//        - غيرُ ذلك ⇒ `colors.text`.
//   3. حدّدْ y-range للعنوانِ من `template.layers[headline]`
//      (verticalAnchor أو anchor) وارتفاعِ القماش، مع هامشٍ ±20% من
//      ارتفاعِ خطِّ العنوان لضمانِ الشمول.
//   4. متوسّطُ (median) لونِ B داخلَ الشريط ⇒ لونُ الخلفيّة.
//   5. WCAG contrast = (L_max + 0.05) / (L_min + 0.05).
//   6. **يُوكِّد:** التباينُ ≥ SAFE_CONTRAST (4.5:1 — WCAG AA نصٌّ عاديّ)
//      لكلّ (هويّة × قالب).
//
// **اختبار حياة L-46:** أنشئْ هويّةً بنصٍّ داكنٍ (`#1A2733`) و`urgentBg`
// داكن (`#1A2733`) بلا `urgentText` ⇒ `breaking` يسقطُ بـ~1:1. أَعِدْ
// `urgentText` فاتحاً (`#F5F1E8`) ⇒ يعودُ أخضرَ.
//
// **platform-agnostic:** خاصّيّة لونيّة (property)، لا بايت.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { resolveBrand, renderFrame } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');

// ── ثوابت ────────────────────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const SAFE_CONTRAST = 4.5;                 // WCAG AA · docs/03 لا يحدّد رقماً مغايراً.
const TEXT_LAYER_TYPES = new Set([
  'headline', 'badge', 'source', 'attribution', 'kicker',
]);

const CONTENT_BY_TEMPLATE = {
  breaking:      { headline: 'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع', source: 'مصدر طبي — مراسلنا' },
  card_centered: { headline: 'مؤتمر السلام الدولي ينطلق غداً في بروكسل' },
  card_bottom:   { headline: 'مؤتمر السلام الدولي ينطلق غداً في بروكسل' },
  card_kicker:   { kicker: 'تقرير خاص', headline: 'قمة عربية طارئة' },
  reel:          { title: 'الحرب في غزة', location: 'غزة' },
  plain:         { headline: 'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع' },
};

// ── لونُ العنوان: يعتمدُ على قاعدةِ القالبِ ───────────────
// إن كان القالبُ يرسمُ على `colors.urgentBg` (solid fallback) ⇒
// `colors.urgentText` هو الذي يُرسَمُ به العنوانُ إن قُدِّم؛ وإلّا
// `colors.text`.
function templateSitsOnUrgentBg(tpl) {
  for (const L of tpl.layers) {
    if (L.type === 'image' && Array.isArray(L.fallback)) {
      for (const f of L.fallback) {
        if (f.type === 'solid' && f.fill === 'brand.colors.urgentBg') return true;
      }
    }
    if (L.type === 'solid' && L.fill === 'brand.colors.urgentBg') return true;
  }
  return false;
}
function headlineColorFor(brand, tpl) {
  if (templateSitsOnUrgentBg(tpl)) {
    return brand.colors.urgentText ?? brand.colors.text;
  }
  return brand.colors.text;
}

// ── الشريطُ الرأسيُّ للعنوانِ حسبَ القالب ─────────────────
// نُقرِّب من `verticalAnchor` أو `anchor` مع هامشٍ يشمل خطَّ العنوان.
function headlineBandY(tpl, H) {
  let anchor = 'middle';
  let vertRatio = 0.5;
  for (const L of tpl.layers) {
    if (L.type !== 'headline') continue;
    anchor = L.anchor ?? 'middle';
    if (anchor === 'centerLower' && typeof L.verticalAnchor === 'number') vertRatio = L.verticalAnchor;
    else if (anchor === 'top') vertRatio = 0.15;
    else if (anchor === 'middle') vertRatio = 0.5;
    else if (anchor === 'bottom') vertRatio = 0.85;
    else if (typeof L.verticalAnchor === 'number') vertRatio = L.verticalAnchor;
    break;
  }
  const cy = Math.round(H * vertRatio);
  // شريطٌ يشملُ ٣ أسطرَ عنوانٍ متوسطاً (~lineHeight*fontSize*3) — تقريبيّ:
  // ±0.15 من ارتفاعِ القماش يكفي (200px حول المركز).
  return { yMin: Math.max(0, cy - Math.round(H * 0.12)), yMax: Math.min(H, cy + Math.round(H * 0.12)) };
}

// ── تحميلُ الهويّات ────────────────────────────────────────
function loadBrands() {
  const brandsDir = join(ROOT, 'brands');
  const out = [{ name: 'default', raw: DEFAULT_BRAND }];
  if (existsSync(brandsDir)) {
    for (const f of readdirSync(brandsDir).sort()) {
      if (!f.endsWith('.json')) continue;
      const name = f.replace(/\.json$/, '');
      const raw = JSON.parse(readFileSync(join(brandsDir, f), 'utf8'));
      out.push({ name, raw });
    }
  }
  return out;
}

const IBM_PLEX_FALLBACK = [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
];
function registerFontFor(brand) {
  const w = brand.fonts.primary.weights;
  const paths = [w.light.url, w.regular.url, w.bold.url]
    .filter(Boolean)
    .map((u) => (isAbsolute(u) ? u : pathResolve(ROOT, u)));
  FontLibrary.use(brand.fonts.primary.family, paths.length ? paths : IBM_PLEX_FALLBACK);
}

// ── قالبٌ بلا طبقاتِ النصّ ─────────────────────────────
function stripTextLayers(tpl) {
  return {
    ...tpl,
    layers: tpl.layers.map((L) => {
      if (L.type === 'image' && Array.isArray(L.fallback)) {
        return { ...L, fallback: L.fallback.filter((f) => !TEXT_LAYER_TYPES.has(f.type)) };
      }
      return L;
    }).filter((L) => !TEXT_LAYER_TYPES.has(L.type)),
  };
}

// ── قياسُ اللون ────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance(r, g, b) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrast(L1, L2) {
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
}

// ── قياسُ (هويّة × قالب) ────────────────────────────────
async function measureCase(brandName, brand, tplId) {
  const tpl = TEMPLATES[tplId];
  if (!tpl) throw new Error(`قالب غير معروف: ${tplId}`);
  const content = CONTENT_BY_TEMPLATE[tplId] ?? {};

  // B: بلا طبقاتِ النص.
  const cB = new Canvas(SIZE.w, SIZE.h);
  renderFrame({
    ctx: cB.getContext('2d'),
    size: SIZE,
    template: stripTextLayers(tpl),
    brand,
    content,
  });
  const B = cB.getContext('2d').getImageData(0, 0, SIZE.w, SIZE.h).data;

  // شريطُ العنوان.
  const band = headlineBandY(tpl, SIZE.h);
  const bgRs = [], bgGs = [], bgBs = [];
  for (let y = band.yMin; y < band.yMax; y++) {
    for (let x = 0; x < SIZE.w; x++) {
      const o = (y * SIZE.w + x) * 4;
      bgRs.push(B[o]); bgGs.push(B[o + 1]); bgBs.push(B[o + 2]);
    }
  }
  const bR = median(bgRs), bG = median(bgGs), bB = median(bgBs);
  const Lb = relativeLuminance(bR, bG, bB);

  // لونُ العنوان.
  const textHex = headlineColorFor(brand, tpl);
  const t = hexToRgb(textHex);
  const Lt = relativeLuminance(t.r, t.g, t.b);
  const ratio = contrast(Lt, Lb);

  return {
    brandName, tplId,
    text: { hex: textHex, r: t.r, g: t.g, b: t.b, L: Lt },
    bg:   { r: bR, g: bG, b: bB, L: Lb },
    band,
    ratio,
    onUrgent: templateSitsOnUrgentBg(tpl),
  };
}

// ── main ───────────────────────────────────────────────
const brands = loadBrands();
const templateIds = Object.keys(TEMPLATES);
const failures = [];

console.log(`[verify-brand-contrast] ${brands.length} هويّة × ${templateIds.length} قالب · عتبة ${SAFE_CONTRAST}:1 (WCAG AA · نظريٌّ من الهويّة والخلفيّة المرسومة)`);

for (const { name, raw } of brands) {
  const brand = resolveBrand(raw);
  registerFontFor(brand);
  for (const tplId of templateIds) {
    const r = await measureCase(name, brand, tplId);
    const ok = r.ratio >= SAFE_CONTRAST;
    const flag = ok ? '✓' : '✗';
    const tag = r.onUrgent ? ' [urgent]' : '';
    console.log(
      `  ${flag} ${name.padEnd(16)} × ${tplId.padEnd(14)}${tag} — ` +
      `contrast=${r.ratio.toFixed(2)}:1 · text=${r.text.hex} L=${r.text.L.toFixed(3)} · ` +
      `bg=rgb(${r.bg.r},${r.bg.g},${r.bg.b}) L=${r.bg.L.toFixed(3)} · y=${r.band.yMin}-${r.band.yMax}`
    );
    if (!ok) failures.push(r);
  }
}

console.log('');
if (failures.length === 0) {
  console.log(`✓ verify-brand-contrast PASSED — كلّ الحالاتِ ≥ ${SAFE_CONTRAST}:1`);
  process.exit(0);
}
console.log(`✗ verify-brand-contrast FAILED — ${failures.length} حالة`);
for (const f of failures) {
  console.log(`  ✗ ${f.brandName} × ${f.tplId}: ${f.ratio.toFixed(2)}:1 (عتبة ${SAFE_CONTRAST}:1)`);
}
process.exit(1);
