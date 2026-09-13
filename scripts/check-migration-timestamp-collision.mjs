#!/usr/bin/env node
/**
 * 311 §٣ · check-migration-timestamp-collision — يمنع تصادم طوابع node-pg-migrate.
 *
 * ── الحاجة ────────────────────────────────
 * 09-13: تصادم طابع 20260913020000 بين مهاجرَتَي feat/api وmain:
 *   • `20260913020000_revision-snapshot-strip-secrets.ts` (feat/api · _AMEND-244)
 *   • `20260913020000_templates-breaking-hash-fix.ts`     (main)
 * كلاهما مُطبَّق على dev DB. القاعدة (owner): لا إعادة تسمية طابع مطبَّق.
 * الحلّ للتصادم الثالث: منعه أصلاً.
 *
 * ── ما يفحصه ─────────────────────────────
 * كل ملفّات `packages/db/migrations/*.ts` — يستخرج الطابع الزمنيّ (أوّل 14 حرف)
 * · يفشل إن وُجد طابعان متطابقان **خارج قائمة `APPLIED_COLLISIONS_ALLOWED`**.
 *
 * ── الاستثناء الأضيق (370 · حكم owner) ────
 * الطابع الوحيد المُدرَج تحت هو `20260913020000` — تصادم موروث من دمج
 * feat/api → main. كلتا المهاجرَتَين مُطبَّقة ومسجَّلة في pgmigrations
 * فلا تُعاد تسميتها (حكم owner في 310 و 370). لا استثناء آخر · لا توسيع.
 *
 * ── L-46 (يُثبَت في تقرير 370) ────────────
 * أضف ملفّ مهاجرة مصطنع بطابع جديد مكرَّر (خارج القائمة) · شغّل · يفشل
 * باسم الطابع. احذف · شغّل · ينجح. حارسٌ يسكت عن الجديد لا قيمة له.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'packages/db/migrations');

/**
 * طوابع تصادم موروثة — مُطبَّقة كلتاها ومسجَّلة في `pgmigrations`.
 * قرار owner (310 · 370): لا إعادة تسمية.
 * كل عنصر يستوجب شاهداً تاريخيّاً في التعليق أعلاه.
 */
const APPLIED_COLLISIONS_ALLOWED = new Set([
  '20260913020000', // feat/api·revision-snapshot-strip-secrets + main·templates-breaking-hash-fix
]);

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts')).sort();
const byStamp = new Map();
for (const f of files) {
  const stamp = f.slice(0, 14);
  if (!/^\d{14}$/.test(stamp)) continue;
  if (!byStamp.has(stamp)) byStamp.set(stamp, []);
  byStamp.get(stamp).push(f);
}

const allCollisions = [...byStamp.entries()].filter(([, list]) => list.length > 1);
const collisions = allCollisions.filter(([stamp]) => !APPLIED_COLLISIONS_ALLOWED.has(stamp));
const allowed = allCollisions.filter(([stamp]) => APPLIED_COLLISIONS_ALLOWED.has(stamp));

if (allowed.length > 0) {
  console.log(`[check-migration-timestamp-collision] ℹ ${allowed.length} تصادم موروث مسموح (طُبِّق سلفاً · قرار 310/370):`);
  for (const [stamp, list] of allowed) {
    console.log(`  ℹ ${stamp}: ${list.join(' + ')}`);
  }
}

if (collisions.length === 0) {
  console.log(`[check-migration-timestamp-collision] ✓ ${files.length} مهاجرة · لا تصادم طوابع جديد.`);
  process.exit(0);
}

console.error(`[check-migration-timestamp-collision] ✗ ${collisions.length} تصادم طابع جديد (غير مسموح):`);
for (const [stamp, list] of collisions) {
  console.error(`  ✗ ${stamp}:`);
  for (const f of list) console.error(`      • ${f}`);
}
console.error(`\n  الحلّ: غيّر طابع الأحدث (إن لم يُطبَّق بعد) · وإلّا وثّق التصادم واتّبع alphabetical order.`);
console.error(`  إن كان الطابع مُطبَّقاً فعلاً على dev DB (نادر)، اطلب من owner إضافته إلى APPLIED_COLLISIONS_ALLOWED.`);
process.exit(1);
