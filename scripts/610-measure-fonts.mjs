#!/usr/bin/env node
// scripts/610-measure-fonts — قياس عطب الخطوط المدمَجة قبل الإصلاح وبعده.
//
// **ما يقيسه (610a §2 و §4):**
//   «قبل» — بلا `registerBuiltinFonts()`: `renderFrame` يرسم ببطاقة
//     breaking لـIBM Plex ثمّ لـAlmarai. ما دام `FontLibrary` لا يعرف
//     `mk-builtin-<slug>`، skia-canvas يسقط إلى خطّ النظام للاثنتَين،
//     فالملفَّان **متطابقان بكسلياً**. تطابقٌ = شهادة العطب.
//
//   «بعد» — بعد `registerBuiltinFonts()`: نفس البطاقتَين. الآن
//     `FontLibrary` يعرف الاسمَين بملفّاتهما ⇒ المَلفَّان **يختلفان**
//     عن بعضهما (الخطَّان مختلفان) **وعن قبل** (العناصر الطباعيّة
//     تحوّلت من خطّ النظام إلى الخطّ المُعلَن).
//
// **لا نسخ لمنطق الرندر:**
//   - `applyRuntimeFontIdentity` من `apps/renderer/src/lib/font-identity.ts`
//     — نفس الدالّة التي يستدعيها `processApiJob`.
//   - `registerBuiltinFonts` من `apps/renderer/src/lib/builtin-font-registry.ts`
//     — نفس الوحدة التي يستوردها `api-worker.ts` ويستدعيها عند الإقلاع.
//   - `renderFrame` من `@pf-mediakit/engine` — المحرّك الذي يستدعيه
//     `processApiJob` لتصدير PNG.
//
// **لِمَ لم نستورد `api-worker.ts` نفسه؟** يحمل أثراً جانبيّاً عند
// التحميل (`registerBuiltinFonts()` ثمّ تهيئة Pool/S3). استيراده يُسقِط
// شهادة «قبل» (التسجيل يحدث قبل أن نقيس). استيراد الوحدات السفليّة
// بشكلٍ منفصل يُبقي الدوالّ الحقيقيّة · ويحكم إيقاعَ التسجيل.
//
// **التشغيل:**
//   PATH=$HOME/.nvm/versions/node/v20.18.1/bin:$PATH \
//     node --import tsx scripts/610-measure-fonts.mjs
//
// **المخرج:** `claude/reports/610-evidence/{before,after}-{ibmplex,almarai}.png`
// (داخل /Users/mdervis/MediaKit/pf-mediakit/claude/reports/).

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas } from 'skia-canvas';
import {
  DEFAULT_BRAND,
  BUILTIN_FONTS,
} from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { renderFrame, resolveBrand } from '@pf-mediakit/engine';

import { applyRuntimeFontIdentity } from '../apps/renderer/src/lib/font-identity.ts';
import {
  registerBuiltinFonts,
  _resetBuiltinFontRegistry,
  listRegisteredBuiltinFonts,
} from '../apps/renderer/src/lib/builtin-font-registry.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');
// 610a — المخرجات في شجرة الـowner (claude/reports/).
const OUT_DIR = '/Users/mdervis/MediaKit/pf-mediakit/claude/reports/610-evidence';

mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────
// بناء brand snapshot بخطّ معيَّن من BUILTIN_FONTS.
// (لا نُعدّل DEFAULT_BRAND الأصليّ · deep-clone للحقول المَلموسة.)
// ─────────────────────────────────────────────────────────
function brandWithBuiltinFont(familyName) {
  const bf = BUILTIN_FONTS.find((f) => f.family === familyName);
  if (!bf) throw new Error(`BUILTIN_FONT_NOT_FOUND: ${familyName}`);
  return {
    ...DEFAULT_BRAND,
    fonts: {
      ...DEFAULT_BRAND.fonts,
      primary: {
        ...DEFAULT_BRAND.fonts.primary,
        family: bf.family,
        source: 'builtin',
        licenseAck: true,
        weights: {
          light:   { url: '', value: bf.weights.light.value,   metrics: bf.weights.light.metrics },
          regular: { url: '', value: bf.weights.regular.value, metrics: bf.weights.regular.metrics },
          bold:    { url: '', value: bf.weights.bold.value,    metrics: bf.weights.bold.metrics },
        },
      },
    },
  };
}

// عنوانٌ طويلٌ (أربعة أسطر، يستدعي الكشيدة في breaking · 1080×1080).
const HEADLINE =
  'ارتفاع عدد الضحايا جراء الاستهداف المتواصل لمنتظري المساعدات شمالي قطاع غزّة والسلطات تُعلن حالة الطوارئ القصوى';
