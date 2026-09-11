#!/usr/bin/env node
// generate-fixture-image — يولّد أصل PNG اختباريّ في fixtures/images/quad-test.png
// **يُشغَّل مرّة واحدة** — الناتج يُلتزم في المستودع.
//
// **المواصفات (تذكرة 61-GATE-2LAYER-GO §١):**
//  - غير متجانس (تدرّج + أربع مناطق ملوّنة)
//  - غير متناظر أفقيّاً ورأسيّاً (لون كل ربع مختلف)
//  - نسبة ≠ نسبة إطار المخرَج (800×1200 = 0.667 ≠ 1080/1350 = 0.8 ولا 1080/1080 = 1.0)
//
// **الاستعمال:** node scripts/generate-fixture-image.mjs
// يكتب fixtures/images/quad-test.png. لا تُغيَّر بعد الالتزام.

import { Canvas } from 'skia-canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'fixtures/images/quad-test.png');
mkdirSync(dirname(OUT), { recursive: true });

const W = 800;
const H = 1200; // نسبة 2:3 — تختلف عن 1:1 و 4:5 (إطارات المخرَج الشائعة)
const c = new Canvas(W, H);
const ctx = c.getContext('2d');

// أربع مناطق بألوان متمايزة (لكل ربع لون مختلف)
const QUAD = {
  TL: { r: 220, g: 40,  b: 60  },   // أحمر (top-left)
  TR: { r: 60,  g: 180, b: 80  },   // أخضر (top-right)
  BL: { r: 40,  g: 90,  b: 200 },   // أزرق (bottom-left)
  BR: { r: 230, g: 200, b: 50  },   // أصفر (bottom-right)
};

function fillRect(color, x, y, w, h) {
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  ctx.fillRect(x, y, w, h);
}

fillRect(QUAD.TL, 0,     0,     W / 2, H / 2);
fillRect(QUAD.TR, W / 2, 0,     W / 2, H / 2);
fillRect(QUAD.BL, 0,     H / 2, W / 2, H / 2);
fillRect(QUAD.BR, W / 2, H / 2, W / 2, H / 2);

// نقش تدرّج diagonal يجعل الحرف غير متجانس داخل كل ربع
const grad = ctx.createLinearGradient(0, 0, W, H);
grad.addColorStop(0, 'rgba(0,0,0,0.0)');
grad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
grad.addColorStop(1, 'rgba(0,0,0,0.3)');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// دائرة صغيرة على مركز اللوحة — علامة اتجاه (تُظهر الدوران/القلب)
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.beginPath();
ctx.arc(W / 2, H / 3, 40, 0, 2 * Math.PI);
ctx.fill();

const buf = await c.toBuffer('png');
writeFileSync(OUT, buf);

console.log(`▶ generate-fixture-image`);
console.log(`  ${OUT}`);
console.log(`  ${W}×${H} · ratio=${(W/H).toFixed(3)} · ${buf.length}b`);
console.log(`  quadrant colors:`);
for (const [k, v] of Object.entries(QUAD)) {
  console.log(`    ${k}: rgb(${v.r},${v.g},${v.b})`);
}
