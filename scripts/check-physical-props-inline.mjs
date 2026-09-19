#!/usr/bin/env node
// 360 §٢ · حارسُ الاتّجاه — لا نداءَ فيزيائيٍّ في تخطيطٍ منطقيّ الاتّجاه.
//
// **السياق:** `check:logical-props` يمنع أصناف Tailwind (ml-, mr-, pl-,
// pr-, left-, right-, text-left, text-right) — لكن ينفذ التطبيق من
// طبقتين أخريين لم يحرسهما شيء:
//   • **inline styles** — `style={{ left: 0, marginLeft: 8, textAlign: 'left' }}`
//     (ظهر مرّتين في يوم واحد قبل هذه التذكرة).
//   • **CSS خامّ** — `.foo { left: 0; padding-right: 8px; text-align: right; }`
//
// **الممنوع (في JSX inline + CSS خامّ):**
//   ‣ `left`, `right`                                → `insetInlineStart` / `insetInlineEnd`
//   ‣ `marginLeft`, `marginRight` · `margin-left`, `margin-right`
//                                                     → `marginInlineStart` / `marginInlineEnd`
//   ‣ `paddingLeft`, `paddingRight` · `padding-left`, `padding-right`
//                                                     → `paddingInlineStart` / `paddingInlineEnd`
//   ‣ `borderLeft*`, `borderRight*` · `border-left*`, `border-right*`
//                                                     → `borderInlineStart*` / `borderInlineEnd*`
//   ‣ `textAlign: 'left'|'right'` · `text-align: left|right`
//                                                     → `textAlign: 'start'|'end'`
//   ‣ `float: left|right`                             → لا بديل منطقيّ · وثّق كاستثناء.
//
// **الاستثناءات — كلٌّ بسطر مبرَّرٍ نصّاً:** `scripts/physical-props-exceptions.json`
// الحارس يقبل نطاقاتٍ سُمّيت هناك، بشرط أن لكلٍّ حقلَ `reason` غير فارغ.
//
// **النطاقات:** apps/studio/src · apps/dashboard/src · apps/dashboard/app ·
// packages/ui/src · packages/i18n/src · CSS داخلها.
//
// **L-46 — الأحمر ثمّ الأخضر:** أدخل `style={{ left: 0 }}` في `LocaleSwitcher`
// ⇒ أحمر · أزل ⇒ أخضر.

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const OVERRIDE = process.env.CHECK_SCOPE;
const SCOPES = OVERRIDE
  ? [join(ROOT, OVERRIDE)]
  : [
      join(ROOT, 'apps', 'studio', 'src'),
      join(ROOT, 'apps', 'studio', 'app'),
      join(ROOT, 'apps', 'dashboard', 'src'),
      join(ROOT, 'apps', 'dashboard', 'app'),
      join(ROOT, 'packages', 'ui', 'src'),
      join(ROOT, 'packages', 'ui', 'styles'),
      join(ROOT, 'packages', 'i18n', 'src'),
    ];

const EXCEPTIONS_FILE = join(ROOT, 'scripts', 'physical-props-exceptions.json');

