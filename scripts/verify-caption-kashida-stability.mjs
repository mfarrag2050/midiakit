// verify-caption-kashida-stability.mjs — بوابة أربعة اختبارات (L-46).
//
// **الدرس L-46:** اختبار الثبات لا يكشف الغياب. لكل ميزة اختباران:
//   • **وجود** (هل تعمل أصلاً؟)
//   • **ثبات** (هل تتغيّر عبر الإطارات/الأنماط؟)
// الثاني بلا الأول يحرس فراغاً.
//
// **الاختبارات الأربعة:**
//   أ) الأنماط الخمسة تتشارك نفس التخطيط (md5 موحّد)
//   ب) الإطارات المختلفة من نفس السطر — الكشيدة ثابتة
//   ج) وجود محارف U+0640 (TATWEEL) في مخرج prep — لا فراغ ثابت
//   د) مقارنة بصرية: بكشيدة (inherit) مقابل بدونها (none)

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand, prepareCaption, drawCaption } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const fixture = JSON.parse(
  await readFile(join(ROOT, 'fixtures/caption/breaking-news.json'), 'utf-8')
);
const segment = fixture.segments[0];
const SIZE = { w: 1080, h: 1350 };
const TATWEEL = 'ـ';

function baseBrand(overrideCaption = {}) {
  return resolveBrand({
    ...DEFAULT_BRAND,
    colors: { ...DEFAULT_BRAND.colors, text: '#F8F4E9', accent: '#E8815A', surface: '#0B2340' },
    typography: {
      ...DEFAULT_BRAND.typography,
      caption: { ...DEFAULT_BRAND.typography.caption, ...overrideCaption },
    },
  });
}

function hashPrep(prep) {
  const s = JSON.stringify(prep.words.map((w) => ({
    text: w.text,
    width: Math.round(w.width * 1000) / 1000,
    rightX: Math.round(w.rightX * 1000) / 1000,
    baselineY: Math.round(w.baselineY * 1000) / 1000,
    wordIdx: w.wordIdx,
    lineIdx: w.lineIdx,
  })));
  return createHash('md5').update(s).digest('hex');
}

function countTatweel(prep) {
  return prep.words.reduce(
    (sum, w) => sum + (w.text.match(/ـ/g) || []).length,
    0
  );
}

function newCanvasCtx() {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  ctx.font = '400 12px sans-serif'; // ضبط عشوائي لتفادي حالة مصنّفة
  return { canvas, ctx };
}

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

// ── (أ) الأنماط الخمسة تتشارك نفس التخطيط ──────────────
console.log('════════ أ) عبر الأنماط الخمسة ════════');
const MODES = ['wordColor', 'wordBackground', 'progressiveReveal', 'wordScale', 'none'];
const modePreps = MODES.map((m) => {
  const { ctx } = newCanvasCtx();
  return { mode: m, prep: prepareCaption(ctx, SIZE, baseBrand({ highlightMode: m }), segment) };
});
const modeHashes = modePreps.map(({ mode, prep }) => ({ mode, h: hashPrep(prep) }));
modeHashes.forEach(({ mode, h }) => console.log(`    ${mode.padEnd(20)} md5=${h}`));
assert(
  modeHashes.every((m) => m.h === modeHashes[0].h),
  'md5 موحّد عبر الأنماط الخمسة'
);

// ── (ب) عبر إطارات مختلفة من نفس السطر ─────────────────
// نستعمل نفس segment على 3 canvases مختلفة (يحاكي 3 إطارات).
console.log('\n════════ ب) عبر الإطارات (3 canvases مختلفة) ════════');
const frameHashes = [];
for (let i = 0; i < 3; i++) {
  const { ctx } = newCanvasCtx();
  const prep = prepareCaption(ctx, SIZE, baseBrand(), segment);
  frameHashes.push(hashPrep(prep));
  console.log(`    إطار ${i + 1}: md5=${frameHashes[i]}`);
}
assert(
  frameHashes.every((h) => h === frameHashes[0]),
  'الكشيدة ثابتة عبر إطارات مختلفة'
);

