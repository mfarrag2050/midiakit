#!/usr/bin/env node
// check-digit-style-isolation — يعزل DigitStyle عن مسارات المخرَج.
//
// **القرار (S4.5 §4):**
//   • DigitStyle = زينة الواجهة (جداول · أحجام · تواريخ · لوحة).
//     تفضيل الموظف، لا هوية العميل.
//   • brand.bidi.numerals وحده يحكم كل ما يُرسم على Canvas.
//
// **السبب (القاعدة الثالثة):** صفر قيم مثبتة للهوية — الهوية مصدر
// الحقيقة الوحيد لكل ما يظهر في المخرَج. قيمة تصل من localStorage
// إلى Canvas تكسر المبدأ الذي بُني عليه المحرك.
//
// **الخطر:** لا يظهر كخطأ — المعاينة تبدو سليمة عند الموظف وتختلف
// عن مخرَج الخادم. موظف مصري يفضّل 123 ويرى ١٢٣ في مخرَج عميل خليجي.
//
// **النطاقات المحرَّمة عليها استيراد DigitStyle:**
//   (أ) apps/studio/src/api/       — طبقة عميل الخادم (قائم)
//   (ب) أي مسار معاينة/رندر تحت apps/studio/src/ يحمل أحد الأسماء:
//         preview · render · canvas · frame           (استباقي — لم يُبنَ بعد)
//
// **ملاحظة معلَنة:** الفرع (ب) لا يحرس شيئاً اليوم لأن مسار المعاينة
// غير مبنيّ (يأتي بعد S5). الفرع (أ) هو الحارس العامل. **فحص يمرّ
// فارغاً يبدو حماية وهو تسجيل غياب** — نُبقيه ونعلن.
//
// **الاستخدام:** `node scripts/check-digit-style-isolation.mjs`
// **الخروج:** 0 عند العزل، 1 عند تسرّب.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STUDIO_SRC = join(ROOT, 'apps', 'studio', 'src');

// أسماء يُمنع استيرادها في النطاقات المحرَّمة.
const BANNED_NAMES = [
  'useDigitStyle',
  'DigitStyle',
  'readDigitStyle',
  'writeDigitStyle',
  'DigitStyleSwitcher',
  'transliterateDigits',
  'formatBytes',
  'formatDate',
  'formatDateTime',
  'formatRelative',
  'formatNumber',
  'formatPercent',
];

// المسارات المحرَّمة — يجب ألا تستورد أياً من الأعلاه.
function isForbiddenScope(rel) {
  // (أ) طبقة API
  if (rel.startsWith('apps/studio/src/api/')) return { branch: 'api', active: true };
  // (ب) استباقي: أي ملف يحمل preview/render/canvas/frame في مسار studio/src
  if (rel.startsWith('apps/studio/src/')) {
    const parts = rel.split('/');
    const filename = parts[parts.length - 1] ?? '';
    const forbidden = /(preview|render|canvas|frame)/i;
    for (const seg of parts.slice(3)) {
      if (forbidden.test(seg)) return { branch: 'preview', active: true };
    }
    // اسم الملف نفسه أيضاً
    if (forbidden.test(filename)) return { branch: 'preview', active: true };
  }
  return null;
}

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

// استيرادات ES6: import ... from 'path'
const IMPORT_RE = /import\s+(?:[^'"`;]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g;

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
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) out.push(p);
  }
  return out;
}

const files = await walk(STUDIO_SRC);
const violations = [];
let apiFilesScanned = 0;
let previewFilesScanned = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const scope = isForbiddenScope(rel);
  if (!scope) continue;
  if (scope.branch === 'api') apiFilesScanned++;
  else previewFilesScanned++;

  const raw = await readFile(file, 'utf8');
  const clean = stripComments(raw);

  // نبحث أولاً عن أي استيراد من مسارات format المشتبهة أو أسماء محرَّمة.
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(clean)) !== null) {
    const spec = m[1];
    if (spec.includes('/format') || spec.endsWith('/format') || spec.includes('format/')) {
      violations.push({
        file: rel,
        branch: scope.branch,
        kind: 'import-from-format',
        detail: spec,
      });
    }
  }
  // ثم أي ذكر لاسم محرَّم كـtoken قائم في الشيفرة (خارج التعليقات).
  for (const name of BANNED_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, 'g');
    if (re.test(clean)) {
      violations.push({ file: rel, branch: scope.branch, kind: 'banned-name', detail: name });
    }
  }
}

console.log(`[check-digit-style-isolation] النطاق (أ) API: ${apiFilesScanned} ملف · (ب) preview/render: ${previewFilesScanned} ملف …`);
if (previewFilesScanned === 0) {
  console.log('  ℹ  الفرع (ب) بلا ملفات اليوم — استباقي. راجع رأس السكربت.');
}

if (violations.length === 0) {
  console.log('  ✓ نظيف — لا استيراد لـDigitStyle خارج طبقة الواجهة.');
  process.exit(0);
}

console.error(`  ✗ ${violations.length} تسرّب:`);
for (const v of violations) {
  console.error(`    [${v.branch}] ${v.file}  (${v.kind})  «${v.detail}»`);
}
console.error('');
console.error('  الحل: DigitStyle للواجهة فقط. Canvas يقرأ brand.bidi.numerals — راجع تذكرة S4.5 §4.');
process.exit(1);
