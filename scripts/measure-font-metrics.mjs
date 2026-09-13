#!/usr/bin/env node
// scripts/measure-font-metrics — أداة سطر أوامر تقيس متريكات الخطّ.
//
// **مصدر المنطق الوحيد** الآن في `apps/api/src/services/font-metrics.ts`.
// هذا الملفّ CLI wrapper فقط — يقرأ الملفّ، يستدعي `extractFontMetrics`،
// يطبع الأعداد. **لا نسخ لمنطق قراءة opentype هنا.**
//
// **الاستخدام:**
//   node --import tsx scripts/measure-font-metrics.mjs assets/fonts/Almarai-Bold.ttf
//   node --import tsx scripts/measure-font-metrics.mjs assets/fonts/*.ttf
//
// **العلّة (BASELINE-A · 2026-09-11):** المحرك (`measuredLineHeight`) كان
// يعتمد `ctx.measureText.actualBoundingBoxAscent/Descent` — Chrome يعيد
// em-box، skia يعيد glyph-bbox. الأرقام مختلفة على الطرفَين.
// الحلّ: **قياس مرّة عند إعداد الهويّة**، تخزين في `BrandKit.fonts.*.metrics`،
// المحرك يقرأها كأعداد لا يستدعي شيئاً.
//
// **قاعدة معلَنة (docs/11 · check:engine-purity):**
//   opentype.js في `apps/api/dependencies` وحدها — لا في الجذر ولا
//   packages/engine ولا packages/shared. القياس يجري خارج مسار الرسم،
//   لا يعبر إلى المحرك إلّا أعداد (FontMetrics).
//
// **الحقول المطبوعة:**
//   ascent      = OS/2.sTypoAscender (المفضّل) أو hhea.ascender (احتياطي)
//   descent     = |OS/2.sTypoDescender| (موجب مطلق القيمة)
//   unitsPerEm  = head.unitsPerEm — للتحويل: pixelHeight = (asc+desc) × fs / unitsPerEm
//
// **الخروج:** 0 نجاح · 1 خطأ في قراءة أيّ ملفّ.
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// المصدر الوحيد للمنطق — apps/api/src/services/font-metrics.ts
const { extractFontMetrics } = await import(`${ROOT}/apps/api/src/services/font-metrics.ts`);

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('استعمال: node --import tsx scripts/measure-font-metrics.mjs <path.ttf> [<path2.ttf> …]');
  process.exit(2);
}

let hadError = false;
console.log('▶ measure-font-metrics\n');

for (const p of paths) {
  const abs = resolve(p);
  if (!existsSync(abs)) {
    console.error(`✗ غير موجود: ${p}\n`);
    hadError = true;
    continue;
  }
  const buf = readFileSync(abs);
  const m = extractFontMetrics(buf);
  if (!m) {
    console.error(`✗ فشل قياس ${p}: ملفّ تالف أو غير مدعوم (لا opentype يقرؤه · أو ينقصه OS/2 وhhea)\n`);
    hadError = true;
    continue;
  }
  console.log(`  ${p}`);
  console.log(`    source:     ${m.source}`);
  console.log(`    ascent:     ${m.ascent}`);
  console.log(`    descent:    ${m.descent}`);
  console.log(`    unitsPerEm: ${m.unitsPerEm}`);
  console.log(`    JSON:  "metrics": { "ascent": ${m.ascent}, "descent": ${m.descent}, "unitsPerEm": ${m.unitsPerEm} }`);
  console.log('');
}

if (hadError) process.exit(1);
process.exit(0);
