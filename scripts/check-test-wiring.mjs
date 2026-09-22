#!/usr/bin/env node
// scripts/check-test-wiring — يفشل إن وُجد `check:*` أو `verify:*` في
// package.json ليس في سلسلة `pnpm test` ولا مذكوراً صراحةً في
// `scripts/gates-excludes.json` مع مبرِّر.
//
// **المشكلة التي يعالجها (310 · 2026-09-15):** إضافة حارسٍ جديد
// (`ink-gate` · `video-gate` · `parse-tokens` · إلخ) يتطلّب سطراً في
// `scripts.test`. النسيان صامت: الحارسُ مكتوبٌ ولا يُشغَّل. هذا الفحص
// يُفشل البناءَ فور إضافة حارسٍ بلا توثيقٍ لموضعه.
//
// **قواعد اللعبة:**
//   • كلّ `check:*` و `verify:*` في package.json:
//       (أ) موجود في سلسلة `pnpm test` (`&&`-chain)، **أو**
//       (ب) مذكور صراحةً في `scripts/gates-excludes.json` مع reason.
//   • الفشلُ يذكر الحارسَ ومقترحَ الإصلاح — إمّا أضفه إلى `test`، أو
//     إلى الاستثناءات مع سبب.
//
// **ليس عبئاً على مؤلّف الحارس الجديد:** الرسالة تُخبره بالتغيير
// المطلوب حرفيّاً. صفرُ تخمين.
//
// **خارج سلسلة test — كما check:skill-fresh.** يُشغَّل في CI عبر
// `pnpm test` نفسه (بمجرد إضافته)، ومحلّياً باليد.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PKG_PATH = join(ROOT, 'package.json');
const EXCLUDES_PATH = join(ROOT, 'scripts/gates-excludes.json');

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
const allGates = Object.keys(pkg.scripts).filter((k) => /^(check|verify):/.test(k));

// السلسلة داخل `pnpm test` — نقسّم على `&&`، ننزع بادئة `pnpm `.
const testChain = String(pkg.scripts.test || '')
  .split('&&')
  .map((s) => s.trim())
  .map((s) => s.replace(/^pnpm\s+/, ''));
const wired = new Set(testChain.filter((c) => /^(check|verify):/.test(c)));

// الاستثناءات المعلَنة — كائن من gate → reason.
let excludes = {};
if (existsSync(EXCLUDES_PATH)) {
  try {
    excludes = JSON.parse(readFileSync(EXCLUDES_PATH, 'utf8'));
  } catch (err) {
    console.error(`[check-test-wiring] ✗ فشل قراءة gates-excludes.json:`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

// حرّاس بلا حراسة (لا في test · لا في excludes).
const unguarded = allGates.filter((g) => !wired.has(g) && !(g in excludes));

// حرّاس في excludes لكن reason فارغ — استثناءٌ بلا مبرّر لا يُقبل.
const unmotivated = Object.entries(excludes)
  .filter(([g, reason]) => allGates.includes(g) && (!reason || String(reason).trim() === ''))
  .map(([g]) => g);

// حرّاس في excludes لكن لا وجود لهم في package.json — نفايةٌ في
// الاستثناءات، تُشكّل إشارةَ تشيّخ (aging).
// المفاتيح المُبتَدأة بـ`_` = وسم توثيقيّ (comment/note) وتُتجاوز.
const stale = Object.keys(excludes)
  .filter((k) => !k.startsWith('_'))
  .filter((g) => !allGates.includes(g));

// كذلك: حرّاس في BOTH test-chain و excludes — تعارضٌ لا معنى له.
const contradictory = Object.keys(excludes).filter((g) => wired.has(g));

let bad = false;

if (unguarded.length > 0) {
  bad = true;
  console.error('[check-test-wiring] ✗ حرّاس بلا حراسة CI:');
  for (const g of unguarded) {
    console.error(`  • ${g}`);
  }
  console.error('');
  console.error('  الإصلاح — لكلّ واحد اختَر:');
  console.error('    (أ) أضفه إلى سلسلة `pnpm test` في package.json.');
  console.error(`    (ب) أضفه إلى ${EXCLUDES_PATH} كـ:`);
  console.error('        { "verify:foo": "سبب واضح (مثال: يُشغَّل في workflow ليليّ)" }');
  console.error('');
}

if (unmotivated.length > 0) {
  bad = true;
  console.error('[check-test-wiring] ✗ استثناءٌ بلا مبرّر (reason فارغة):');
  for (const g of unmotivated) {
    console.error(`  • ${g}`);
  }
  console.error('  اكتب سبباً صريحاً في gates-excludes.json — «بلا سبب» لا تُقبل.');
  console.error('');
}

if (contradictory.length > 0) {
  bad = true;
  console.error('[check-test-wiring] ✗ في السلسلة وفي الاستثناءات معاً (تعارض):');
  for (const g of contradictory) {
    console.error(`  • ${g}`);
  }
  console.error('  احذفه من gates-excludes.json — الحراسة الفعليّة تكفي.');
  console.error('');
}

if (stale.length > 0) {
  // نُحذّر، لا نُفشل — نفاية سهلة الإزالة.
  console.error('[check-test-wiring] ⚠ استثناءاتٌ لأسماء غير موجودة في package.json:');
  for (const g of stale) {
    console.error(`  • ${g} (احذفه من gates-excludes.json)`);
  }
}

if (bad) {
  process.exit(1);
}

const total = allGates.length;
const wiredCount = allGates.filter((g) => wired.has(g)).length;
const excludedCount = allGates.filter((g) => g in excludes).length;
console.log(
  `[check-test-wiring] ✓ ${total} حارس · ${wiredCount} في pnpm test · ${excludedCount} استثناء بمبرِّر.`
);
