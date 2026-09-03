// diagnose-caption-modes.mjs — يستدعي prepareCaption لكل نمط ويطبع:
//   • هل الكاش يُصيب أم يُعاد الحساب
//   • نصّ الكلمة الأولى (كشيدة أم لا)
//   • مواضع كل الكلمات
//   • md5 لبصمة التخطيط
//
// **الغرض:** كشف إن كانت الأنماط تتشارك prep أم كل نمط يعيد الحساب،
// ومن ثمّ ما يفسّر اختفاء الكشيدة في بعض الأنماط.

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
const segments = fixture.segments;
const segment = segments[0];

function brandWith(mode) {
  return resolveBrand({
    ...DEFAULT_BRAND,
    colors: { ...DEFAULT_BRAND.colors, text: '#F8F4E9', accent: '#E8815A', surface: '#0B2340' },
    typography: {
      ...DEFAULT_BRAND.typography,
      caption: { ...DEFAULT_BRAND.typography.caption, highlightMode: mode },
    },
  });
}

const MODES = ['wordColor', 'wordBackground', 'progressiveReveal', 'wordScale', 'none'];
const SIZE = { w: 1080, h: 1350 };

function fingerprint(prep) {
  const s = JSON.stringify(prep.words.map((w) => ({
    text: w.text,
    rightX: Math.round(w.rightX * 100) / 100,
    width: Math.round(w.width * 100) / 100,
  })));
  return createHash('md5').update(s).digest('hex');
}

console.log('════════ تشخيص prepareCaption عبر الأنماط الخمسة ════════');
console.log(`المقطع: ${segment.text}`);
console.log(`segment reference identity: ثابت (fixture.segments[0])`);
console.log('');

// نستدعي بنفس canvas — أقرب لمحاكاة السكربت الحقيقي (يستعمل نفس canvas
// عبر كل الإطارات).
const sharedCanvas = new Canvas(SIZE.w, SIZE.h);
const sharedCtx = sharedCanvas.getContext('2d');

for (const mode of MODES) {
  const brand = brandWith(mode);
  const prep = prepareCaption(sharedCtx, SIZE, brand, segment);
  const fp = fingerprint(prep);
  const firstWord = prep.words[0];
  const firstLineWords = prep.words.filter((w) => w.lineIdx === 0).map((w) => w.text);
  console.log(`─── ${mode} ─────────────────────────────`);
  console.log(`  brand ref:      NEW (كل نمط brand مختلف)`);
  console.log(`  segment ref:    SAME (مشترك)`);
  console.log(`  fontSize:       ${prep.fontSize}`);
  console.log(`  first word:     ${JSON.stringify(firstWord.text)}  (kashida char count: ${(firstWord.text.match(/ـ/g) || []).length})`);
  console.log(`  first-line:     ${firstLineWords.map((t) => JSON.stringify(t)).join(' · ')}`);
  console.log(`  fingerprint:    ${fp}`);
  console.log('');
}

// اختبار مركّز: هل النمط الثاني يستقبل الـprep نفسها من الكاش؟
console.log('════════ اختبار الكاش المشترك (نفس segment ref) ════════');
const canvas1 = new Canvas(SIZE.w, SIZE.h);
const ctx1 = canvas1.getContext('2d');
const brand1 = brandWith('wordColor');
const prep1 = prepareCaption(ctx1, SIZE, brand1, segment);

const canvas2 = new Canvas(SIZE.w, SIZE.h);
const ctx2 = canvas2.getContext('2d');
const brand2 = brandWith('wordBackground');
const prep2 = prepareCaption(ctx2, SIZE, brand2, segment);

console.log(`  prep1 === prep2 (نفس الكائن؟): ${prep1 === prep2}`);
console.log(`  prep1.words[0].text: ${JSON.stringify(prep1.words[0].text)}`);
console.log(`  prep2.words[0].text: ${JSON.stringify(prep2.words[0].text)}`);
