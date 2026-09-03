// verify-svg-gate.mjs — بوابة L-46 مزدوجة لطبقة SVG:
//
//   (أ) **وجود:** prepareSvg(fixture) يُنتج أكثر من 0 أشكال، وكل نوع
//       من الأنواع الأربعة الأساسية (path · rect · circle · line)
//       ممثَّل في الفيكستشر — تأكيد أن المحلّل يغطّي subset حقيقياً.
//   (ب) **ثبات:** رسم نفس PreparedSvg على نفس القماش N مرّة يُنتج
//       نفس md5 — الطبقة خالصة (بلا حالة عابرة).
//   (ج) **ربط الألوان:** رسم بهويّتين مختلفتين يُنتج md5 مختلفَين —
//       تأكيد أن `data-brand-*` يتفاعل مع الهوية.
//   (د) **الرفض العكسي:** SVG بلا `data-brand-*` (ألوان حرفية) يُنتج
//       نفس md5 عبر هويّتين — تأكيد أن الحرفي يحكم عند غياب data-brand.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, drawSvg, prepareSvg } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
]);

const SIZE = { w: 600, h: 600 };

function renderMd5(brand, prepared, bounds) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  drawSvg(ctx, SIZE, brand, { prepared, bounds, fit: 'contain' });
  const buf = canvas.toBufferSync('png');
  return createHash('md5').update(buf).digest('hex');
}

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

const svgSource = await readFile(join(ROOT, 'fixtures/svg/newsroom-mark.svg'), 'utf-8');
const prep = prepareSvg(svgSource);

// ── (أ) وجود ────────────────────────────────
console.log('════════ أ) وجود الأشكال بعد التحليل ════════');
const kinds = {};
for (const s of prep.shapes) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
console.log(`    viewBox: ${JSON.stringify(prep.viewBox)}`);
console.log(`    أشكال: ${prep.shapes.length} · تصنيف: ${JSON.stringify(kinds)}`);
assert(prep.shapes.length > 0, 'المحلّل أنتج شكلاً واحداً على الأقل', `${prep.shapes.length}`);
assert(kinds.path >= 1, 'path موجود (يختبر تفكيك A → C)', `${kinds.path || 0}`);
assert(kinds.rect >= 1, 'rect موجود', `${kinds.rect || 0}`);
assert(kinds.circle >= 1, 'circle موجود', `${kinds.circle || 0}`);
assert(kinds.line >= 1, 'line موجود', `${kinds.line || 0}`);

// ── (ب) ثبات — نفس المدخل، نفس المخرج ──────
console.log('\n════════ ب) ثبات الرسم عبر 5 استدعاءات ════════');
const brand = resolveBrand({
  ...DEFAULT_BRAND,
  colors: { ...DEFAULT_BRAND.colors, text: '#F8F4E9', accent: '#E8815A', surface: '#0B2340', urgentBg: '#B31E1E' },
});
const bounds = { x: 100, y: 100, w: 400, h: 400 };
const hashes = [];
for (let i = 0; i < 5; i++) hashes.push(renderMd5(brand, prep, bounds));
hashes.forEach((h, i) => console.log(`    استدعاء ${i + 1}: md5=${h}`));
assert(hashes.every((h) => h === hashes[0]), 'الرسم ثابت عبر الاستدعاءات', 'md5 موحّد');

// ── (ج) ربط الألوان — هويّتان مختلفتان → md5 مختلف ─
console.log('\n════════ ج) ربط الألوان (data-brand-*) ════════');
const brandB = resolveBrand({
  ...DEFAULT_BRAND,
  colors: { ...DEFAULT_BRAND.colors, text: '#1A1A1A', accent: '#F4A623', surface: '#FFFFFF', urgentBg: '#0F5D3F' },
});
const hashA = renderMd5(brand, prep, bounds);
const hashB = renderMd5(brandB, prep, bounds);
console.log(`    default md5:  ${hashA}`);
console.log(`    contrast md5: ${hashB}`);
assert(hashA !== hashB, 'اختلاف الهوية يغيّر المخرج (ربط data-brand يعمل)');

// ── (د) رفض عكسي — SVG بألوان حرفية لا يتأثّر بالهوية ─
console.log('\n════════ د) الحرفي يتفوّق على غياب data-brand ════════');
const svgLiteral = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="#FF00FF" stroke="#00FFFF" stroke-width="3"/>
  <rect x="20" y="20" width="60" height="60" fill="none" stroke="#FFFF00" stroke-width="2"/>
</svg>`;
const prepLit = prepareSvg(svgLiteral);
const hashALit = renderMd5(brand, prepLit, bounds);
const hashBLit = renderMd5(brandB, prepLit, bounds);
console.log(`    default   md5: ${hashALit}`);
console.log(`    contrast  md5: ${hashBLit}`);
assert(hashALit === hashBLit, 'SVG بألوان حرفية لا يتأثّر بالهوية (لا data-brand → لا ربط)');

console.log('');
if (failed === 0) console.log('════════ كل البوابات الأربع ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
