#!/usr/bin/env node
// scripts/measure-font-metrics — أداة سطر أوامر تقيس متريكات الخطّ
// من رأس الملفّ (font header) وتطبع { ascent, descent, unitsPerEm }.
//
// **الاستخدام:**
//   node scripts/measure-font-metrics.mjs assets/fonts/Almarai-Bold.ttf
//   node scripts/measure-font-metrics.mjs assets/fonts/IBMPlexSansArabic-Regular.ttf
//   node scripts/measure-font-metrics.mjs assets/fonts/*.ttf     # batch
//
// **العلّة (BASELINE-A · 2026-09-11):** المحرك (`measuredLineHeight`) كان
// يعتمد `ctx.measureText.actualBoundingBoxAscent/Descent` — Chrome يعيد
// em-box، skia يعيد glyph-bbox. الأرقام مختلفة على الطرفَين.
// الحلّ: **قياس مرّة عند إعداد الهويّة**، تخزين في `BrandKit.fonts.*.metrics`،
// المحرك يقرأها كأعداد لا يستدعي شيئاً.
//
// **قاعدة قصوى (docs/11 · check:engine-purity):**
//   opentype.js في `devDependencies` **للجذر وحده**. لا في packages/engine
//   ولا في packages/shared. المحرك نقيّ 100% — لا يقرأ ملفّ خطّ في
//   أيّ وقت من دورة حياته.
//
// **الحقول المطبوعة:**
//   ascent      = OS/2.sTypoAscender (المفضّل) أو hhea.ascender (احتياطي)
//   descent     = OS/2.sTypoDescender (موجب: مطلق القيمة)
//   unitsPerEm  = head.unitsPerEm — لتحويل إلى بكسل: ascent × fs / unitsPerEm
//
// **مصدر المفاضلة (OS/2 vs hhea):** OS/2 typo-metrics أنسق عبر المنصّات
// لأنّه معياريّ (`useTypoMetrics` bit); hhea قد يُخصَّص لأداة رسم بعينها.
// نأخذ OS/2 حين متاح، ونقع على hhea إن غاب (خطوط قديمة).
//
// **الخروج:** 0 نجاح · 1 خطأ في قراءة أيّ ملفّ.

import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import opentype from 'opentype.js';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('استعمال: node scripts/measure-font-metrics.mjs <path.ttf> [<path2.ttf> …]');
  process.exit(2);
}

const results = [];
let hadError = false;

for (const p of paths) {
  const abs = resolve(p);
  if (!existsSync(abs)) {
    console.error(`✗ غير موجود: ${p}`);
    hadError = true;
    continue;
  }
  try {
    const buf = readFileSync(abs);
    const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    // opentype.js يُظهر الحقول تحت font.tables.os2 و font.tables.hhea و font.tables.head
    const os2 = font.tables.os2;
    const hhea = font.tables.hhea;
    const head = font.tables.head;

    // typo metrics أفضل — إن غابت، نقع على hhea.
    let ascent, descent, source;
    if (os2 && typeof os2.sTypoAscender === 'number') {
      ascent = os2.sTypoAscender;
      descent = Math.abs(os2.sTypoDescender);
      source = 'OS/2 typo';
    } else if (hhea && typeof hhea.ascender === 'number') {
      ascent = hhea.ascender;
      descent = Math.abs(hhea.descender);
      source = 'hhea';
    } else {
      throw new Error('لا OS/2 typo ولا hhea في الخطّ');
    }

    const unitsPerEm = head.unitsPerEm;
    const familyName = font.names?.fontFamily?.en || font.names?.fullName?.en || basename(p);
    const subfamily = font.names?.fontSubfamily?.en || '';

    results.push({ path: p, familyName, subfamily, ascent, descent, unitsPerEm, source });
  } catch (err) {
    console.error(`✗ فشل قراءة ${p}: ${err.message}`);
    hadError = true;
  }
}

console.log('▶ measure-font-metrics');
console.log('');
for (const r of results) {
  console.log(`  ${r.path}`);
  console.log(`    family: ${r.familyName}${r.subfamily ? ' · ' + r.subfamily : ''}`);
  console.log(`    source: ${r.source}`);
  console.log(`    ascent:     ${r.ascent}`);
  console.log(`    descent:    ${r.descent}`);
  console.log(`    unitsPerEm: ${r.unitsPerEm}`);
  console.log(`    JSON:  "metrics": { "ascent": ${r.ascent}, "descent": ${r.descent}, "unitsPerEm": ${r.unitsPerEm} }`);
  console.log('');
}

if (hadError) process.exit(1);
process.exit(0);