// نمط JS/JSX (camelCase) — نلتقط داخل تعبير `style={{...}}` أو object literal.
// نبحث عن أسماء الخصائص مع قيمة نصّية 'left'|'right' أو أيّ قيمة رقميّة.
const JS_PROPS = [
  { name: 'left',                    re: /(?<![A-Za-z0-9_$])left\s*:/g },
  { name: 'right',                   re: /(?<![A-Za-z0-9_$])right\s*:/g },
  { name: 'marginLeft',              re: /\bmarginLeft\s*:/g },
  { name: 'marginRight',             re: /\bmarginRight\s*:/g },
  { name: 'paddingLeft',             re: /\bpaddingLeft\s*:/g },
  { name: 'paddingRight',            re: /\bpaddingRight\s*:/g },
  { name: 'borderLeft*',             re: /\bborderLeft[A-Za-z]*\s*:/g },
  { name: 'borderRight*',            re: /\bborderRight[A-Za-z]*\s*:/g },
  { name: "textAlign:'left'",        re: /\btextAlign\s*:\s*['"`]left['"`]/g },
  { name: "textAlign:'right'",       re: /\btextAlign\s*:\s*['"`]right['"`]/g },
  { name: "float:'left'",            re: /\bfloat\s*:\s*['"`]left['"`]/g },
  { name: "float:'right'",           re: /\bfloat\s*:\s*['"`]right['"`]/g },
];

// نمط CSS — الأسماء بشرطة.
const CSS_PROPS = [
  { name: 'left',              re: /(?:^|[\s;{])left\s*:/g },
  { name: 'right',             re: /(?:^|[\s;{])right\s*:/g },
  { name: 'margin-left',       re: /(?:^|[\s;{])margin-left\s*:/g },
  { name: 'margin-right',      re: /(?:^|[\s;{])margin-right\s*:/g },
  { name: 'padding-left',      re: /(?:^|[\s;{])padding-left\s*:/g },
  { name: 'padding-right',     re: /(?:^|[\s;{])padding-right\s*:/g },
  { name: 'border-left*',      re: /(?:^|[\s;{])border-left[a-z-]*\s*:/g },
  { name: 'border-right*',     re: /(?:^|[\s;{])border-right[a-z-]*\s*:/g },
  { name: 'text-align: left',  re: /text-align\s*:\s*left\b/g },
  { name: 'text-align: right', re: /text-align\s*:\s*right\b/g },
  { name: 'float: left',       re: /float\s*:\s*left\b/g },
  { name: 'float: right',      re: /float\s*:\s*right\b/g },
];

function stripComments(src, isCss = false) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (!isCss && ch === '/' && next === '/') {
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

/** JSX inline styles تظهر داخل `style={{ ... }}`. نستخرج فقط ما بينهما
 *  كي لا نلتقط اسم متغيّرٍ مصادفاً «left» في كود عاديّ. */
function extractInlineStyleBlocks(src) {
  const blocks = [];
  const re = /style\s*=\s*\{\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const startPos = m.index;
    let i = m.index + m[0].length;
    let depth = 2; // فتحنا `{{`
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth === 0) {
      const line = src.slice(0, startPos).split('\n').length;
      blocks.push({ line, body: src.slice(m.index + m[0].length, i - 2) });
    }
  }
  return blocks;
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts') || p.endsWith('.css'))) {
      out.push(p);
    }
  }
  return out;
}

// قائمة الاستثناءات — كلٌّ بمبرِّر.
let exceptions = { entries: [] };
try {
  const raw = await readFile(EXCEPTIONS_FILE, 'utf8');
  exceptions = JSON.parse(raw);
} catch {
  exceptions = { entries: [] };
}

function isExcepted(relFile, propName) {
  for (const ex of exceptions.entries) {
    if (!ex.reason || !ex.reason.trim()) continue; // استثناء بلا سبب = غير معتمَد
    if (ex.file && relFile !== ex.file) continue;
    if (ex.filePrefix && !relFile.startsWith(ex.filePrefix)) continue;
    if (ex.props && !ex.props.includes(propName)) continue;
    return ex;
  }
  return null;
}

const violations = [];
const acceptedExceptions = [];
let totalFiles = 0;
const scopeCounts = [];

for (const scope of SCOPES) {
  const files = await walk(scope);
  scopeCounts.push({ scope: relative(ROOT, scope), count: files.length });
  totalFiles += files.length;
  for (const file of files) {
    const rel = relative(ROOT, file);
    const raw = await readFile(file, 'utf8');
    const isCss = file.endsWith('.css');
    const clean = stripComments(raw, isCss);

    if (isCss) {
      const lines = clean.split('\n');
      for (let idx = 0; idx < lines.length; idx++) {
        for (const p of CSS_PROPS) {
          p.re.lastIndex = 0;
          if (p.re.test(lines[idx])) {
            const ex = isExcepted(rel, p.name);
            if (ex) acceptedExceptions.push({ file: rel, line: idx + 1, prop: p.name, reason: ex.reason });
            else violations.push({ file: rel, line: idx + 1, prop: p.name, snippet: lines[idx].trim().slice(0, 100) });
          }
        }
      }
    } else {
      // JSX/TS — نطاق البحث inline style blocks فقط.
      const blocks = extractInlineStyleBlocks(clean);
      for (const b of blocks) {
        for (const p of JS_PROPS) {
          p.re.lastIndex = 0;
          if (p.re.test(b.body)) {
            const ex = isExcepted(rel, p.name);
            if (ex) acceptedExceptions.push({ file: rel, line: b.line, prop: p.name, reason: ex.reason });
            else violations.push({ file: rel, line: b.line, prop: p.name, snippet: b.body.trim().slice(0, 100) });
          }
        }
      }
    }
  }
}

console.log(`[check-physical-props-inline] فحص ${totalFiles} ملف عبر ${SCOPES.length} نطاق:`);
for (const s of scopeCounts) console.log(`    · ${s.scope}: ${s.count}`);

const emptyScopes = scopeCounts.filter((s) => s.count === 0);
if (emptyScopes.length > 0) {
  console.error(`  ✗ نطاق فارغ = فحص مبطَل صامتاً:`);
  for (const s of emptyScopes) console.error(`    · ${s.scope}`);
  process.exit(1);
}

if (acceptedExceptions.length > 0) {
  console.log(`  ℹ ${acceptedExceptions.length} استعمال فيزيائيّ مقبول باستثناء مسمّى:`);
  for (const e of acceptedExceptions) {
    console.log(`    · ${e.file}:${e.line}  ${e.prop}  ← ${e.reason}`);
  }
}

if (violations.length === 0) {
  console.log('  ✓ نظيف — لا خاصّيّة اتّجاه فيزيائيّ في inline styles أو CSS خامّ.');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} استعمال لخاصّيّة اتّجاه فيزيائيّة:`);
for (const v of violations) {
  console.error(`    ${v.file}:${v.line}  ${v.prop}  ← ${v.snippet}`);
}
console.error('');
console.error('  الحلّ: استبدل بالبديل المنطقيّ (insetInlineStart/End · marginInline* · paddingInline* · textAlign start/end).');
console.error(`  إن كان استعمالاً فيزيائيّاً مبرّراً، أضِفه إلى ${relative(ROOT, EXCEPTIONS_FILE)} مع reason.`);
process.exit(1);
