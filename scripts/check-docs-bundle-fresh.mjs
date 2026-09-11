// scripts/check-docs-bundle-fresh — يفشل إن كانت الحزمة المُلتزَمة قديمة.
//
// **العيب الذي يعالجه (PUBLISH-1 · 2026-09-09):** النسخة الأولى قارنت
// **القرص** بـ**stdout من المولّد** — الاثنان قد يكونان متأخّرَين معاً
// عن HEAD المُلتزَم فيخرج الفاحص أخضر بينما المرفوع إلى Opus قديم.
// الفاحص الآن يفشل في حالتين:
//   (أ) المولَّد الآن ≠ `git show HEAD:docs/BUNDLE.md`.
//   (ب) `docs/BUNDLE.md` معدَّل وغير مُلتزَم (dirty) — توليد بلا
//       التزام يعني أنّ المنشور خلف الشجرة.
//
// الحالة (أ) هي حالة السلوك القديم لكن مقابل HEAD لا القرص.
// الحالة (ب) جديدة — تُثبَت باختبار سلبي بعد التعديل (L-46).
//
// **خارج سلسلة test:** يقيس طزاجة مخرَج خارجي لا سلامة الشجرة،
// ويربط main بحركة الفرعين.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_PATH = join(ROOT, 'docs/BUNDLE.md');
const BUNDLE_REL = 'docs/BUNDLE.md';

// نُهمل سطور «تاريخ التوليد» و «HEAD (...)» في المقارنة — ميتا لا مصدر.
// تضمينها يجعل الفحص يفشل بعد كلّ commit على main بلا فائدة.
function stripVolatileMeta(text) {
  return text
    .split('\n')
    .filter((line) => (
      !line.startsWith('> **تاريخ التوليد:**') &&
      !line.startsWith('> **HEAD (')
    ))
    .join('\n')
    .trim();
}

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

// (0) وجود الملف
if (!existsSync(BUNDLE_PATH)) {
  console.error('[check-docs-bundle-fresh] ✗ docs/BUNDLE.md غير موجود — شغّل `pnpm docs:bundle`.');
  process.exit(1);
}

// (ب) الشجرة نظيفة على هذا الملف — dirty ⇒ فشل قبل أي مقارنة.
// السبب: توليد بلا التزام يعني أنّ المنشور (HEAD) خلف الشجرة.
let porcelain;
try {
  porcelain = sh(`git status --porcelain -- ${BUNDLE_REL}`).trim();
} catch (err) {
  console.error('[check-docs-bundle-fresh] ✗ git status فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}
if (porcelain) {
  console.error(`[check-docs-bundle-fresh] ✗ docs/BUNDLE.md معدَّل وغير مُلتزَم:`);
  console.error(`  ${porcelain}`);
  console.error('  توليد بلا التزام يعني أنّ المنشور خلف الشجرة. التزم أوّلاً.');
  process.exit(1);
}

// (أ) المولَّد الآن ≠ git show HEAD:docs/BUNDLE.md
let headContent;
try {
  headContent = sh(`git show HEAD:${BUNDLE_REL}`);
} catch (err) {
  console.error('[check-docs-bundle-fresh] ✗ git show HEAD:docs/BUNDLE.md فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

let fresh;
try {
  fresh = sh('node scripts/bundle-docs.mjs --stdout');
} catch (err) {
  console.error('[check-docs-bundle-fresh] ✗ bundle-docs --stdout فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

if (stripVolatileMeta(headContent) === stripVolatileMeta(fresh)) {
  console.log('[check-docs-bundle-fresh] ✓ docs/BUNDLE.md المُلتزَم (HEAD) مطابق للمولَّد الآن، والشجرة نظيفة.');
  process.exit(0);
}

console.error('[check-docs-bundle-fresh] ✗ الحزمة المُلتزَمة قديمة — شغّل `pnpm docs:bundle` والتزم.');
console.error(`  git show HEAD:${BUNDLE_REL} لا يطابق المولَّد الآن.`);
console.error('  السبب المرجَّح: docs/*.md أو PHASES.md أو فرع تغيَّر بعد آخر التزام على الحزمة.');
process.exit(1);
