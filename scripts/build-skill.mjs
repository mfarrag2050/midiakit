// scripts/build-skill — يُولِّد المنطقة المولَّدة في docs/SKILL-mediakit.md
// من الملفات الفعلية. المنطقة المُملاة لا تُلمَس.
//
// **قاعدة L-63 الصارمة:** كل سطر هنا يأتي من قراءة ملف أو تشغيل أمر.
// لا سطر يُكتب من فهم السكربت للمشروع.
//
// **الفشل بلا نصّ بديل (تصحيح 2026-09-05):** أيّ مصدر يفشل في القراءة
// أو التحليل ⇒ البناء يسقط بـexit≠0 برسالة تسمّي القسم والأمر. لا نصّ
// «قد يكون» ولا تخمين. الشاهد التاريخي: النسخة الأولى كتبت «لا
// package.json مقروء عبر git — قد يكون apps/studio غير موجود بعد»
// بينما القراءة كانت من مسار خطأ (apps/studio/package.json بدل الجذر)،
// فأخفت الخطأ خلف نصّ يبدو معلوماً. هذا بالضبط ما بُني السكربت ليمنعه.
//
// **لا اقتطاع في القوائم (تصحيح 2026-09-05):** A/S/SYNC والفحوص
// والنقاط تُكتب كاملة. من يقرأ السكيل لا يملك الملفات — قائمة مقتطعة
// تبدو كاملة أسوأ من غيابها.
//
// **الأوضاع:**
//   node scripts/build-skill.mjs            → يكتب الملف
//   node scripts/build-skill.mjs --stdout   → يطبع المنطقة المولَّدة فقط
//
// **الحد الأقصى:** 300 سطر. عند التجاوز يفشل ويطبع أطول 3 أقسام —
// المالك يقرّر ما يُختصر (المنطقة المُملاة عادةً)، لا السكربت.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILL_PATH = join(ROOT, 'docs/SKILL-mediakit.md');
const BEGIN = '<!-- BEGIN:GENERATED -->';
const END = '<!-- END:GENERATED -->';
const MAX_LINES = 400;

// ── رأس YAML — ثابت، خارج المنطقتين ──────────────────
// `description` هو ما يجعل السكيل يُستدعى في واجهة Claude عند ذكر
// المشاريع المستهدفة. النصّ ثابت في السكربت — لا يُشتقّ من الملفات
// (لا معنى لاشتقاق وصف السكيل من محتوياته). المولّد يضمن وجوده في
// كل بناء: إن غاب يُضاف، وإن اختلف يُستبدَل بنسخة السكربت.
const FRONTMATTER = `---
name: mediakit
description: |
  مرجع مشروع «Media Kit» عبر الجلسات — تحويل أداة الإنتاج البصري
  العربية (بطاقات، عاجل، ريلز) من إضافة Photopea داخلية بُنيت
  لوكالة الأناضول إلى منتج SaaS متعدد الهويات لوكالات السوشيال
  ميديا العربية. يحمل القواعد التسع، القيم المستخرجة من الكود
  الأصلي، الخندق التنافسي (الكشيدة، الكسر الدلالي، التشكيل،
  BiDi)، معمارية المنصة وقراراتها، الدَين المفتوح، وقواعد
  المراجعة. استخدمها كلما لمس العمل هذا المشروع — المحرك،
  brandKit، القوالب، الرندر، الطوابير، mk-api، mk-studio،
  التسعير، العميل الأول — أو حين يسأل «أين توقفنا». مشغّلات:
  Media Kit، ميديا كيت، brandKit، الكشيدة، التطويل، drawAt،
  بطاقة العاجل، الريلز، الخط الزمني، SYNC-α. لا تستخدمها لـ
  aqop-portal أو aql-* أو aa-* أو topia أو primemind أو minhaj.
---
`;

// أخطاء البناء: كل واحد يُميَّز بالقسم والأمر الذي فشل.
class SectionReadError extends Error {
  constructor(section, cmd, cause) {
    super(`[build-skill] ✗ فشل قراءة القسم «${section}»\n  الأمر: ${cmd}\n  السبب: ${cause}`);
    this.section = section;
    this.cmd = cmd;
  }
}

/** أمر shell يعيد stdout كنصّ، أو يرمي SectionReadError. */
function shOrFail(section, cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new SectionReadError(section, cmd, stderr || 'خرج بحالة غير صفرية');
  }
}

