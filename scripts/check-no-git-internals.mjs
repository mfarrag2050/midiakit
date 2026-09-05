// scripts/check-no-git-internals — يمنع الكتابة المباشرة على مسارات
// .git الداخلية من أيّ كود في المستودع.
//
// **السبب (L-67):** أربع جلسات تتشارك مستودعاً واحداً عبر worktrees.
// تعديل .git/refs · .git/logs · .git/worktrees · .git/HEAD · packed-refs
// يصيب جلسات أخرى تعمل الآن، وأثره يظهر عندها لا عند الفاعل.
//
// **ما يُسمح:**
//   • القراءة (readFile · git show · git rev-parse).
//   • الأوامر عبر git نفسه (git update-ref · git pack-refs ·
//     git symbolic-ref) — يعرف git كيف يحدّث الحالة المشتركة بأمان.
//
// **ما يُمنع (write ops على مسار .git داخلي):**
//   writeFile · writeFileSync · rmSync · unlink(Sync) · shell mv/cp/sed -i ·
//   shell redirect > .git · > packed-refs.
//
// **الاستخدام:** `node scripts/check-no-git-internals.mjs`
// **الخروج:** 0 نظيف · 1 عند سطر مخالف.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// مسارات .git الداخلية المحظورة كأهداف كتابة.
const DANGER_PATH = /\.git\/(refs|logs|worktrees|HEAD)|packed-refs/;

// عمليات الكتابة (Node + shell).
const WRITE_OPS = [
  { re: /\bwriteFileSync\s*\(/, kind: 'writeFileSync' },
  { re: /\bwriteFile\s*\(/,     kind: 'writeFile' },
  { re: /\brmSync\s*\(/,        kind: 'rmSync' },
  { re: /\brm\s*\(/,            kind: 'rm(' },
  { re: /\bunlinkSync\s*\(/,    kind: 'unlinkSync' },
  { re: /\bunlink\s*\(/,        kind: 'unlink' },
  { re: /\bmv\s+/,              kind: 'shell mv' },
  { re: /\bcp\s+/,              kind: 'shell cp' },
  { re: /\bsed\s+-i\b/,         kind: 'shell sed -i' },
  { re: /\becho\s.*>/,          kind: 'shell echo redirect' },
  { re: />>\s*['"]?[^&|]/,      kind: 'shell append redirect' },
  { re: />\s*['"]?[^&|>]/,      kind: 'shell redirect' },
];

// مجلدات نمسحها.
const SCAN_DIRS = ['scripts', 'apps', 'packages'];

// امتدادات كودية.
const CODE_EXT = /\.(mjs|cjs|js|ts|tsx|sh)$/;

// مسارات مُستثناة صراحةً (الحارس نفسه — يذكر الأنماط كنصوص regex).
const EXCLUDE_FILES = new Set([
  'scripts/check-no-git-internals.mjs',
]);

// مجلدات مُستثناة (تعوّل عليها العديد من المستودعات).
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.git']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (CODE_EXT.test(name)) {
      const rel = relative(ROOT, full);
      if (!EXCLUDE_FILES.has(rel)) out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

let violations = 0;
const details = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DANGER_PATH.test(line)) continue;
    // نستثني السطر الذي يُحيل صراحةً إلى `git <cmd>` قبل المسار
    // (git update-ref refs/... مثلاً).
    if (/\bgit\s+(update-ref|pack-refs|symbolic-ref|for-each-ref|show|rev-parse|ls-files|show-ref|check-ref-format|reflog|fsck|log)\b/.test(line)) {
      continue;
    }
    const op = WRITE_OPS.find((w) => w.re.test(line));
    if (op) {
      violations++;
      details.push({
        file: relative(ROOT, file),
        line: i + 1,
        op: op.kind,
        text: line.trim().slice(0, 120),
      });
    }
  }
}

console.log(`[check-no-git-internals] فحص ${files.length} ملف كود …`);

if (violations === 0) {
  console.log('  ✓ نظيف — لا كتابة مباشرة على .git الداخلية.');
  process.exit(0);
}

console.error(`  ✗ ${violations} مخالفة/مخالفات:`);
for (const v of details) {
  console.error(`    ${v.file}:${v.line} — عملية «${v.op}»`);
  console.error(`      ${v.text}`);
}
console.error('  L-67: `.git` حالة مشتركة بين الجلسات. استعمل git commands بدل التعديل المباشر.');
process.exit(1);
