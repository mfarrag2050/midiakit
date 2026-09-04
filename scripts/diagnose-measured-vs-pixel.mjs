// diagnose-measured-vs-pixel — يقارن `measuredLineHeight` بالبكسلات المرسومة.
//
// الفرضية: `measuredLineHeight` تستدعي `actualBoundingBoxAscent/Descent`
// المُبلَّغ من `measureText`. إن كان هذا الأخير يُخفي التشكيل (13px
// حسب diagnose-ascent.mjs)، فـmeasuredLineHeight أيضاً تُخفيه —
// وبالتالي أي حساب لتخطيط سطرين مشكَّلين قد يُنتج تصادماً.
//
// **آلية القياس البصري:**
//   1. ارسم النصّ على قماش أبيض بلون أسود بـfillText.
//   2. مسح كل صف من أعلى: أول صف بأيّ بكسل غير أبيض = ascent.
//   3. مسح من أسفل: آخر صف بأيّ بكسل غير أبيض = descent.
//   4. الفرق مع القيم المُبلَّغة = «الخفاء».

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

const SAMPLES = [
  { key: 'ar-plain',       text: 'وزير الخارجية التركي' },
  { key: 'ar-hamza',       text: 'أنبأ الأستاذ' },
  { key: 'ar-madda',       text: 'آية آدم آسيا' },
  { key: 'ar-fatha',       text: 'كَاتِبٌ مُجْتَهِدٌ' },
  { key: 'ar-full-tashkil',text: 'اَللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ' },
  { key: 'ar-tanwin-damm', text: 'كتابٌ جميلٌ مفيدٌ' },
  { key: 'en-plain',       text: 'Turkish Foreign Minister' },
  { key: 'en-accents',     text: 'café naïve résumé' },
];

const FS = 70;
const CANVAS_W = 800, CANVAS_H = 300;
const Y_BASELINE = 200; // ثابت — نقيس فوق وتحت منه

function pixelHeights(text, isArabic) {
  const c = new Canvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = isArabic ? 'rtl' : 'ltr';
  ctx.textAlign = isArabic ? 'right' : 'left';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, isArabic ? CANVAS_W - 40 : 40, Y_BASELINE);

  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  // أعلى صف بأيّ بكسل غير أبيض
  let top = -1;
  outer1: for (let row = 0; row < CANVAS_H; row++) {
    for (let col = 0; col < CANVAS_W; col++) {
      const idx = (row * CANVAS_W + col) * 4;
      if (img.data[idx] < 240 || img.data[idx + 1] < 240 || img.data[idx + 2] < 240) {
        top = row; break outer1;
      }
    }
  }
  // أدنى صف
  let bot = -1;
  outer2: for (let row = CANVAS_H - 1; row >= 0; row--) {
    for (let col = 0; col < CANVAS_W; col++) {
      const idx = (row * CANVAS_W + col) * 4;
      if (img.data[idx] < 240 || img.data[idx + 1] < 240 || img.data[idx + 2] < 240) {
        bot = row; break outer2;
      }
    }
  }
  return {
    pixelAscent: Y_BASELINE - top,
    pixelDescent: bot - Y_BASELINE,
    pixelHeight: bot - top + 1,
  };
}

function apiMeasurements(text) {
  const c = new Canvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  ctx.font = `700 ${FS}px "IBM Plex Sans Arabic", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  return {
    apiAscent: m.actualBoundingBoxAscent,
    apiDescent: m.actualBoundingBoxDescent,
    apiHeight: (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0),
  };
}

console.log('════ measureText مقابل البكسلات المرسومة ════');
console.log(`الخط: IBM Plex Sans Arabic Bold ${FS}px  ·  المحرك: skia-canvas`);
console.log('');
console.log(`${'sample'.padEnd(18)} │ ${'API asc'.padStart(7)} ${'PX asc'.padStart(6)} ${'Δ asc'.padStart(5)} │ ${'API dsc'.padStart(7)} ${'PX dsc'.padStart(6)} ${'Δ dsc'.padStart(5)} │ ${'API h'.padStart(5)} ${'PX h'.padStart(4)} ${'Δ h'.padStart(4)}`);
console.log('─'.repeat(90));
for (const { key, text } of SAMPLES) {
  const isAr = key.startsWith('ar');
  const { apiAscent, apiDescent, apiHeight } = apiMeasurements(text);
  const { pixelAscent, pixelDescent, pixelHeight } = pixelHeights(text, isAr);
  const dAsc = pixelAscent - apiAscent;
  const dDsc = pixelDescent - apiDescent;
  const dH = pixelHeight - apiHeight;
  console.log(
    `${key.padEnd(18)} │ ${String(apiAscent).padStart(7)} ${String(pixelAscent).padStart(6)} ${(dAsc >= 0 ? '+' : '') + dAsc}`.padEnd(48) +
    `│ ${String(apiDescent).padStart(7)} ${String(pixelDescent).padStart(6)} ${(dDsc >= 0 ? '+' : '') + dDsc}`.padEnd(30) +
    `│ ${String(apiHeight).padStart(5)} ${String(pixelHeight).padStart(4)} ${(dH >= 0 ? '+' : '') + dH}`
  );
}

console.log('\n════ الحكم ════');
console.log('- Δ موجب = البكسلات أعلى مما يُبلّغ API (خفاء)');
console.log('- Δ ≈ 0  = API صادق');
console.log('- Δ ≤ 5 مقبول عملياً (anti-aliasing subpixel)');
console.log('- Δ ≥ 10 = ثغرة تخطيطية محتملة');