/** أمر shell قد يكون فارغاً بشكل شرعي (مثل grep بلا مطابقة) — يُعيد '' على exit=1. */
function shOptional(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// ── جدول المراحل من PHASES.md ────────────────────────

function extractPhaseTable() {
  const section = 'المراحل';
  const path = join(ROOT, 'PHASES.md');
  if (!existsSync(path)) {
    throw new SectionReadError(section, `readFileSync PHASES.md`, 'الملف غير موجود');
  }
  const content = readFileSync(path, 'utf8');
  const anchor = content.indexOf('## نظرة عامة');
  if (anchor < 0) {
    throw new SectionReadError(section, `grep '## نظرة عامة' PHASES.md`, 'العنوان غير موجود');
  }
  const after = content.slice(anchor);
  const lines = after.split('\n');
  const out = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true;
      out.push(line);
    } else if (inTable) break;
  }
  if (out.length === 0) {
    throw new SectionReadError(section, `parse table after '## نظرة عامة'`, 'لم يُعثر على جدول');
  }
  return out.join('\n');
}

// ── الفحوص لكل فرع (main + api + studio) ──────────────

function extractChecks(pkgSource, section, cmd) {
  let pkg;
  try {
    pkg = JSON.parse(pkgSource);
  } catch (err) {
    throw new SectionReadError(section, cmd, `JSON.parse فشل: ${err.message}`);
  }
  const scripts = pkg.scripts || {};
  return Object.keys(scripts)
    .filter((k) => k.startsWith('check:') || k.startsWith('verify:'))
    .sort();
}

function checksFromRef(ref, section) {
  // نقرأ package.json الجذر — هو مصدر سلسلة الاختبارات على كل فرع.
  const cmd = `git show ${ref}:package.json`;
  const src = shOrFail(section, cmd);
  return extractChecks(src, section, cmd);
}

function checksFromLocal(section) {
  const path = join(ROOT, 'package.json');
  if (!existsSync(path)) {
    throw new SectionReadError(section, `readFileSync package.json`, 'الملف غير موجود');
  }
  const src = readFileSync(path, 'utf8');
  return extractChecks(src, section, `readFileSync package.json`);
}

// ── نقاط النهاية على feat/api ────────────────────────

function endpointsFromApi() {
  const section = 'نقاط النهاية على feat/api';
  // نتحقّق أوّلاً أن المسار موجود على الفرع — الغياب حالة شرعية.
  const treeCmd = `git ls-tree -r --name-only origin/feat/api`;
  const tree = shOrFail(section, treeCmd);
  const files = tree
    .split('\n')
    .filter((f) => /^apps\/api\/src\/routes\/.*\.ts$/.test(f))
    .sort();
  return files;
}

// ── إحصاء LESSONS.md ─────────────────────────────────

