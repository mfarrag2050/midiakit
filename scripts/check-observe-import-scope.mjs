#!/usr/bin/env node
/**
 * A25 — check-observe-import-scope (حارس بنيوي).
 *
 * القاعدة: `@pf-mediakit/renderer/observe` مصدر مقاييس التشغيل. يُقرأ من
 * موضعَين فقط:
 *   1. `apps/dashboard/` — أداة تطوير محلّية بلا مصادقة (لا تُنشَر)
 *   2. `apps/api/src/routes/platform/` — endpoints المنصّة خلف
 *      platform-auth-guard + control_plane_user
 *
 * أيّ استيراد ثالث ⇒ مسار قراءة موازٍ محتمل بلا حارس — يُرفض بذكر السطر.
 *
 * السبب البنيوي (قرار المالك 2026-09-07): «للمقاييس مساران — محروس ومفتوح
 * — ولن يتذكّر أحد بعد شهر أيّهما أيّ». الحارس يُصلّب النطاق ذاتياً.
 *
 * الاستثناء الطبيعي: imports داخل `packages/renderer/` عبر مسار نسبي
 * (`./observe.js`) لا يُطابَق — الحارس يبحث عن اسم الحزمة حصراً.
 *
 * L-46 اختبار الوجود: أضف مؤقّتاً في `apps/api/src/routes/tenant/get.ts`:
 *   import { queueDepth } from '@pf-mediakit/renderer/observe';
 * شغّل السكربت — يخرج بـ1 ذاكراً السطر. احذف الإضافة — يخرج بـ0.
 *
 * الخروج: 0 نجاح · 1 فشل بذكر الأسطر المخالفة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_ROOTS = [
  join(ROOT, 'apps'),
  join(ROOT, 'packages'),
  join(ROOT, 'scripts'),
];
const ALLOWED_PREFIXES = [
  join(ROOT, 'apps/dashboard'),
  join(ROOT, 'apps/api/src/routes/platform'),
];
// استثناءات ملفّية صريحة (كل ملف مبرَّر):
const ALLOWED_FILES = new Set([
  // scripts/dashboard-eta-check.mjs — سكربت تحقّق ETA اللوحة (docs/08 §المبدأ).
  //   يشغّل عاملاً ثم يستدعي observe.jobPosition لمقارنة التقدير بالفعل.
  //   ينتمي منطقياً إلى «أدوات dashboard»، ملحق تاريخي في scripts/.
  join(ROOT, 'scripts/dashboard-eta-check.mjs'),
]);

// نبحث عن اسم الحزمة حصراً — imports داخل packages/renderer عبر
// `./observe.js` لا تعنينا (لا تفتح مساراً موازياً خارج الحزمة).
// **^\s*import** يضمن سطر استيراد فعلي (تعليقات JSDoc `*   import` لا تُطابَق).
const IMPORT_RE = /^\s*import\s[^;]*from\s+['"]@pf-mediakit\/renderer\/observe['"]/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|js|tsx)$/.test(name)) out.push(p);
  }
}

const files = [];
for (const root of SCAN_ROOTS) walk(root, files);

const violations = [];
for (const f of files) {
  if (ALLOWED_PREFIXES.some((prefix) => f.startsWith(prefix + '/') || f === prefix)) continue;
  if (ALLOWED_FILES.has(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (IMPORT_RE.test(line)) violations.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error(`✗ check-observe-import-scope: ${violations.length} استيراد خارج النطاق`);
  console.error('  القاعدة: observe يُقرأ من apps/dashboard/ أو apps/api/src/routes/platform/ فقط.');
  console.error('  استيراد ثالث = مسار قراءة موازٍ محتمل بلا حارس.');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`✓ check-observe-import-scope: صفر استيراد خارج النطاق (${files.length} ملفاً مفحوصاً)`);
process.exit(0);
