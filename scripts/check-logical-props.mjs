#!/usr/bin/env node
// check-logical-props — يفرض RTL-first في apps/studio/src/ui/ عبر منع
// خصائص Tailwind الحساسة للاتجاه لصالح البدائل المنطقية.
//
// النطاق: apps/studio/src/ui/
// الممنوع (بعد تجاوز التعليقات):
//   • ml-  mr-        → استعمل ms-  me-
//   • pl-  pr-        → استعمل ps-  pe-
//   • left- right-    → استعمل start- end-
//   • text-left  text-right → استعمل text-start  text-end
//
// **السبب:** المكوّن يعمل في dir=rtl وdir=ltr بلا فروع؛ الخصائص
// الطبيعية (left/right) تعطي سلوكاً معكوساً في RTL. القاعدة معلَنة
// في تقرير S1–S4، هذا الفحص يفرضها آلياً — القاعدة بلا فرض تُنسى (L-54).
//
// **الاستخدام:** `node scripts/check-logical-props.mjs`
// **الخروج:** 0 عند النظافة، 1 عند مخالفة.

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCOPE = join(ROOT, 'apps', 'studio', 'src', 'ui');

// كل نمط: [رمز الشرح، regex يلتقط الاستعمال الفعلي]
// نستعمل حدود كلمة قبل، والحرف بعد ما يميّز token (رقم/حرف كبير) من
// اختراقات كاذبة (border-left-color قد يمرّ — نلتقط left- كوحدة قائمة).
const BANNED = [
  ['ml-*',      /(?<![A-Za-z0-9_-])-?ml-[a-z0-9]/g],
  ['mr-*',      /(?<![A-Za-z0-9_-])-?mr-[a-z0-9]/g],
  ['pl-*',      /(?<![A-Za-z0-9_-])pl-[a-z0-9]/g],
  ['pr-*',      /(?<![A-Za-z0-9_-])pr-[a-z0-9]/g],
  ['left-*',    /(?<![A-Za-z0-9_-])-?left-[a-z0-9]/g],
  ['right-*',   /(?<![A-Za-z0-9_-])-?right-[a-z0-9]/g],
  ['text-left', /(?<![A-Za-z0-9_-])text-left\b/g],
  ['text-right',/(?<![A-Za-z0-9_-])text-right\b/g],
];

function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts'))) out.push(p);
  }
  return out;
}

const files = await walk(SCOPE);
const violations = [];

for (const file of files) {
  const raw = await readFile(file, 'utf8');
  const clean = stripComments(raw);
  const rel = relative(ROOT, file);
  const lines = clean.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    for (const [label, re] of BANNED) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        violations.push({
          file: rel,
          line: idx + 1,
          token: m[0],
          rule: label,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
}

console.log(`[check-logical-props] فحص ${files.length} ملف تحت apps/studio/src/ui/ …`);

if (violations.length === 0) {
  console.log('  ✓ نظيف — كل الخصائص منطقية (ms/me · ps/pe · start/end · text-start/end).');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} استعمال لخاصية ذات اتجاه فعلي:`);
for (const v of violations) {
  console.error(`    ${v.file}:${v.line}  ${v.rule}  «${v.token}»  ← ${v.snippet}`);
}
console.error('');
console.error('  الحل: استبدل بالبديل المنطقي (ms-* me-* ps-* pe-* start-* end-* text-start text-end).');
process.exit(1);
