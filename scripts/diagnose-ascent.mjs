// diagnose-ascent — يقيس actualBoundingBoxAscent للغات الثلاث بنفس الخط والحجم.
// الهدف: تحديد ما إن كان القصّ العلوي في demo/multilang-demo.png ناتجاً عن:
//   (أ) نص عربي يقيس أكبر من اللاتيني (قياس مختلف)
//   (ب) نفس القياس لكن رسمُنا يُهمل الصاعد (خلل موضع البداية)
//   (ج) خلل في حساب ارتفاع الكتلة إجمالياً

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

const SAMPLES = {
  ar: 'وزير الخارجية التركي',       // فيها همزة + مدّة محتملة + صاعد
  en: 'Turkish Foreign Minister',   // أحرف كبيرة (صواعد قياسية)
  tr: 'Türk Dışişleri Bakanı',     // تركية بحركات diacritics
  arSimple: 'التركي',                // كلمة بلا هذيَّات لمقارنة
  arWithHamza: 'أنبأ',              // همزة + ألف بمدّة
  arWithFatha: 'كَاتِبٌ',            // مشكَّل
};

const canvas = new Canvas(1000, 200);
const ctx = canvas.getContext('2d');

console.log('════ قياس actualBoundingBoxAscent (بنفس الخط + الحجم) ════');
console.log('الخط: IBM Plex Sans Arabic Bold · fs=70px\n');
ctx.font = '700 70px "IBM Plex Sans Arabic", sans-serif';
ctx.textBaseline = 'alphabetic';

for (const [key, text] of Object.entries(SAMPLES)) {
  const m = ctx.measureText(text);
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  const totalH = ascent + descent;
  const w = m.width;
  console.log(
    `  ${key.padEnd(12)} «${text.padEnd(28)}» → ascent=${ascent.toFixed(1)}  descent=${descent.toFixed(1)}  totalH=${totalH.toFixed(1)}  width=${w.toFixed(0)}`
  );
}

console.log('\n════ الفرضية ════');
console.log('في الكود الحالي: y = 120 ثم fillText(text, x, y).');
console.log('textBaseline = alphabetic ⇒ الرسم يبدأ من خط الأساس y=120،');
console.log('والصاعد يمتدّ إلى y - ascent = 120 - ascent.');
console.log('إن كان ascent العربي > ascent اللاتيني، ولم يُعوَّض الفرق،');
console.log('العربي «يصعد» أعلى ⇒ يقصّ عند حافة الصندوق (y < 0 أو ≤ حافة).');

console.log('\n════ اختبار الرسم الفعلي على قماش صغير ════');
// نرسم كل عيّنة على قماش خاصّ لنرى موضع الصاعد الفعلي
for (const [key, text] of Object.entries(SAMPLES)) {
  const c = new Canvas(500, 100);
  const cc = c.getContext('2d');
  cc.fillStyle = '#FFFFFF';
  cc.fillRect(0, 0, 500, 100);
  cc.font = '700 70px "IBM Plex Sans Arabic", sans-serif';
  cc.textBaseline = 'alphabetic';
  cc.direction = key.startsWith('ar') ? 'rtl' : 'ltr';
  cc.textAlign = key.startsWith('ar') ? 'right' : 'left';
  cc.fillStyle = '#000000';
  const y = 80;  // نفس y = 120 - 40 offset تجريبي
  cc.fillText(text, key.startsWith('ar') ? 480 : 20, y);

  // مسح أعمدة القماش لإيجاد أعلى صف يحوي بكسل غير أبيض
  const img = cc.getImageData(0, 0, 500, 100);
  let topRow = -1;
  outer: for (let row = 0; row < 100; row++) {
    for (let col = 0; col < 500; col++) {
      const idx = (row * 500 + col) * 4;
      const r = img.data[idx], g = img.data[idx + 1], b = img.data[idx + 2];
      if (r < 240 || g < 240 || b < 240) { topRow = row; break outer; }
    }
  }
  console.log(`  ${key.padEnd(12)} y-baseline=${y}  أعلى بكسل غير أبيض عند row=${topRow}  ⇒ باعد فوق baseline = ${y - topRow}`);
}
