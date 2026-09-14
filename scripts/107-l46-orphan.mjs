// 107 · L-46 على حالة orphan-prep بعينها.
//
// الحالة: «دراسة أميركية: الذكاء الاصطناعي يقضي على قدرتنا على التعبير الشخصي»
// (من عيّنة 107 · aawsat.xml).
// المتوقّع قبل الإصلاح (الطور الثالث معطَّل): آخر كلمة في سطر = «على» (يتيم).
// المتوقّع بعد الإصلاح (الطور الثالث مخفَّف يُبقي orphan-prep): «على» ليست آخر كلمة.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  parseTokens,
  wrapOptimal,
  computeBreakPenalties,
  loadDefaultLexicon,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const { Canvas, FontLibrary } = await import('skia-canvas');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Light.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  join(ROOT, 'assets/fonts/IBMPlexSansArabic-Bold.ttf'),
]);

const brand = resolveBrand(DEFAULT_BRAND);
const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
const canvas = new Canvas(1080, 1350);
const ctx = canvas.getContext('2d');

const measurer = {
  word: (t, fs, bold) => {
    ctx.font = `${bold ? '700' : '400'} ${fs}px ${family}`;
    return ctx.measureText(t.text).width;
  },
  space: (fs) => {
    ctx.font = `400 ${fs}px ${family}`;
    return ctx.measureText(' ').width;
  },
  line: (toks, fs, bold) => {
    ctx.font = `${bold ? '700' : '400'} ${fs}px ${family}`;
    const sp = ctx.measureText(' ').width;
    let w = 0;
    for (let i = 0; i < toks.length; i++) {
      w += ctx.measureText(toks[i].text).width;
      if (i < toks.length - 1) w += sp;
    }
    return w;
  },
};

const HEADLINE = 'دراسة أميركية: الذكاء الاصطناعي يقضي على قدرتنا على التعبير الشخصي';
const BOX_W = 950;
const PREPS = new Set(['في', 'من', 'إلى', 'على', 'عن', 'ب', 'ل', 'مع', 'بين', 'حول', 'قبل', 'بعد']);

const lexicon = loadDefaultLexicon();
const tokens = parseTokens(HEADLINE);
const breakPenalties = computeBreakPenalties(tokens, lexicon);

// نفس المسار الإنتاجيّ · preferLargestFs=true
const wrap = wrapOptimal(
  tokens, BOX_W, 80, 40, false, 3, 0.85, 1.35, measurer, 'uniform',
  { breakPenalties, preferLargestFs: true },
);

const lines = wrap.lines.map((l) => l.map((t) => t.text).join(' '));
console.log('العنوان: ' + HEADLINE);
console.log('اللفّ:');
lines.forEach((l, i) => console.log(`  السطر ${i + 1}: ${l}`));

// افحص كل نهاية سطر (ما عدا الأخير)
let orphanPrep = null;
for (let i = 0; i < wrap.lines.length - 1; i++) {
  const line = wrap.lines[i];
  const last = line[line.length - 1]?.text ?? '';
  if (PREPS.has(last)) {
    orphanPrep = { line: i + 1, word: last };
    break;
  }
}

if (orphanPrep) {
  console.log(`\n✗ FAIL · orphan-prep: «${orphanPrep.word}» يتيم في نهاية السطر ${orphanPrep.line}`);
  process.exit(1);
}
console.log('\n✓ PASS · لا حرف جرّ يتيم في نهايات الأسطر');
process.exit(0);
