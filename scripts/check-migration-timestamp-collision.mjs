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
 * · يفشل إن وُجد طابعان متطابقان.
 *
 * ── ما لا يفحصه ─────────────────────────
 * لا يفحص الطوابع المُطبَّقة سلفاً — قاعدة owner (لا إعادة تسمية). الحارس
 * يمنع **الثالث** لا يُصلح الحاليّ.
 *
 * ── L-46 (في تقرير 311) ────────────────
 * أضف ملفّ مهاجرة مصطنع بطابع مكرَّر · شغّل · يفشل باسم الطابع.
 * احذف · شغّل · ينجح.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'packages/db/migrations');

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts')).sort();
const byStamp = new Map();
for (const f of files) {
  const stamp = f.slice(0, 14);
  if (!/^\d{14}$/.test(stamp)) continue;
  if (!byStamp.has(stamp)) byStamp.set(stamp, []);
  byStamp.get(stamp).push(f);
}

const collisions = [...byStamp.entries()].filter(([, list]) => list.length > 1);

if (collisions.length === 0) {
  console.log(`[check-migration-timestamp-collision] ✓ ${files.length} مهاجرة · لا تصادم طوابع.`);
  process.exit(0);
}

console.error(`[check-migration-timestamp-collision] ✗ ${collisions.length} تصادم طابع:`);
for (const [stamp, list] of collisions) {
  console.error(`  ✗ ${stamp}:`);
  for (const f of list) console.error(`      • ${f}`);
}
console.error(`\n  الحلّ: غيّر طابع الأحدث (إن لم يُطبَّق بعد) · وإلّا وثّق التصادم واتّبع alphabetical order.`);
process.exit(1);
