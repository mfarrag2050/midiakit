// _AMEND-300c · قياس نسبة الأحمر (URGENT) في لقطة مَرافئ الحاليّة
// لتحديد إن كان تعليق marafi.ts «محجوز لعاجل وحده» يصف الواقع.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { loadImage, Canvas } = await import('skia-canvas');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TARGET = { r: 0xB3, g: 0x26, b: 0x1E }; // URGENT
const TOL = 25;

const files = [
  'demo/marafi/ع1-shipping-feed.png',
  'demo/marafi/ع2-nimbus-bidi-feed.png',
  'demo/marafi/ع3-diacritics-short-feed.png',
];

for (const f of files) {
  const img = await loadImage(join(ROOT, f));
  const c = new Canvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let red = 0, total = 0, redInTop = 0, topEnd = Math.floor(img.height / 2);
  const bandY = new Set();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      total++;
      const dr = Math.abs(data[i] - TARGET.r);
      const dg = Math.abs(data[i+1] - TARGET.g);
      const db = Math.abs(data[i+2] - TARGET.b);
      if (dr < TOL && dg < TOL && db < TOL) {
        red++;
        if (y < topEnd) redInTop++;
        bandY.add(y);
      }
    }
  }
  const bandRange = bandY.size > 0
    ? `y=${Math.min(...bandY)}–${Math.max(...bandY)}`
    : 'لا أحمر';
  console.log(`${f.split('/').pop()} (${img.width}×${img.height}):`);
  console.log(`  URGENT (#B3261E ±${TOL}): ${red.toLocaleString()} px = ${(red/total*100).toFixed(2)}%`);
  console.log(`  في النصف العلويّ (y<${topEnd}): ${redInTop.toLocaleString()} px`);
  console.log(`  النطاق: ${bandRange}`);
  console.log('');
}
