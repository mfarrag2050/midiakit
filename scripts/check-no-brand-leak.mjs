// scripts/check-no-brand-leak.mjs — يفشل البناء إن ظهر اسم مؤسسة
// حقيقية في نصوص الاختبار/المخرجات/التسويق.
//
// **القاعدة الأصلية:** CLAUDE.md §القاعدة 10 (الفقرة الأخيرة).
// **القاعدة الفاصلة:** الاسم كحقيقة تاريخية عن أصل المشروع يبقى.
// الاسم كمثال/عيّنة/نص اختبار يُستبدل. المستثنيات في `brand-blocklist.json`.
//
// **الاستخدام:** `node scripts/check-no-brand-leak.mjs`
// **الخروج:** 0 عند النظافة، 1 عند اكتشاف تسرّب (يفشل البناء).

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_PATH = join(__dirname, 'brand-blocklist.json');

const cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

// امتدادات الفحص — نصوص فقط، لا ثنائيات
const SCAN_EXTS = new Set([
  '.mjs', '.js', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.py', '.toml', '.yaml', '.yml',
  '.txt', '.html', '.css',
]);

// تحويل glob بسيط إلى regex: يدعم **, *, ?
function globToRegex(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

const excludeGlobs = cfg.excludeGlobs.map(globToRegex);
const excludeLinePatterns = (cfg.excludeLinePatterns || []).map(
  (p) => new RegExp(p)
);

function isExcluded(relPath) {
  return excludeGlobs.some((rx) => rx.test(relPath));
}

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(dir, e.name);
    const rel = relative(ROOT, abs);
    if (isExcluded(rel)) continue;
    if (e.isDirectory()) {
      await walk(abs, out);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.');
      const ext = dot >= 0 ? e.name.slice(dot).toLowerCase() : '';
      if (SCAN_EXTS.has(ext)) out.push({ abs, rel });
    }
  }
  return out;
}

const files = await walk(ROOT);
console.log(`[check-no-brand-leak] فحص ${files.length} ملفاً …`);

const violations = [];

for (const { abs, rel } of files) {
  let content;
  try {
    content = await readFile(abs, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // استثنِ الأسطر التي تطابق نمطاً مستثنى (مثل مؤشرات // المرجع:)
    if (excludeLinePatterns.some((rx) => rx.test(line))) continue;
    for (const { term, reason } of cfg.blocklist) {
      if (line.includes(term)) {
        violations.push({ rel, line: i + 1, term, reason, text: line.trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`\n✓ نظيف — لا تسرّب في ${files.length} ملفاً مفحوصاً.`);
  process.exit(0);
}

console.error(`\n✗ ${violations.length} تسرّب/تسرّبات — نصوص عيّنة تستعمل اسم مؤسسة حقيقية:\n`);
for (const v of violations) {
  console.error(`  ${v.rel}:${v.line} — «${v.term}» (${v.reason})`);
  console.error(`    ${v.text.slice(0, 120)}${v.text.length > 120 ? '…' : ''}`);
}
console.error(`\nالحلول:`);
console.error(`  • استبدل بنصّ محايد («وكالات» · «مراسلنا» · «مصدر طبي» · «الوكالة»).`);
console.error(`  • إن كان السطر حقيقة تاريخية عن أصل المشروع، أضف مساره إلى`);
console.error(`    scripts/brand-blocklist.json (excludeGlobs) وأعلن السبب.`);
console.error(`  • راجع CLAUDE.md §القاعدة 10 للقاعدة الفاصلة.`);
process.exit(1);