// ── (ج) وجود محارف U+0640 — لا فراغ ثابت ───────────────
console.log('\n════════ ج) وجود محارف كشيدة U+0640 ════════');
{
  const { ctx } = newCanvasCtx();
  const prepInherit = prepareCaption(ctx, SIZE, baseBrand({ justify: 'inherit' }), segment);
  const tatweelCount = countTatweel(prepInherit);
  console.log(`    prep.justify='inherit' — عدد محارف \\u0640: ${tatweelCount}`);
  prepInherit.words.forEach((w) => {
    const kc = (w.text.match(/ـ/g) || []).length;
    if (kc > 0) console.log(`      idx=${w.wordIdx} ${JSON.stringify(w.text)}  (${kc} تطويل)`);
  });
  assert(tatweelCount > 0, 'الكشيدة مطبَّقة فعلاً (لا فراغ ثابت)', `${tatweelCount} حرف U+0640`);
}

// ── التحقّق العكسي: justify='none' يجب أن يزيل الكشيدة ──
console.log('\n════════ ج-عكسي) justify=\'none\' يُزيل الكشيدة ════════');
{
  // ملاحظة: WeakMap cache يحتفظ بـprep بحسب segment، لكن اختلاف الهوية
  // في التبرير لا يُبطل الكاش الحالي. نستعمل segment ref جديد لتفادي الكاش.
  const segFresh = { ...segment, words: segment.words.slice() };
  const { ctx } = newCanvasCtx();
  const prepNone = prepareCaption(ctx, SIZE, baseBrand({ justify: 'none' }), segFresh);
  const tatweelCount = countTatweel(prepNone);
  console.log(`    prep.justify='none' — عدد محارف \\u0640: ${tatweelCount}`);
  assert(tatweelCount === 0, 'justify=\'none\' يُخرج نصّاً بلا كشيدة', `${tatweelCount} حرف`);
}

// ── (د) مقارنة بصرية: بكشيدة vs بدونها ──────────────────
console.log('\n════════ د) مقارنة بصرية ════════');
const COMP_W = SIZE.w * 2 + 40;
const COMP_H = 500 + 60;
const comp = new Canvas(COMP_W, COMP_H);
const cctx = comp.getContext('2d');
cctx.fillStyle = '#0F1218';
cctx.fillRect(0, 0, COMP_W, COMP_H);

// عنوان
cctx.fillStyle = '#F8F4E9';
cctx.font = '700 28px "IBM Plex Sans Arabic", sans-serif';
cctx.textAlign = 'center';
cctx.textBaseline = 'top';
cctx.direction = 'rtl';
cctx.fillText('مقارنة الكشيدة على الترجمة — justify=inherit مقابل justify=none', COMP_W / 2, 16);

function renderCaptionFrame(offX, brandOverride, label) {
  const brand = baseBrand(brandOverride);
  // segment جديد المرجع لتفادي كاش
  const seg = { ...segment, words: segment.words.slice() };
  // canvas فرعي بحجم عرض القماش الأصلي
  const frame = new Canvas(SIZE.w, SIZE.h);
  const fctx = frame.getContext('2d');
  fctx.fillStyle = brand.colors.surface;
  fctx.fillRect(0, 0, SIZE.w, SIZE.h);
  drawCaption(fctx, SIZE, brand, { segments: [seg], t: 3.0 });
  // ننسخ منطقة الترجمة فقط (السفلى) إلى canvas المقارنة
  cctx.drawImage(frame, 0, 900, SIZE.w, 500, offX, 60, SIZE.w, 500);
  cctx.strokeStyle = 'rgba(255,255,255,0.2)';
  cctx.strokeRect(offX, 60, SIZE.w, 500);
  cctx.fillStyle = 'rgba(248,244,233,0.85)';
  cctx.font = '600 20px "IBM Plex Sans Arabic", sans-serif';
  cctx.textAlign = 'left';
  cctx.textBaseline = 'top';
  cctx.direction = 'ltr';
  cctx.fillText(label, offX + 14, 66);
}

renderCaptionFrame(0, { justify: 'inherit' }, 'justify = inherit  (كشيدة مطبَّقة)');
renderCaptionFrame(SIZE.w + 40, { justify: 'none' }, 'justify = none  (بلا كشيدة)');

const OUT_COMPARISON = join(OUT_DIR, 'caption-kashida-comparison.png');
await writeFile(OUT_COMPARISON, comp.toBufferSync('png'));
console.log(`    ✓ ${OUT_COMPARISON} (${COMP_W}×${COMP_H})`);

console.log('');
console.log(failed === 0
  ? '════════ كل البوابات الأربع ✓ ════════'
  : `════════ ${failed} إخفاق ✗ ════════`);
if (failed > 0) process.exit(1);
