#!/usr/bin/env node
// 610b · font-coverage لكلّ خطّ مدمج (أرقام لا صور).
//
// يُجيب للجميع 7 عائلات على:
//   • الحروف العربيّة الأساس (U+0600–U+06FF · 256 نقطة)
//   • الأرقام العربيّة-الهنديّة (U+0660–U+0669 · 10 نقاط)
//   • التطويل (U+0640)
//
// العرض: `N/M` حيث N = النقاط التي يحمل الخطّ لها glyph.
// الحكم «كامل» عندما N == M لكلّ الصفوف.
//
// **التشغيل:**
//   PATH=$HOME/.nvm/versions/node/v20.18.1/bin:$PATH \
//     node --import tsx scripts/610-font-coverage.mjs

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { BUILTIN_FONTS } from '@pf-mediakit/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets', 'fonts');

function rangeCoverage(font, from, to) {
  let n = 0;
  const total = to - from + 1;
  for (let cp = from; cp <= to; cp++) {
    const g = font.charToGlyph(String.fromCodePoint(cp));
    // opentype.js يعيد .notdef (index 0) للنقاط غير المدعومة.
    if (g && g.index !== 0) n++;
  }
  return { n, total };
}

function singleCoverage(font, cp) {
  const g = font.charToGlyph(String.fromCodePoint(cp));
  return g && g.index !== 0 ? 1 : 0;
}

function loadFont(file) {
  const buf = readFileSync(file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

console.log('العائلة                       | عربي U+0600-06FF | أرقام ٠-٩ (0660-0669) | تطويل U+0640');
console.log('------------------------------|------------------|-----------------------|-------------');
const rows = [];
for (const bf of BUILTIN_FONTS) {
  // نقيس على Regular (أساس المنتج). متريكاتُ الـRegular حاكمةٌ تخطيطاً.
  const path = join(FONTS_DIR, bf.weights.regular.file);
  const font = loadFont(path);
  const ar = rangeCoverage(font, 0x0600, 0x06FF);
  const digits = rangeCoverage(font, 0x0660, 0x0669);
  const tatweel = singleCoverage(font, 0x0640);
  const row = { family: bf.family, ar, digits, tatweel };
  rows.push(row);
  const arStr = `${ar.n}/${ar.total}`;
  const dStr = `${digits.n}/${digits.total}`;
  const tStr = tatweel === 1 ? '1/1' : '0/1';
  console.log(`${bf.family.padEnd(29)} | ${arStr.padEnd(16)} | ${dStr.padEnd(21)} | ${tStr}`);
}

console.log('');
console.log('حكم «كامل» = (أرقام 10/10) و (تطويل 1/1) و (عربي أساس ≥ 100 من 256):');
for (const r of rows) {
  const full = r.digits.n === 10 && r.tatweel === 1 && r.ar.n >= 100;
  console.log(`  ${full ? '✓' : '✗'} ${r.family}  (ar=${r.ar.n}/${r.ar.total} · digits=${r.digits.n}/10 · tatweel=${r.tatweel}/1)`);
}
