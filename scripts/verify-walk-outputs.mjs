#!/usr/bin/env node
// verify-walk-outputs — يفحص مخرجات `walk-400` (أزواج before/after) قبل
// نشرها دليلاً بصريّاً على تغييرٍ في الواجهة.
//
// **٤٤٠ §١ · L-137:** «صورةُ بابٍ مغلقٍ ليست دليلاً على ما خلفه». هذا
// السكربت يرصد الحالتَين اللتَين تكذبان بحسن نيّة:
//   ١) نسختان مطابقتان بالبايت داخل نفس المشي (نفس المشهد التقطته
//      عمليّتُنا مرّتَين — غالباً حالةُ فشلٍ أو rate-limit collapse).
//   ٢) نفس PNG بين `before/` و`after/` لصفحةٍ نتوقّع تغيّرَها.
//
// الاستعمال:
//   node scripts/verify-walk-outputs.mjs <root-dir> [--strict]
//   حيث `root-dir` يحوي `before/*.png` و`after/*.png`.
//
// الخروج:
//   0 — لا تصادمَ (أو `--strict` غير مُفعَّل والتصادمات مذكورةٌ فقط)
//   1 — تصادمات وُجدت مع `--strict`

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = args.find((a) => !a.startsWith('--'));

if (!root) {
  console.error('استعمال: node scripts/verify-walk-outputs.mjs <root> [--strict]');
  process.exit(2);
}

const rootAbs = resolve(root);
const dirs = ['before', 'after'];
const perFile = {};
const md5Groups = {};

for (const d of dirs) {
  const dp = join(rootAbs, d);
  let entries;
  try {
    entries = readdirSync(dp);
  } catch {
    console.error(`لا مجلَّد: ${dp}`);
    process.exit(2);
  }
  for (const f of entries) {
    if (!f.endsWith('.png')) continue;
    const p = join(dp, f);
    const buf = readFileSync(p);
    const h = createHash('md5').update(buf).digest('hex');
    const sz = statSync(p).size;
    perFile[`${d}/${f}`] = { size: sz, md5: h };
    (md5Groups[h] ??= []).push(`${d}/${f}`);
  }
}

const collisions = Object.entries(md5Groups).filter(
  ([, files]) => files.length > 1
);

console.log(`▶ verify-walk-outputs · ${rootAbs}`);
console.log(`  ملفّات: ${Object.keys(perFile).length}`);
console.log(`  مجموعات md5 فريدة: ${Object.keys(md5Groups).length}`);
console.log(`  تصادمات: ${collisions.length}`);

if (collisions.length > 0) {
  console.log('\n  التصادمات:');
  for (const [h, files] of collisions) {
    console.log(`    ${h.slice(0, 8)} · ${files.length}× · ${files.join(' · ')}`);
  }
  console.log(
    '\n  «صورةُ بابٍ مغلقٍ ليست دليلاً» (L-137): كلُّ صورةٍ في تصادمٍ '
    + 'إمّا تكرارٌ متعمَّد (شاشة لا تتأثّر بالتغيير) أو انهيارٌ صامتٌ '
    + '(rate-limit · loading state · error page). راجع لكلٍّ منها:\n'
    + '    · هل تتوقّع اختلافاً على هذه الشاشة بين before و after؟\n'
    + '    · إن نعم: احذف الصورةَ ولا تسلّمها دليلاً.\n'
    + '    · إن لا: اذكرها كضبطٍ سلبيّ (control) لا كدليل.'
  );
  if (strict) process.exit(1);
}

// جدول أحجام مرتَّب أبجديّاً — يساعد على القياس السريع.
console.log('\n  الأحجام:');
const names = new Set(Object.keys(perFile).map((k) => k.split('/')[1]));
for (const n of [...names].sort()) {
  const b = perFile[`before/${n}`];
  const a = perFile[`after/${n}`];
  const bs = b ? String(b.size) : '—';
  const as = a ? String(a.size) : '—';
  const same = b && a && b.md5 === a.md5;
  const flag = same ? '✗ SAME' : b && a ? '✓' : '·';
  console.log(`    ${n.padEnd(28)} before=${bs.padStart(7)}  after=${as.padStart(7)}  ${flag}`);
}
