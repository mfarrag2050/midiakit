#!/usr/bin/env node
// 420 §٣ · تشخيصٌ: رموز خطأٍ معلَنة في errors.ts لكنّها لا تُرمى من أيّ مسار.
//
// **الغاية:** «رمزٌ لا يُرمى إمّا يُفرَض وإمّا يُحذَف» — audit 850 وجد أنّ
// `STORAGE_QUOTA_EXCEEDED` عاش شهوراً معلَناً بلا فرض. هذا الأداة تكشف
// نظائر لتذاكر لاحقة (لا يُفرض pnpm test — إنّها diagnostic لا guard).
//
// **الاستعمال:** `node scripts/audit-declared-unused-codes.mjs`
//
// **حدود القياس:**
//   - نبحث في `apps/api/src` + `apps/renderer/src` + `packages/`.
//   - نستثني `errors.ts` (التعريف) و`packages/i18n/src/` (القواميس) و
//     `clientOnlyCodes` من `scripts/mk-api-error-codes.json` (رموز
//     العميل — لا تُرمى من الخادم بالتصميم).
//   - رمزُ renderer الذي يُرمى بـ`throw new Error('CODE: ...')` كنصّ خام
//     يُلتقط لأنّه ما زال literal في المصدر.
//   - **إيجابيّاتٌ كاذبة محتملة:** رمزٌ يُرمى عبر آليّةٍ ديناميّة (بناء
//     السلسلة runtime). اقرأ الإخراج بعين، لا تحذف قبل التحقّق.

import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const src = await readFile('apps/api/src/errors.ts', 'utf8');
const codes = [...new Set([...src.matchAll(/^\s*\|\s*'([A-Z0-9_]+)'/gm)].map((m) => m[1]))];

const helpers = new Map();
for (const m of src.matchAll(/export const (\w+)\s*=\s*(?:\([^)]*\)\s*=>\s*)?new ApiError\('([A-Z0-9_]+)'/g)) {
  helpers.set(m[2], m[1]);
}

const mirror = JSON.parse(await readFile('scripts/mk-api-error-codes.json', 'utf8'));
const clientOnly = new Set(mirror.clientOnlyCodes?.codes ?? []);

console.log(`[audit-declared-unused-codes]`);
console.log(`  · رموز في ErrorCode: ${codes.length}`);
console.log(`  · client-only مستثنى: ${clientOnly.size}`);

const unused = [];
const patternsPath = '/tmp/audit-declared-unused-codes-patterns.txt';
for (const c of codes) {
  if (clientOnly.has(c)) continue;
  const helper = helpers.get(c);
  const patterns = [`'${c}'`, `"${c}"`, `\`${c}:`]; // string throw في renderer
  if (helper) patterns.push(helper);
  await writeFile(patternsPath, patterns.join('\n'));
  const cmd = `grep -rFn -f ${patternsPath} apps/api/src apps/renderer/src packages/ --include='*.ts' 2>/dev/null | grep -v -E 'apps/api/src/errors\\.ts|packages/i18n/src/'`;
  let hits = '';
  try { hits = execSync(cmd, { encoding: 'utf8' }); } catch { /* no hits */ }
  const lines = hits.split('\n').filter(Boolean);
  if (lines.length === 0) unused.push({ code: c, helper: helper ?? '(none)' });
}

console.log(`  · معلَنة ولا تُرمى: ${unused.length}\n`);
if (unused.length === 0) {
  console.log('  ✓ لا رمزَ يعِد بما لا يفعل.');
} else {
  console.log('  ⚠ راجع كلّاً — إمّا يُفرَض في تذكرة لاحقة، أو يُحذف:');
  for (const u of unused) console.log(`      · ${u.code}  (helper: ${u.helper})`);
}
