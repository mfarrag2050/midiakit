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

// **بعد S2-X (2026-09-05):** نطاق المسح يشمل الحزم الجديدة أيضاً —
// لو ظهر يوماً ملفٌ preview/render/canvas/frame داخل packages/ui أو
// packages/i18n، يخضع لنفس عزل DigitStyle. الفرع (أ) API يبقى في
// apps/studio/src/api كما هو.
const OVERRIDE = process.env.CHECK_SCOPE;
const WALK_ROOTS = OVERRIDE
  ? [join(ROOT, OVERRIDE)]
  : [
      join(ROOT, 'apps', 'studio', 'src'),
      join(ROOT, 'packages', 'ui', 'src'),
      join(ROOT, 'packages', 'i18n', 'src'),
    ];

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
  // (ب) استباقي: أي ملف يحمل preview/render/canvas/frame في مسار
  // مسحوب — يشمل apps/studio/src و packages/ui/src و packages/i18n/src.
  const isScanned =
    rel.startsWith('apps/studio/src/') ||
    rel.startsWith('packages/ui/src/') ||
    rel.startsWith('packages/i18n/src/');
  if (isScanned) {
    const parts = rel.split('/');
    const filename = parts[parts.length - 1] ?? '';
    const forbidden = /(preview|render|canvas|frame)/i;
    // نتخطّى الأجزاء الأولى (apps/studio/src أو packages/ui/src …) قبل
    // فحص الأجزاء الوسطى.
    const prefixSkip = rel.startsWith('apps/') ? 3 : 3;
    for (const seg of parts.slice(prefixSkip)) {
      if (forbidden.test(seg)) return { branch: 'preview', active: true };
    }
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

const files = [];
const rootStats = [];
for (const root of WALK_ROOTS) {
  const walked = await walk(root);
  rootStats.push({ root: relative(ROOT, root), count: walked.length });
  files.push(...walked);
}

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

console.log(`[check-digit-style-isolation] الجذور الممسوحة:`);
for (const s of rootStats) {
  console.log(`    · ${s.root}: ${s.count} ملف`);
}
console.log(`  النطاقات المُصنَّفة: (أ) API=${apiFilesScanned} · (ب) preview/render=${previewFilesScanned}`);
if (previewFilesScanned === 0) {
  console.log('  ℹ  الفرع (ب) بلا ملفات اليوم — استباقي. راجع رأس السكربت.');
}

// حراسة الإبطال — L-46:
// - كل جذر يجب أن يحوي > 0 ملف (وإلا انفصل السكربت عن الشيفرة).
// - النطاق (أ) API يجب أن يحوي > 0 ملف (وإلا الحارس العامل معطَّل).
const emptyRoots = rootStats.filter((s) => s.count === 0);
if (emptyRoots.length > 0) {
  console.error(`  ✗ جذر فارغ = فحص مبطَل صامتاً:`);
  for (const s of emptyRoots) console.error(`    · ${s.root}`);
  process.exit(1);
}
if (apiFilesScanned === 0) {
  console.error(`  ✗ نطاق API (أ) صفر — الحارس العامل معطَّل.`);
  process.exit(1);
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
