#!/usr/bin/env node
// 610 §2 — شاهد عين لكلّ خطّ مدمج (الاثنان القديمان + الخمسة الجدد).
//
// يُنتج 7 ملفّات PNG بـ`breaking` 1080×1080 بنفس العنوان المستعمل في 610a،
// ثم `.md5` لكلّ ملفّ. يحفظ في:
//   /Users/mdervis/MediaKit/pf-mediakit/claude/reports/610-evidence/eye-<family-slug>.png
//
// **لا نسخ:** يستعمل `renderFrame` و`resolveBrand` من المحرّك،
// و`applyRuntimeFontIdentity` + `registerBuiltinFonts` من `apps/renderer`.
//
// **التشغيل:**
//   PATH=$HOME/.nvm/versions/node/v20.18.1/bin:$PATH \
//     node --import tsx scripts/610-eye-witness.mjs

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { Canvas } from 'skia-canvas';
import {
  DEFAULT_BRAND,
  BUILTIN_FONTS,
} from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import { renderFrame, resolveBrand } from '@pf-mediakit/engine';

import { applyRuntimeFontIdentity } from '../apps/renderer/src/lib/font-identity.ts';
import { registerBuiltinFonts } from '../apps/renderer/src/lib/builtin-font-registry.ts';

const OUT_DIR = '/Users/mdervis/MediaKit/pf-mediakit/claude/reports/610-evidence';
mkdirSync(OUT_DIR, { recursive: true });

// نفس العنوان والمحتوى المستعمل في 610a — ليبقى القياس قابلاً للمقارنة.
const HEADLINE =
  'ارتفاع عدد الضحايا جراء الاستهداف المتواصل لمنتظري المساعدات شمالي قطاع غزّة والسلطات تُعلن حالة الطوارئ القصوى';
const CONTENT = { headline: HEADLINE, source: 'مراسلنا' };
const SIZE = { w: 1080, h: 1080 };

function slug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function brandWithFont(bf) {
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

function render(bf) {
  const brand = applyRuntimeFontIdentity(resolveBrand(brandWithFont(bf)));
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  renderFrame({ ctx, size: SIZE, template: TEMPLATES.breaking, brand, content: CONTENT });
  const buf = canvas.toBufferSync('png');
  const hash = createHash('md5').update(buf).digest('hex');
  const name = `eye-${slug(bf.family)}`;
  const pngPath = `${OUT_DIR}/${name}.png`;
  const md5Path = `${OUT_DIR}/${name}.png.md5`;
  writeFileSync(pngPath, buf);
  writeFileSync(md5Path, hash + '\n');
  return { family: bf.family, hash, bytes: buf.length, path: pngPath };
}

// تسجيل · ثم رسم للجميع.
registerBuiltinFonts();

console.log(`[610 §2] رسم ${BUILTIN_FONTS.length} خطّاً على نفس عنوان 610a:`);
const results = BUILTIN_FONTS.map(render);

console.log('');
console.log('العائلة                         | md5                              | البايتات');
console.log('-------------------------------|----------------------------------|---------');
for (const r of results) {
  console.log(`${r.family.padEnd(31)}| ${r.hash} | ${String(r.bytes).padStart(7)}`);
}

// التحقّق من التميّز: كلّ خطَّين يجب أن يختلفا.
const hashes = results.map(r => r.hash);
const uniq = new Set(hashes);
console.log('');
if (uniq.size === hashes.length) {
  console.log(`✓ كلّ الـ${hashes.length} خطوط متمايزة بكسلياً.`);
} else {
  console.log(`✗ تطابقات: ${hashes.length - uniq.size} — افحص.`);
  const seen = new Map();
  for (const r of results) {
    if (seen.has(r.hash)) console.log(`  ${seen.get(r.hash)} == ${r.family}`);
    else seen.set(r.hash, r.family);
  }
  process.exit(1);
}
console.log(`المخرجات في ${OUT_DIR}/eye-*.png (+ .md5)`);
