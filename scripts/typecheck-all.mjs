#!/usr/bin/env node
// scripts/typecheck-all — يشغّل `pnpm -r --no-bail typecheck` ويطبع
// جدولاً بعدد أخطاء كل حزمة + الإجمالي، ويخرج غير صفري إن وُجد خطأ.
//
// **السياق (TYPECHECK-0 · 2026-09-09):** `pnpm typecheck` السابق كان
// `pnpm -r typecheck` — يتوقّف عند أوّل فشل، فيُخفي أخطاء الحزم
// اللاحقة بترتيب التبعية. الأثر: أعلنّا 7 أخطاء بينما الفعلي 163.
// هذا الفاحص يكشف الكلّ لا الجزء.
//
// **الخروج:** 0 إن لم يوجد أيّ خطأ · 1 إن وُجد خطأ في أيّ حزمة.

import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['-r', '--no-bail', 'typecheck'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const out = (result.stdout ?? '') + (result.stderr ?? '');

// نتتبّع الحزمة الحالية من سطور مثل: "packages/engine typecheck: ..."
// pnpm --no-bail يطبع اسم الحزمة كبادئة لكل سطر مخرَج tsc.
const perPkg = new Map();
for (const line of out.split('\n')) {
  const m = line.match(/^([a-z\-@\/]+(?:packages|apps)\/[a-z\-]+) typecheck: .*error TS\d+/);
  if (m) {
    const pkg = m[1];
    perPkg.set(pkg, (perPkg.get(pkg) ?? 0) + 1);
    continue;
  }
  // نمط بديل حين يظهر الاسم قصيراً (packages/x typecheck: ...)
  const m2 = line.match(/^((?:packages|apps)\/[a-z\-]+) typecheck: .*error TS\d+/);
  if (m2) {
    const pkg = m2[1];
    perPkg.set(pkg, (perPkg.get(pkg) ?? 0) + 1);
  }
}

const total = [...perPkg.values()].reduce((a, b) => a + b, 0);

console.log('▶ typecheck-all — كل الحزم، بلا bail');
if (perPkg.size === 0 && total === 0) {
  console.log('  ✓ لا أخطاء typecheck في أيّ حزمة.');
  process.exit(0);
}

const sorted = [...perPkg.entries()].sort((a, b) => b[1] - a[1]);
const maxNameLen = Math.max(...sorted.map(([n]) => n.length));
for (const [pkg, count] of sorted) {
  console.log(`  ${pkg.padEnd(maxNameLen)}   ${String(count).padStart(4)} خطأ`);
}
console.log(`  ${'—'.repeat(maxNameLen + 4)}`);
console.log(`  ${'الإجمالي'.padEnd(maxNameLen)}   ${String(total).padStart(4)}`);

if (total > 0) process.exit(1);
process.exit(0);