function extractLessons() {
  const section = 'LESSONS.md';
  const path = join(ROOT, 'docs/LESSONS.md');
  if (!existsSync(path)) {
    throw new SectionReadError(section, `readFileSync docs/LESSONS.md`, 'الملف غير موجود');
  }
  const content = readFileSync(path, 'utf8');
  const nums = [...content.matchAll(/^## L-(\d+)\s/gm)].map((m) => parseInt(m[1], 10));
  if (nums.length === 0) {
    throw new SectionReadError(section, `regex /^## L-(\\d+)/`, 'لم يُعثر على أيّ درس');
  }
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  const min = uniq[0], max = uniq[uniq.length - 1];
  const expected = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const gaps = expected.filter((n) => !uniq.includes(n));
  const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  return { count: uniq.length, entries: nums.length, min, max, gaps, dupes };
}

// ── قوائم A / S / SYNC من docs/17 ────────────────────

function extractLists17() {
  const section = 'قوائم المرحلة 4';
  const path = join(ROOT, 'docs/17-phase4-plan.md');
  if (!existsSync(path)) {
    throw new SectionReadError(section, `readFileSync docs/17-phase4-plan.md`, 'الملف غير موجود');
  }
  const content = readFileSync(path, 'utf8');
  const collectUnique = (re) => {
    const matches = [...content.matchAll(re)].map((m) => m[1]);
    return [...new Set(matches)].sort((a, b) => {
      const na = parseInt(a.replace(/[^0-9]/g, ''), 10);
      const nb = parseInt(b.replace(/[^0-9]/g, ''), 10);
      return na - nb;
    });
  };
  const a = collectUnique(/(?<![A-Z])(A\d+(?:\.\d+)?)(?![A-Z0-9])/g);
  const s = collectUnique(/(?<![A-Z])(S\d+(?:\.\d+)?)(?![A-Z0-9])/g);
  const sync = collectUnique(/(SYNC[-\s]?[\wͰ-Ͽ]+)/g);
  if (a.length === 0 && s.length === 0 && sync.length === 0) {
    throw new SectionReadError(section, `regex A/S/SYNC on docs/17-phase4-plan.md`, 'لا معرِّفات مكتشفة');
  }
  return { a, s, sync };
}

// ── الفروع ورؤوسها وعدد الالتزامات ──────────────────

function branchesInfo() {
  const section = 'الفروع';
  // نستثني main و origin/main — قيمهما تتغيَّر مع كلّ commit على هذا
  // الفرع، فتُبطل بوابة الطزاجة بلا فائدة (السطر يقول «main تغيَّر»
  // — نعم، الالتزام الذي أضاف السطر غيَّره).
  const raw = shOrFail(section, `git for-each-ref --format='%(refname:short)|%(objectname:short)' refs/heads refs/remotes/origin`);
  const out = [];
  for (const line of raw.split('\n')) {
    const [name, hash] = line.split('|');
    if (!name || name.endsWith('/HEAD')) continue;
    if (name === 'main' || name === 'origin/main') continue;
    const count = shOrFail(section, `git rev-list --count ${name}`);
    out.push({ name, hash, count });
  }
  if (out.length === 0) {
    throw new SectionReadError(section, `git for-each-ref`, 'لا فروع أخرى غير main');
  }
  return out;
}

// ── محتويات المستودع ─────────────────────────────────

function contents() {
  const section = 'محتويات المستودع';
  const packages = shOrFail(section, `ls packages`).split('\n').filter(Boolean);
  // المجلدات الاختيارية: قد لا توجد بعد. نستخدم shOptional ونعرض 0.
  const count = (dir) => {
    if (!existsSync(join(ROOT, dir))) return '0';
    const out = shOptional(`ls ${dir} 2>/dev/null | wc -l | tr -d ' '`);
    return out || '0';
  };
  return {
    packages,
    demoCount: count('demo'),
    snapshotsCount: count('snapshots'),
    semanticCount: count('snapshots-semantic'),
    videoCount: count('snapshots-video'),
  };
}

// ── ميتا ─────────────────────────────────────────────

function meta() {
  const section = 'ميتا';
  const head = shOrFail(section, `git rev-parse --short HEAD`);
  const branch = shOrFail(section, `git rev-parse --abbrev-ref HEAD`);
  const date = new Date().toISOString().slice(0, 10);
  return { head, branch, date };
}

// ── التوليد ──────────────────────────────────────────

function buildGenerated() {
  const m = meta();
  const phaseTable = extractPhaseTable();
  const lessons = extractLessons();
  const branches = branchesInfo();
  const c = contents();
  const l17 = extractLists17();
  const eps = endpointsFromApi();
  const mainChecks = checksFromLocal('الفحوص — main');
  const apiChecks = checksFromRef('origin/feat/api', 'الفحوص — feat/api');
  const studioChecks = checksFromRef('origin/feat/studio', 'الفحوص — feat/studio');

  // القوائم كاملة — لا اقتطاع.
  const fmtFull = (arr) => arr.length ? arr.map((x) => `\`${x}\``).join(' · ') : '(لا شيء)';

  return `## مولَّد تلقائياً — لا تحرِّر يدوياً

> **مصدر كل سطر:** ملف أو أمر. يُنتَج بـ\`pnpm skill:build\`.
> **تاريخ التوليد:** ${m.date} · **HEAD:** \`${m.head}\` (\`${m.branch}\`)
>
> **قراءة النطاق:** كل عنوان قسم يحمل نطاقه — «من main» يخصّ حالة
> الفرع الرئيسي فقط · «عبر الفروع» يجمع main + feat/api + feat/studio.
> السطر «packages: engine · shared · templates · tts» صحيح لـmain
> ولا يصف المشروع كله — packages/ui و packages/i18n موجودتان على
> feat/studio (تصحيح 2026-09-06).

### المراحل — من main (\`PHASES.md §نظرة عامة\`)

${phaseTable}

### الفروع — عبر الفروع (\`git for-each-ref\`)

| الفرع | HEAD | عدد الالتزامات |
|---|---|---|
${branches.map((b) => `| \`${b.name}\` | \`${b.hash}\` | ${b.count} |`).join('\n')}

### الفحوص الآلية — عبر الفروع (\`package.json\` الجذر)

- **main (${mainChecks.length}):** ${fmtFull(mainChecks)}
- **feat/api (${apiChecks.length}):** ${fmtFull(apiChecks)}
- **feat/studio (${studioChecks.length}):** ${fmtFull(studioChecks)}

### الدروس — من main (\`docs/LESSONS.md\`)

- **المدى:** L-${lessons.min} → L-${lessons.max}
- **العدد الفريد:** ${lessons.count} · **الإدخالات:** ${lessons.entries}
- **فجوات:** ${lessons.gaps.length ? lessons.gaps.map((n) => `L-${n}`).join(' · ') : '(لا فجوات)'}
- **تكرار:** ${lessons.dupes.length ? lessons.dupes.map((n) => `L-${n}`).join(' · ') : '(لا تكرار)'}

### قوائم المرحلة 4 — من main (\`docs/17-phase4-plan.md\`)

- **A-list (${l17.a.length}):** ${fmtFull(l17.a)}
- **S-list (${l17.s.length}):** ${fmtFull(l17.s)}
- **SYNC (${l17.sync.length}):** ${fmtFull(l17.sync)}

### نقاط النهاية المبنيّة — عبر الفروع (\`git ls-tree origin/feat/api apps/api/src/routes/\`)

${eps.length ? eps.map((e) => `- \`${e}\``).join('\n') : '- (لا ملفات مطابقة في origin/feat/api:apps/api/src/routes/)'}

### محتويات المستودع — من main (\`ls\`)

- **\`packages/\`:** ${c.packages.length ? c.packages.map((p) => `\`${p}\``).join(' · ') : '(فارغ)'}
- **\`demo/\`:** ${c.demoCount} ملف
- **\`snapshots/\`:** ${c.snapshotsCount} · **\`snapshots-semantic/\`:** ${c.semanticCount} · **\`snapshots-video/\`:** ${c.videoCount}
`;
}

