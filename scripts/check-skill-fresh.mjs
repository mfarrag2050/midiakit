// scripts/check-skill-fresh — يفشل إن كان السكيل المُلتزَم قديماً.
//
// **العيب الذي يعالجه (PUBLISH-1 · 2026-09-09):** النسخة الأولى قارنت
// **المنطقة المولَّدة على القرص** بـ**stdout من build-skill** — الاثنان
// قد يكونان متأخّرَين معاً عن HEAD المُلتزَم فيخرج الفاحص أخضر بينما
// المرفوع إلى Opus قديم. الفاحص الآن يفشل في حالتين:
//   (أ) المولَّد الآن ≠ المنطقة GENERATED في `git show HEAD:docs/SKILL-mediakit.md`.
//   (ب) `docs/SKILL-mediakit.md` معدَّل وغير مُلتزَم (dirty).
//
// **خارج سلسلة test.**

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILL_PATH = join(ROOT, 'docs/SKILL-mediakit.md');
const SKILL_REL = 'docs/SKILL-mediakit.md';
const BEGIN = '<!-- BEGIN:GENERATED -->';
const END = '<!-- END:GENERATED -->';

function extractGenerated(content, sourceLabel) {
  const s = content.indexOf(BEGIN);
  const e = content.indexOf(END);
  if (s < 0 || e < 0) {
    console.error(`[check-skill-fresh] ✗ علامات BEGIN/END:GENERATED غير موجودة في ${sourceLabel}`);
    process.exit(1);
  }
  return content.slice(s + BEGIN.length, e).trim();
}

// نُهمل ما يتغيَّر بلا دلالة على تقادمٍ في مصادر main نفسها:
//   • سطر «تاريخ التوليد · HEAD» (ميتا).
//   • صفوف جدول الفروع (`| \`branch\` | \`hash\` | ahead | behind | total |`)
//     — «خلف main» و «الإجمالي» تتغيَّر مع كلّ commit على main نفسه
//     (self-reference).
//   • كامل المنطقة المحبوسة بين <!-- CROSS-BRANCH:START --> و
//     <!-- CROSS-BRANCH:END --> — محتواها مصدره `origin/feat/api` و
//     `origin/feat/studio`، وهذان يتحرَّكان بلا التزامٍ على main،
//     فيُحدثان احمراراً كاذباً في كلّ دمج. يبقى المحتوى إعلامياً في
//     السكيل، ولا يُقارَن. (280 · 2026-09-15 · L-127-ب.)
//
// **معيار السلامة (المشهد ج):** بعد هذا الحذف، كلُّ اختلافٍ في:
//   PHASES.md · docs/LESSONS.md · docs/17-phase4-plan.md · package.json الجذر ·
//   packages/ · demo/ · snapshots*/
// يبقى مكتشَفاً في المقارنة. تُصان اختباراً بالمشهد ج.
const BRANCH_ROW_RE = /^\|\s+`[^`]+`\s+\|\s+`[a-f0-9]+`\s+\|/;
const CB_START = '<!-- CROSS-BRANCH:START -->';
const CB_END = '<!-- CROSS-BRANCH:END -->';

function stripCrossBranch(text) {
  // إزالة كل ما بين CROSS-BRANCH:START و CROSS-BRANCH:END (شاملَين).
  // إن كانت العلامة مفقودة في أحد الطرفَين (نصٌّ قديم ما زال بلا فصل)،
  // يُترك كما هو — الحذف الأمين لا يفترض ما ليس موجوداً.
  const s = text.indexOf(CB_START);
  const e = text.indexOf(CB_END);
  if (s < 0 || e < 0 || e < s) return text;
  return text.slice(0, s) + text.slice(e + CB_END.length);
}

function stripVolatileMeta(text) {
  return stripCrossBranch(text)
    .split('\n')
    .filter((line) => (
      !line.startsWith('> **تاريخ التوليد:**') &&
      !BRANCH_ROW_RE.test(line)
    ))
    .join('\n')
    .trim();
}

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

// (0) وجود الملف
if (!existsSync(SKILL_PATH)) {
  console.error('[check-skill-fresh] ✗ docs/SKILL-mediakit.md غير موجود — شغّل `pnpm skill:build`.');
  process.exit(1);
}

// (ب) الشجرة نظيفة على هذا الملف
let porcelain;
try {
  porcelain = sh(`git status --porcelain -- ${SKILL_REL}`).trim();
} catch (err) {
  console.error('[check-skill-fresh] ✗ git status فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}
if (porcelain) {
  console.error(`[check-skill-fresh] ✗ docs/SKILL-mediakit.md معدَّل وغير مُلتزَم:`);
  console.error(`  ${porcelain}`);
  console.error('  توليد بلا التزام يعني أنّ المنشور خلف الشجرة. التزم أوّلاً.');
  process.exit(1);
}

// (أ) المولَّد الآن ≠ المنطقة GENERATED في git show HEAD
let headContent;
try {
  headContent = sh(`git show HEAD:${SKILL_REL}`);
} catch (err) {
  console.error('[check-skill-fresh] ✗ git show HEAD:docs/SKILL-mediakit.md فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

let fresh;
try {
  fresh = sh('node scripts/build-skill.mjs --stdout');
} catch (err) {
  console.error('[check-skill-fresh] ✗ build-skill --stdout فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

const headGenerated = stripVolatileMeta(extractGenerated(headContent, 'HEAD'));
const freshStripped = stripVolatileMeta(fresh);

if (headGenerated === freshStripped) {
  console.log('[check-skill-fresh] ✓ docs/SKILL-mediakit.md المُلتزَم (HEAD) مطابق للمولَّد الآن، والشجرة نظيفة.');
  process.exit(0);
}

console.error('[check-skill-fresh] ✗ السكيل المُلتزَم قديم — شغّل `pnpm skill:build` والتزم.');
console.error(`  المنطقة GENERATED في git show HEAD:${SKILL_REL} لا تطابق المولَّد الآن.`);
console.error('  السبب المرجَّح: PHASES.md / LESSONS.md / docs/17 / package.json تغيَّر بعد آخر التزام على السكيل.');
process.exit(1);
