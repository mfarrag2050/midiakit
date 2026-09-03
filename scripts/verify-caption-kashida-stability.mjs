// verify-caption-kashida-stability.mjs — بوابة L-17 برمجية.
//
// **الفرضية:** بعد إصلاح prepareCaption + الكاش، مواضع الكلمات ونصوصها
// (بما فيها الكشيدة) ثابتة عبر كل الإطارات داخل نافذة المقطع. الرسم
// يغيّر لون/شفافية فقط، لا التخطيط.
//
// **الاختبار:** نستدعي prepareCaption ثلاث مرات بنفس segment + نفس ctx.
// النتيجة يجب أن تكون **مطابقة تماماً** — نفس النصوص (بكشيداتها)، نفس
// المواضع بالبكسل.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, prepareCaption } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const fixture = JSON.parse(
  await readFile(join(ROOT, 'fixtures/caption/breaking-news.json'), 'utf-8')
);
const segment = fixture.segments[0];
const brand = resolveBrand(DEFAULT_BRAND);
const SIZE = { w: 1080, h: 1350 };

function hashPrep(prep) {
  const wordsFingerprint = prep.words.map((w) => ({
    text: w.text,
    width: Math.round(w.width * 1000) / 1000, // 3 خانات بعد الفاصلة
    rightX: Math.round(w.rightX * 1000) / 1000,
    baselineY: Math.round(w.baselineY * 1000) / 1000,
    wordIdx: w.wordIdx,
    lineIdx: w.lineIdx,
  }));
  const s = JSON.stringify({
    fontSize: prep.fontSize,
    lineHeight: prep.lineHeight,
    nLines: prep.nLines,
    family: prep.family,
    words: wordsFingerprint,
  });
  return createHash('md5').update(s).digest('hex');
}

// نستدعي ثلاث مرات على canvas مختلفة (يحاكي إطارات مختلفة)
const hashes = [];
const preps = [];
for (let i = 0; i < 3; i++) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  // نضبط ctx.font لشيء عشوائي قبل الاستدعاء لضمان أن prepareCaption
  // يضبطه بنفسه (وإلا القياس ينحرف).
  ctx.font = `400 12px sans-serif`;
  const prep = prepareCaption(ctx, SIZE, brand, segment);
  preps.push(prep);
  hashes.push(hashPrep(prep));
}

console.log('════════ بوابة ثبات الكشيدة على caption ════════');
console.log(`المقطع: ${segment.text}`);
console.log(`عدد الاستدعاءات: 3 (على 3 canvases مختلفة)`);
console.log('');
hashes.forEach((h, i) => {
  console.log(`  استدعاء ${i + 1}: md5 = ${h}`);
});
const allMatch = hashes.every((h) => h === hashes[0]);
console.log('');
console.log(allMatch ? '✓ الثلاثة متطابقة — الكشيدة والمواضع ثابتة' : '✗ اختلاف — الكاش لم يحسم الثبات');

// طباعة تفصيلية للاستدعاء الأول
console.log('');
console.log('تفاصيل الاستدعاء الأول (words):');
for (const w of preps[0].words) {
  console.log(`  L${w.lineIdx} idx=${w.wordIdx}  text=${JSON.stringify(w.text)}  width=${w.width.toFixed(2)}  rightX=${w.rightX.toFixed(2)}`);
}

if (!allMatch) {
  // اعرض الاختلاف
  console.log('\nالفرق بين استدعاء 1 و 2:');
  for (let i = 0; i < preps[0].words.length; i++) {
    const a = preps[0].words[i];
    const b = preps[1].words[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.log(`  idx=${i}:`);
      console.log(`    1: ${JSON.stringify(a)}`);
      console.log(`    2: ${JSON.stringify(b)}`);
    }
  }
  process.exit(1);
}
