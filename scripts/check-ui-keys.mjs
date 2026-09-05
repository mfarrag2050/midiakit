#!/usr/bin/env node
// check-ui-keys — يمنع نصوصاً مقروءة داخل مكوّنات apps/studio/src/ui/.
// المكوّنات تستقبل *Key من نداءات وترجمها عبر useLocale().t() (L-22).
// **قاعدة معلَنة في تقرير S1–S4 · S2.** بلا فرض آلي تُنسى (L-54).
//
// النطاق: apps/studio/src/ui/ فقط.
// **استثناء صريح:** ملفات المعرض تحت مسار /design/. **السبب المكتوب:**
// وظيفة المعرض عرض نصوص وعيّنات، فقاعدة "لا نصّ في المكوّن" تناقض
// غرضه. الاستثناء يظهر هنا نصّاً — لا استثناء صامت يُضاف عند أول سقوط.
//
// **آلية الاستخراج:**
//   1. إزالة التعليقات (// و /* */).
//   2. إزالة محتوى السلاسل النصّية (سلاسل tailwind classes مثلاً
//      قد تحوي أحرفاً تشبه tokens JSX).
//   3. التقاط النمط `<Tag ...>text</Tag>` — نصّ يقع مباشرةً بين وسمَي
//      عناصر HTML/JSX، بلا تخللٍ لـ`{expression}` (JSX expressions
//      لا تحتوي نصّاً مقروءاً — إن كانت `{t('key')}` فقاعدتنا مُطبَّقة).
//   4. فلترة سيلانات TS generics (تعابير `Type<X>` تحوي `<>` أيضاً).
//   5. ما بقي هو نصّ حقيقي — نطبّق القاعدة عليه.
//
// **الممنوع داخل النصّ الحقيقي:**
//   • أي حرف عربي (نطاقات Unicode العربية)
//   • أي «كلمة» لاتينية بأكثر من حرفين (A-Za-z تكرّر ≥ 3)
// **المسموح:** رموز مفردة، أرقام، أحرف مفردة (`*`، `·`، `×`، `✓`، …).
//
// **الاستخدام:** `node scripts/check-ui-keys.mjs`
// **الخروج:** 0 عند النظافة، 1 عند مخالفة.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCOPE = join(ROOT, 'apps', 'studio', 'src', 'ui');

const ARABIC_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN_WORD = /[A-Za-z]{3,}/g;

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

/** يستبدل محتوى السلاسل النصّية ('...' "..." `...`) بمسافات، مع الحفاظ
 *  على الأسطر. يمنع تسرّب أحرف مثل `<` من داخل className إلى الاستخراج. */
function stripStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      out += q;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\' && i + 1 < n) {
          out += '  ';
          i += 2;
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += q;
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// كلمات TypeScript مفتاحية — إن ظهرت في الالتقاط فهو شيفرة لا نصّ.
const TS_KEYWORDS = /\b(interface|type|class|function|return|const|let|var|import|export|if|else|for|while|switch|case|break|continue|new|try|catch|finally|throw|null|undefined|true|false|void|readonly|public|private|protected|static|async|await|extends|implements|typeof|keyof|as|from|of|in|instanceof)\b/;

/** نصّ عقدة JSX = نصّ بين وسمَي `<Tag ...>` و `<`. الوسم مطلوب حرفياً
 *  كي لا نلتقط سيلانات TS generics (لا وسم قبلها). ولا نقبل `{` أو
 *  `}` في النصّ المقتطع كي لا نُدرج تعابير JSX. */
const JSX_TEXT_RE = /<[A-Za-z][^<>]*?>([^<{}]+?)<\/?[A-Za-z]/g;

function extractJsxText(src) {
  const clean = stripStrings(stripComments(src));
  const matches = [];
  let m;
  JSX_TEXT_RE.lastIndex = 0;
  while ((m = JSX_TEXT_RE.exec(clean)) !== null) {
    const raw = m[1];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.includes('\n')) continue;
    // eslint-disable-next-line no-useless-escape
    if (/[=;:<>{}()\[\]&|?!~\\`]/.test(trimmed)) continue;
    if (TS_KEYWORDS.test(trimmed)) continue;
    matches.push(trimmed);
    // نعيد المؤشر خطوة للخلف كي يعمل التقاط الوسم التالي إن كان متتالياً.
    JSX_TEXT_RE.lastIndex -= 1;
  }
  return matches;
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
    else if (e.isFile() && p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = await walk(SCOPE);
const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  // استثناء المعرض — راجع رأس الملف للسبب.
  if (rel.includes('/design/') || rel.endsWith('/design.tsx')) continue;

  const raw = await readFile(file, 'utf8');
  const texts = extractJsxText(raw);
  for (const t of texts) {
    if (ARABIC_RANGE.test(t)) {
      violations.push({ file: rel, kind: 'arabic', text: t.slice(0, 100) });
      continue;
    }
    const words = t.match(LATIN_WORD);
    if (words && words.length > 0) {
      violations.push({
        file: rel,
        kind: 'latin-word',
        text: t.slice(0, 100),
        words: words.slice(0, 3).join(', '),
      });
    }
  }
}

console.log(`[check-ui-keys] فحص ${files.length} مكوّن tsx تحت apps/studio/src/ui/ …`);

if (violations.length === 0) {
  console.log('  ✓ نظيف — كل النصوص تمرّ عبر t(*Key) (L-22).');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} نصّ مقروء داخل JSX:`);
for (const v of violations) {
  const detail = v.kind === 'latin-word' ? ` (words: ${v.words})` : '';
  console.error(`    ${v.file}  [${v.kind}]${detail}  «${v.text}»`);
}
console.error('');
console.error('  الحل: انقل النصّ إلى قواميس i18n (ar/mixed/en) واستدعِه عبر useLocale().t("key").');
process.exit(1);