const CONTENT = { headline: HEADLINE, source: 'مراسلنا' };
const SIZE = { w: 1080, h: 1080 };

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

function renderOne(brandRaw, label) {
  const brand = applyRuntimeFontIdentity(resolveBrand(brandRaw));
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  renderFrame({ ctx, size: SIZE, template: TEMPLATES.breaking, brand, content: CONTENT });
  const buf = canvas.toBufferSync('png');
  const hash = md5(buf);
  const path = `${OUT_DIR}/${label}.png`;
  writeFileSync(path, buf);
  return { path, hash, bytes: buf.length, runtimeFamily: brand.fonts.primary.family };
}

// ─────────────────────────────────────────────────────────
// Phase A — قبل الإصلاح: FontLibrary لا يعرف mk-builtin-*.
// ─────────────────────────────────────────────────────────
_resetBuiltinFontRegistry();
// نتعمّد **عدم** استدعاء registerBuiltinFonts — هذه حالة الكود السابق للإصلاح.
console.log('[610a] Phase A (قبل): FontLibrary.families لا يحمل mk-builtin-*');
console.log('       registered-set =', listRegisteredBuiltinFonts().join(',') || '(فارغ)');

const beforeIbm     = renderOne(brandWithBuiltinFont('IBM Plex Sans Arabic'), 'before-ibmplex');
const beforeAlmarai = renderOne(brandWithBuiltinFont('Almarai'),              'before-almarai');

console.log('[610a] before-ibmplex  :', beforeIbm.hash,     `· ${beforeIbm.bytes}B · runtime=${beforeIbm.runtimeFamily}`);
console.log('[610a] before-almarai  :', beforeAlmarai.hash, `· ${beforeAlmarai.bytes}B · runtime=${beforeAlmarai.runtimeFamily}`);

const beforeIdentical = beforeIbm.hash === beforeAlmarai.hash;
console.log(`[610a] قبل: متطابقان بكسلياً؟ ${beforeIdentical ? '✅ نعم (شهادة العطب)' : '❌ لا — فحصٌ أعمق مطلوب'}`);

// ─────────────────────────────────────────────────────────
// Phase B — بعد الإصلاح: FontLibrary يعرف كلّ mk-builtin-*.
// ─────────────────────────────────────────────────────────
console.log('');
console.log('[610a] Phase B (بعد): registerBuiltinFonts()');
const registrations = registerBuiltinFonts();
console.log('       سجّلنا:', registrations.map(r => `${r.family} ⇒ ${r.runtime}`).join(' · '));

const afterIbm     = renderOne(brandWithBuiltinFont('IBM Plex Sans Arabic'), 'after-ibmplex');
const afterAlmarai = renderOne(brandWithBuiltinFont('Almarai'),              'after-almarai');

console.log('[610a] after-ibmplex   :', afterIbm.hash,     `· ${afterIbm.bytes}B`);
console.log('[610a] after-almarai   :', afterAlmarai.hash, `· ${afterAlmarai.bytes}B`);

// ─────────────────────────────────────────────────────────
// الحكم
// ─────────────────────────────────────────────────────────
console.log('');
console.log('════════ الحكم ════════');
const checks = [
  { name: 'قبل: ibmplex == almarai (تطابق = عطب)', pass: beforeIbm.hash === beforeAlmarai.hash },
  { name: 'بعد: ibmplex != almarai (خطّان مختلفان)',   pass: afterIbm.hash !== afterAlmarai.hash },
  { name: 'بعد ≠ قبل (ibmplex)',                      pass: afterIbm.hash !== beforeIbm.hash },
  { name: 'بعد ≠ قبل (almarai)',                      pass: afterAlmarai.hash !== beforeAlmarai.hash },
];
let allPass = true;
for (const c of checks) {
  const mark = c.pass ? '✓' : '✗';
  console.log(`  ${mark} ${c.name}`);
  if (!c.pass) allPass = false;
}
console.log('');
console.log(allPass ? '✅ القياس يُثبت العطبَ قبلَ الإصلاح والإصلاحَ بعده.' : '❌ القياس لا يؤكّد الفرضيّة — راجع.');
console.log('');
console.log('المخرجات:');
console.log(`  ${beforeIbm.path}`);
console.log(`  ${beforeAlmarai.path}`);
console.log(`  ${afterIbm.path}`);
console.log(`  ${afterAlmarai.path}`);

process.exit(allPass ? 0 : 1);
