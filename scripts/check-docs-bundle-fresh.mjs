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
//
// ٤٤٩ · صفوف الفروع في الجداول (`| `branch` | `sha` | count | count | count |`)
// تتقدّم بعمود «خلف main» مع كلّ commit على main — سباقٌ ذاتيٌّ ينتقض بمجرّد
// الحفظ. نستعمل النمطَ نفسه المُثبَت في check-skill-fresh.mjs (280 · L-127-ب)
// حرفياً، فما يُصان هناك يُصان هنا. أيّ تغييرٍ في PHASES.md · docs/LESSONS.md
// · docs/17-phase4-plan.md · package.json الجذر · packages/ · demo/ · snapshots*/
// يبقى مكتشَفاً (لا يمرّ عبر هذا الحذف).
const BRANCH_ROW_RE = /^\|\s+`[^`]+`\s+\|\s+`[a-f0-9]+`\s+\|/;

function stripVolatileMeta(text) {
  return text
    .split('\n')
    .filter((line) => (
      !line.startsWith('> **تاريخ التوليد:**') &&
      !line.startsWith('> **HEAD (') &&
      !BRANCH_ROW_RE.test(line)
    ))
    .join('\n')
    .trim();
}

// maxBuffer 16MB: الحزمة تجاوزت 1MB (السقف الافتراضيّ لـNode) فاستُبدل
// «bundle قديم» بـENOBUFS · أي «تعذّر الفحص» يُتَّهم به «الوثائق». راجع 417 §١.
function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
}

// (0) وجود الملف
if (!existsSync(BUNDLE_PATH)) {
  console.error('[check-docs-bundle-fresh] ✗ docs/BUNDLE.md غير موجود — شغّل `pnpm docs:bundle`.');
  process.exit(1);
}

const GIT_EXISTS = existsSync(join(ROOT, '.git'));

// (ب) الشجرة نظيفة على هذا الملف — dirty ⇒ فشل قبل أي مقارنة.
// السبب: توليد بلا التزام يعني أنّ المنشور (HEAD) خلف الشجرة.
if (GIT_EXISTS) {
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
}

// (أ) المولَّد الآن ≠ git show HEAD:docs/BUNDLE.md
// **تمييزٌ صريح (417 §١):** فشلُ الفاحصِ ذاتِه ≠ الحزمةُ بائتة. الرسالتان مختلفتان.
let headContent;
if (GIT_EXISTS) {
  try {
    headContent = sh(`git show HEAD:${BUNDLE_REL}`);
  } catch (err) {
    console.error('[check-docs-bundle-fresh] ✗ تعذّر الفحصُ — قراءةُ HEAD:docs/BUNDLE.md فشلت (ليس عطبَ طزاجة، عطبٌ في الفاحص):');
    console.error(`  ${err.code === 'ENOBUFS' ? 'ENOBUFS — الحزمةُ فاضت maxBuffer.' : (err.stderr ? err.stderr.toString() : err.message)}`);
    process.exit(2);
  }
} else {
  try {
    headContent = readFileSync(BUNDLE_PATH, 'utf8');
  } catch (err) {
    console.error('[check-docs-bundle-fresh] ✗ تعذّر الفحصُ — قراءةُ docs/BUNDLE.md من القرص فشلت:');
    console.error(`  ${err.message}`);
    process.exit(2);
  }
}

let fresh;
try {
  fresh = sh('node scripts/bundle-docs.mjs --stdout');
} catch (err) {
  console.error('[check-docs-bundle-fresh] ✗ تعذّر الفحصُ — bundle-docs --stdout فشل (ليس عطبَ طزاجة، عطبٌ في الفاحص):');
  console.error(`  ${err.code === 'ENOBUFS' ? 'ENOBUFS — الخرْجُ فاض maxBuffer.' : (err.stderr ? err.stderr.toString() : err.message)}`);
  process.exit(2);
}

if (stripVolatileMeta(headContent) === stripVolatileMeta(fresh)) {
  console.log('[check-docs-bundle-fresh] ✓ docs/BUNDLE.md المُلتزَم (HEAD) مطابق للمولَّد الآن، والشجرة نظيفة.');
  process.exit(0);
}

console.error('[check-docs-bundle-fresh] ✗ الحزمة المُلتزَمة قديمة — شغّل `pnpm docs:bundle` والتزم.');
console.error(`  git show HEAD:${BUNDLE_REL} لا يطابق المولَّد الآن.`);
console.error('  السبب المرجَّح: docs/*.md أو PHASES.md أو فرع تغيَّر بعد آخر التزام على الحزمة.');
process.exit(1);
