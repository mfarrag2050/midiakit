#!/usr/bin/env node
// scripts/411c-prove-align-mirror.mjs — برهانٌ لفظيّ (لا رندر) على أنّ
// `maybeMirror` يعكس الآن `align` عند locale=latin، ولا يمسّه عند
// locale=ar. يُقاس على `default-brand` (RTL · placement.source.align='left').
//
// **المتوقّع:**
//   locale=ar    ⇒ source.align='left'  (بلا تغيير · RTL يخترق applyLocaleToBrand بلا مرور)
//   locale=latin ⇒ source.align='right' (منعكس عبر maybeMirror)
//
// إن كان الاثنان 'left' ⇒ الإصلاحُ لم يصل إلى موضعه · exit=1.
// إن كان 'ar' ⇒ 'right' ⇒ عكسٌ خاطئ أخطر · exit=1.

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { applyLocaleToBrand } from '@pf-mediakit/engine';

function resolve(brand) {
  return brand.placement?.source?.align ?? '(unset)';
}

// لا هويّةَ قائمةً اليوم بـmirrorOnLTR=true (المرآة نظريّة بانتظار
// أوّل هويّة LTR)، فنبني fixture اصطناعيّاً بحقنة صريحة — البرهانُ
// على المسار الشيفريّ لا على هويّةٍ محدّدة.
const raw = {
  ...DEFAULT_BRAND,
  placement: {
    ...DEFAULT_BRAND.placement,
    mirrorOnLTR: true,
  },
};

const arTransformed = applyLocaleToBrand(raw, 'ar');
const latinTransformed = applyLocaleToBrand(raw, 'en');  // en يمرّ عبر latin group

const alignRaw   = resolve(raw);
const alignAr    = resolve(arTransformed);
const alignLatin = resolve(latinTransformed);

console.log('[411c] برهانُ عكس align عند locale=latin:');
console.log(`  raw (DEFAULT_BRAND)                : source.align = ${alignRaw}`);
console.log(`  applyLocaleToBrand(brand, 'ar')    : source.align = ${alignAr}`);
console.log(`  applyLocaleToBrand(brand, 'en')    : source.align = ${alignLatin}`);

let ok = true;
if (alignAr !== alignRaw) {
  console.error(`  ✗ العربيّةُ تغيّرت (${alignRaw} → ${alignAr}) — التقاطُ RTL في applyLocaleToBrand مكسور.`);
  ok = false;
}
if (alignRaw === 'left' && alignLatin !== 'right') {
  console.error(`  ✗ اللاتينيّةُ لم تنعكس (${alignRaw} → ${alignLatin} · متوقّع 'right') — الإصلاحُ لم يصل إلى موضعه.`);
  ok = false;
}
if (alignRaw === 'right' && alignLatin !== 'left') {
  console.error(`  ✗ اللاتينيّةُ لم تنعكس (${alignRaw} → ${alignLatin} · متوقّع 'left').`);
  ok = false;
}

if (ok) {
  console.log(`  ✓ العربيّةُ ثابتة · اللاتينيّةُ منعكسة كما يقتضي «نهاية القراءة».`);
  process.exit(0);
}
process.exit(1);