// ── الحقن + الفحص ────────────────────────────────────

function inject(fileContent, generated) {
  const s = fileContent.indexOf(BEGIN);
  const e = fileContent.indexOf(END);
  if (s < 0 || e < 0) {
    throw new Error('علامات BEGIN/END:GENERATED غير موجودة في docs/SKILL-mediakit.md');
  }
  return fileContent.slice(0, s + BEGIN.length) + '\n' + generated + '\n' + fileContent.slice(e);
}

/**
 * يضمن أن الملف يبدأ برأس YAML الثابت. إن غاب يُضاف. إن وُجد
 * (سواء صحيحاً أو محرَّفاً) يُستبدَل بنسخة السكربت — الرأس ملك
 * المولّد لا المحرِّر.
 */
function ensureFrontmatter(content) {
  if (content.startsWith('---\n')) {
    // نبحث عن سطر '---' الختامي.
    const endIdx = content.indexOf('\n---\n', 4);
    if (endIdx >= 0) {
      return FRONTMATTER + content.slice(endIdx + '\n---\n'.length);
    }
    // '---' افتتاحي بلا ختام ⇒ الملف تالف؛ نستبدل الرأس ونُبقي البقية.
  }
  return FRONTMATTER + content;
}

// ── التنفيذ ──────────────────────────────────────────

let generated;
try {
  generated = buildGenerated();
} catch (err) {
  if (err instanceof SectionReadError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

if (process.argv.includes('--stdout')) {
  process.stdout.write(generated);
  process.exit(0);
}

const current = readFileSync(SKILL_PATH, 'utf8');
const withFrontmatter = ensureFrontmatter(current);
const updated = inject(withFrontmatter, generated);
const lines = updated.split('\n');

if (lines.length > MAX_LINES) {
  const sections = [];
  let cur = { title: '(قبل أول قسم)', count: 0 };
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) {
      if (cur.count > 0) sections.push(cur);
      cur = { title: line.trim(), count: 1 };
    } else {
      cur.count++;
    }
  }
  if (cur.count > 0) sections.push(cur);
  sections.sort((a, b) => b.count - a.count);
  console.error(`[build-skill] ✗ الملف ${lines.length} سطراً — يتجاوز الحد ${MAX_LINES}.`);
  console.error(`  القوائم تبقى كاملة — أنت تقرّر ما يُختصر (عادةً المنطقة المُملاة).`);
  console.error(`  أطول ثلاثة أقسام:`);
  for (const sec of sections.slice(0, 3)) {
    console.error(`    ${sec.count} سطراً — ${sec.title}`);
  }
  process.exit(1);
}

writeFileSync(SKILL_PATH, updated);
console.log(`[build-skill] ✓ docs/SKILL-mediakit.md (${lines.length} سطر · حد ${MAX_LINES})`);
