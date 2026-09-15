#!/usr/bin/env node
// scripts/check-typecheck — يربط typecheck-all في CI مع سقفٍ لكلّ حزمة
// واستثناءاتٍ مؤقّتة (تاريخ · سبب · مالك · تذكرة إغلاق).
//
// **المشكلة (320 · 2026-09-15):** `pnpm typecheck` كان بلا حراسة في CI
// — أخطاؤه صمتت لأسابيع، فكشف ٣٠٠ ١٢ منها ولم يرَها أحدٌ حتّى نُظر
// إليها بيدَين. حارسٌ لا يُشغَّل لا يحرس (٣١٠).
//
// **لماذا لا نُلزم صفر أخطاء اليوم:** ١٠٨ خطأ موروث عبر ٦ حزم. إلزامُ
// الصفر ⇒ CI أحمر دائماً ⇒ تجاهل ⇒ نفسُ الكذبة القديمة.
//
// **البديل — ratchet مع expiry:** كلُّ حزمة حمراء لها استثناء مؤقّت
// في scripts/typecheck-excludes.json يحمل:
//   • `max_errors`  — سقف يُفشل الفحصَ إن تجاوزه (يمنع الزيادة).
//   • `expires`     — تاريخ ISO. عند تجاوزه ⇒ الفحصُ يفشل حتى يُعدَّل
//                     السقف أو يُحلّ الاستثناء (يمنع النسيان).
//   • `reason` · `owner` · `close_ticket` — عين توثيقيّة.
//
// **قواعد لا تنكسر:**
//   • حزمة خارج الاستثناءات ⇒ يجب صفر أخطاء (وإلّا فشل).
//   • حزمة داخل الاستثناءات ⇒ actual ≤ max_errors && today < expires.
//   • الاستثناء المُنتهي (expires < today) ⇒ فشل.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXCLUDES_PATH = join(ROOT, 'scripts/typecheck-excludes.json');
const TC_ALL = join(ROOT, 'scripts/typecheck-all.mjs');

// اقرأ الاستثناءات
let excludes = {};
if (existsSync(EXCLUDES_PATH)) {
  try {
    excludes = JSON.parse(readFileSync(EXCLUDES_PATH, 'utf8'));
  } catch (err) {
    console.error(`[check-typecheck] ✗ فشل قراءة typecheck-excludes.json: ${err.message}`);
    process.exit(1);
  }
}
// نتجاهل مفاتيح `_*` (تعليقات وثائقيّة).
const excludeKeys = Object.keys(excludes).filter((k) => !k.startsWith('_'));

// شغّل typecheck-all واقرأ العدّاد المطبوع.
const result = spawnSync('node', [TC_ALL], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const out = (result.stdout ?? '') + (result.stderr ?? '');

// السطور المطبوعة من typecheck-all بشكل `  apps/renderer  28 خطأ` أو
// `  ✓ لا أخطاء`. نقرأها.
const counts = new Map();
const anyPackageRe = /^\s*((?:apps|packages)\/[a-z-]+)\s+(\d+)\s+خطأ/;
for (const line of out.split('\n')) {
  const m = line.match(anyPackageRe);
  if (m) counts.set(m[1], parseInt(m[2], 10));
}

// جميع الحزم المطلوب فحصها: من workspace file · بديل مفتاحيّ من scripts/typecheck-excludes.json
// نبني القائمة من `pnpm -r ls --json`. لتجنّب استدعاء ثانٍ نستعمل
// counts.keys() ∪ excludeKeys — من له خطأ ظاهر أو استثناء مسجَّل.
const allPackages = new Set([...counts.keys(), ...excludeKeys]);

const today = new Date().toISOString().slice(0, 10);
let failed = false;
const rows = [];

for (const pkg of [...allPackages].sort()) {
  const actual = counts.get(pkg) ?? 0;
  const exc = excludes[pkg];
  if (!exc) {
    // خارج الاستثناءات ⇒ يجب صفر.
    if (actual === 0) {
      rows.push({ pkg, actual, status: 'PASS', note: '' });
    } else {
      rows.push({ pkg, actual, status: 'FAIL', note: 'ليس في الاستثناءات — يجب صفر' });
      failed = true;
    }
    continue;
  }
  // داخل الاستثناءات ⇒ افحص expires + max_errors.
  const max = Number(exc.max_errors);
  const expires = String(exc.expires ?? '');
  if (!expires || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    rows.push({ pkg, actual, status: 'FAIL', note: 'expires مفقود أو شكل خاطئ' });
    failed = true;
    continue;
  }
  if (expires < today) {
    rows.push({ pkg, actual, status: 'FAIL', note: `الاستثناء منتهي منذ ${expires}` });
    failed = true;
    continue;
  }
  if (!Number.isFinite(max) || max < 0) {
    rows.push({ pkg, actual, status: 'FAIL', note: 'max_errors مفقود أو شكل خاطئ' });
    failed = true;
    continue;
  }
  if (actual > max) {
    rows.push({ pkg, actual, status: 'FAIL', note: `${actual} > max ${max} · ratchet كسر` });
    failed = true;
    continue;
  }
  rows.push({
    pkg,
    actual,
    status: 'EXCLUDED',
    note: `≤ ${max} · ينتهي ${expires} · ${exc.owner ?? '?'} · ${exc.close_ticket ?? '?'}`,
  });
}

console.log('▶ check:typecheck — الحرّاس عبر الحزم');
const nameLen = Math.max(...rows.map((r) => r.pkg.length), 15);
for (const r of rows) {
  const sym = r.status === 'PASS' ? '✓' : r.status === 'EXCLUDED' ? '⏳' : '✗';
  console.log(`  ${sym} ${r.pkg.padEnd(nameLen)}   ${String(r.actual).padStart(4)} · ${r.note}`);
}

if (failed) {
  console.error('');
  console.error('[check-typecheck] ✗ فشل — راجع الأسطر أعلاه.');
  process.exit(1);
}

const passing = rows.filter((r) => r.status === 'PASS').length;
const excluded = rows.filter((r) => r.status === 'EXCLUDED').length;
console.log('');
console.log(`[check-typecheck] ✓ ${passing} خضراء · ${excluded} استثناء مؤقّت.`);
