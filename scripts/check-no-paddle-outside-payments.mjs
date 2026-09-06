#!/usr/bin/env node
/**
 * A21 — check-no-paddle-outside-payments (حارس بنيوي — docs/17 §القرار 3).
 *
 * قاعدة: بقية النظام تعرف «اشتراك نشط» و«الحدّ الشهري» فقط. اسم Paddle
 * (أو أيّ مزوّد مستقبلي: Tap · PayTabs · Moyasar) يبقى داخل
 * `apps/api/src/payments/` وحده. تبديل المزوّد = إبدال ملف واحد.
 *
 * النطاق: apps/api/src/ (يستثني payments/)
 * الأنماط الممنوعة: /paddle/i · /stripe/i · /lemonsqueezy/i · /fastspring/i
 *   (case-insensitive — لأن `Paddle` و `paddle` كلاهما يخالف)
 *
 * L-46 (اختبار الوجود):
 *   أضف مؤقّتاً في `apps/api/src/routes/health.ts` سطر `// paddle test`.
 *   شغّل السكربت — يخرج بـ1. احذف السطر — يخرج بـ0.
 *
 * الخروج: 0 نجاح · 1 فشل مع طباعة الأسطر المخالفة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = join(ROOT, 'apps/api/src');
const EXCLUDE_DIR = join(SCAN, 'payments');

const BANNED = /\b(paddle|stripe|lemonsqueezy|fastspring)\b/i;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p === EXCLUDE_DIR || p.startsWith(EXCLUDE_DIR + '/')) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|js)$/.test(name)) out.push(p);
  }
}

const files = [];
walk(SCAN, files);

const violations = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (BANNED.test(line)) {
      violations.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`✗ check-no-paddle-outside-payments: ${violations.length} مخالفة`);
  console.error('  القاعدة: اسم المزوّد يبقى داخل apps/api/src/payments/ حصراً.');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`✓ check-no-paddle-outside-payments: صفر ذكر لمزوّد خارج payments/ (${files.length} ملفاً مفحوصاً)`);
process.exit(0);
