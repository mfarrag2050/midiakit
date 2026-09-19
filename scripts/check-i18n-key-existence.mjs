#!/usr/bin/env node
// 360 §١ · حارسُ الترجمة — كلّ مفتاح حرفيّ يمرّ بـ`t()` له ترجمة.
//
// **السبب:** `LocaleProvider.tsx:t()` عند غياب المفتاح يعيده كسلسلة —
// فيظهر «pages.brandKits.editor.preview.title» شفرةً للمستخدم العربيّ.
// الفحص الحاليّ `check:ui-keys` يمنع النصّ الحرفيّ في JSX، وفحص
// `check:locale-parity` يمنع تفاوت المفاتيح بين اللغات — لكن **لا فحص
// يربط الاستدعاء بالقاموس**.
//
// **آلية الاستخراج:**
//   1. مسح `.ts`/`.tsx` في نطاقين لكلٍّ قاموسه:
//        (أ) apps/studio + packages/ui + packages/i18n → packages/i18n/src/ar.json
//        (ب) apps/dashboard                             → apps/dashboard/src/i18n/ar.json
//   2. التقاط `t('...')` أو `t("...")` بمفتاح حرفيّ (dot-path).
//   3. تجاهل الاستدعاءات المتغيّرة `t(key)` — لا يمكن فحصها ساكناً؛
//      يُتوقّع أن `check:ui-keys` + `check:locale-parity` يغطّيان
//      المتغيّرات (المفتاح يأتي من enum أو props مُحصورة).
//   4. لكل مفتاح مستخرَج: هل يوجد له مسار كامل في القاموس؟
//
// **الاستثناءات:**
//   • `t('key')` كسلسلة توثيقيّة داخل packages/i18n/src/index.ts
//     (نموذج في التعليقات، لا استدعاء فعليّ) — نستثني هذا الملف.
//
// **L-46 — الأحمر ثمّ الأخضر:**
//   احقن `t('__nonexistent_gate_probe__')` في مكوّن حيّ ⇒ أحمر.
//   أزل الحقن ⇒ أخضر.
//
// **حراسة الإبطال:** كلّ نطاق يجب أن يحوي ≥ 1 استدعاء `t()` — نطاق
// خالٍ = فحص انفصل عن الشيفرة (L-46 نطاق).

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PAIRS = [
  {
    name: 'studio',
    scopes: [
      join(ROOT, 'apps', 'studio', 'src'),
      join(ROOT, 'packages', 'ui', 'src'),
      join(ROOT, 'packages', 'i18n', 'src'),
    ],
    dict: join(ROOT, 'packages', 'i18n', 'src', 'ar.json'),
    excludeFiles: [join(ROOT, 'packages', 'i18n', 'src', 'index.ts')],
  },
  {
    name: 'dashboard',
    scopes: [join(ROOT, 'apps', 'dashboard', 'src'), join(ROOT, 'apps', 'dashboard', 'app')],
    dict: join(ROOT, 'apps', 'dashboard', 'src', 'i18n', 'ar.json'),
    excludeFiles: [],
  },
];

// `t('a.b.c')` بمفتاح حرفيّ. لا نلتقط `t(var)` — لا يمكن فحصه ساكناً.
const T_CALL_RE = /\bt\(\s*(['"])([A-Za-z0-9_.]+)\1\s*(?:,|\))/g;

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

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out);
    else out.add(path);
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
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) out.push(p);
  }
  return out;
}

let totalCalls = 0;
const violations = [];

for (const pair of PAIRS) {
  let raw;
  try {
    raw = await readFile(pair.dict, 'utf8');
  } catch {
    console.error(`[check-i18n-key-existence] ✗ قاموس مفقود: ${pair.dict}`);
    process.exit(1);
  }
  const keys = flatten(JSON.parse(raw));

  let callsInPair = 0;
  const seenFiles = [];
  for (const scope of pair.scopes) {
    const files = await walk(scope);
    for (const file of files) {
      if (pair.excludeFiles.includes(file)) continue;
      const src = stripComments(await readFile(file, 'utf8'));
      T_CALL_RE.lastIndex = 0;
      let m;
      while ((m = T_CALL_RE.exec(src)) !== null) {
        callsInPair++;
        const key = m[2];
        if (!keys.has(key)) {
          const lineNo = src.slice(0, m.index).split('\n').length;
          violations.push({
            pair: pair.name,
            file: relative(ROOT, file),
            line: lineNo,
            key,
          });
        }
      }
      if (files.length > 0) seenFiles.push(relative(ROOT, scope));
    }
  }
  totalCalls += callsInPair;
  console.log(
    `[check-i18n-key-existence] ${pair.name}: ${callsInPair} استدعاء t() · قاموس ${keys.size} مفتاح`,
  );
  // حراسة الإبطال — L-46: نطاق بلا استدعاءات = فحص مبطَل.
  if (callsInPair === 0) {
    console.error(
      `  ✗ ${pair.name}: صفر استدعاء — الفحص انفصل عن مسار الشيفرة (نُقل أو تغيّر النمط).`,
    );
    process.exit(1);
  }
}

if (violations.length === 0) {
  console.log(`  ✓ نظيف — ${totalCalls} مفتاح حرفيّ · كلّ واحد له ترجمة في ar.json.`);
  process.exit(0);
}

console.error(`  ✗ ${violations.length} مفتاح مستدعىً بلا ترجمة في ar.json:`);
for (const v of violations) {
  console.error(`    [${v.pair}] ${v.file}:${v.line}  «${v.key}»`);
}
console.error('');
console.error('  الحلّ: أضف المفتاح إلى ar.json (وسائر القواميس عبر check:locale-parity).');
console.error('  إن كان المفتاح متغيّراً حسب حالة، جمّع القيم الممكنة في enum وامرِرها.');
process.exit(1);
