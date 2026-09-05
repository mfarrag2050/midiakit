// scripts/build-skill — يُولِّد المنطقة المولَّدة في docs/SKILL-mediakit.md
// من الملفات الفعلية. المنطقة المُملاة لا تُلمَس.
//
// **قاعدة L-63 الصارمة:** كل سطر هنا يأتي من قراءة ملف أو تشغيل أمر.
// لا سطر يُكتب من فهم السكربت للمشروع.
//
// **الأوضاع:**
//   node scripts/build-skill.mjs            → يكتب الملف
//   node scripts/build-skill.mjs --stdout   → يطبع المنطقة المولَّدة فقط
//
// **الحد الأقصى:** 300 سطر. إن تجاوز، يفشل ويطبع أطول 3 أقسام.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILL_PATH = join(ROOT, 'docs/SKILL-mediakit.md');
const BEGIN = '<!-- BEGIN:GENERATED -->';
const END = '<!-- END:GENERATED -->';
const MAX_LINES = 300;

/** أمر shell يعيد stdout كنصّ، أو '' عند الفشل. */
function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// ── جدول المراحل من PHASES.md ────────────────────────

function extractPhaseTable() {
  const content = readFileSync(join(ROOT, 'PHASES.md'), 'utf8');
  const anchor = content.indexOf('## نظرة عامة');
  if (anchor < 0) return '(PHASES.md §نظرة عامة غير موجود)';
  // نأخذ أوّل جدول markdown بعد الأنكور
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
  return out.length > 0 ? out.join('\n') : '(الجدول غير مطابق)';
}

// ── الفحوص لكل فرع (main + api + studio) ──────────────

function extractChecks(pkgSource) {
  if (!pkgSource) return [];
  try {
    const pkg = JSON.parse(pkgSource);
    const scripts = pkg.scripts || {};
    return Object.keys(scripts)
      .filter((k) => k.startsWith('check:') || k.startsWith('verify:'))
      .sort();
  } catch { return []; }
}

function checksFromRef(ref, path = 'package.json') {
  const src = sh(`git show ${ref}:${path}`);
  return extractChecks(src);
}

// ── نقاط النهاية على feat/api ────────────────────────

function endpointsFromApi() {
  const files = sh(`git ls-tree -r --name-only origin/feat/api | grep -E 'apps/api/src/routes/.*\\.ts$'`);
  if (!files) return [];
  return files.split('\n').filter(Boolean);
}

// ── إحصاء LESSONS.md ─────────────────────────────────

function extractLessons() {
  const content = readFileSync(join(ROOT, 'docs/LESSONS.md'), 'utf8');
  const nums = [...content.matchAll(/^## L-(\d+)\s/gm)].map((m) => parseInt(m[1], 10));
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  const min = uniq[0], max = uniq[uniq.length - 1];
  const expected = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const gaps = expected.filter((n) => !uniq.includes(n));
  const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  return { count: uniq.length, entries: nums.length, min, max, gaps, dupes };
}

// ── قوائم A / S / SYNC من docs/17 ────────────────────

function extractLists17() {
  const path = join(ROOT, 'docs/17-phase4-plan.md');
  if (!existsSync(path)) return { a: [], s: [], sync: [] };
  const content = readFileSync(path, 'utf8');
  // الصياغة الفعلية في docs/17: `- **A1.** …` أو `- **A9. Tenants** …`
  // نلتقط الرقم فقط (بلا وصف)، ثم uniqueify لكيلا نعدّ الإشارات المكرَّرة.
  // نلتقط المعرِّفات (A1, S22, SYNC-3) أينما ظهرت كمعرِّف — عبر
  // lookbehind/lookahead لتجنّب مطابقة داخل كلمات كبيرة (مثل "APP")
  // أو معرِّفات ممتدّة. نُوحّد ثم نرتّب رقمياً.
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
  // SYNC-α · SYNC-β · SYNC-1 — أيّ لاحقة (رقم أو حرف يوناني).
  const sync = collectUnique(/(SYNC[-\s]?[\wͰ-Ͽ]+)/g);
  return { a, s, sync };
}

// ── الفروع ورؤوسها وعدد الالتزامات ──────────────────

function branchesInfo() {
  const raw = sh(`git for-each-ref --format='%(refname:short)|%(objectname:short)' refs/heads refs/remotes/origin`);
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    const [name, hash] = line.split('|');
    if (!name || name.endsWith('/HEAD')) continue;
    const count = sh(`git rev-list --count ${name}`);
    out.push({ name, hash, count });
  }
  return out;
}

// ── محتويات المستودع ─────────────────────────────────

function contents() {
  const packages = sh(`ls packages 2>/dev/null`).split('\n').filter(Boolean);
  const demoCount = sh(`ls demo 2>/dev/null | wc -l | tr -d ' '`);
  const snapshotsCount = sh(`ls snapshots 2>/dev/null | wc -l | tr -d ' '`);
  const semanticCount = sh(`ls snapshots-semantic 2>/dev/null | wc -l | tr -d ' '`);
  const videoCount = sh(`ls snapshots-video 2>/dev/null | wc -l | tr -d ' '`);
  return { packages, demoCount, snapshotsCount, semanticCount, videoCount };
}

// ── ميتا ─────────────────────────────────────────────

function meta() {
  const head = sh(`git rev-parse --short HEAD`);
  const branch = sh(`git rev-parse --abbrev-ref HEAD`);
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
  const mainChecks = extractChecks(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const apiChecks = checksFromRef('origin/feat/api', 'apps/api/package.json');
  const studioChecks = checksFromRef('origin/feat/studio', 'apps/studio/package.json');

  const fmtList = (arr, n = 8) => {
    if (!arr.length) return '(لا شيء)';
    const shown = arr.slice(0, n).map((x) => `\`${x}\``).join(' · ');
    return arr.length > n ? `${shown} · … +${arr.length - n}` : shown;
  };

  return `## مولَّد تلقائياً — لا تحرِّر يدوياً

> **مصدر كل سطر:** ملف أو أمر. يُنتَج بـ\`pnpm skill:build\`.
> **تاريخ التوليد:** ${m.date} · **HEAD:** \`${m.head}\` (\`${m.branch}\`)

### المراحل — من \`PHASES.md §نظرة عامة\`

${phaseTable}

### الفروع — من \`git for-each-ref\`

| الفرع | HEAD | عدد الالتزامات |
|---|---|---|
${branches.map((b) => `| \`${b.name}\` | \`${b.hash}\` | ${b.count} |`).join('\n')}

### الفحوص الآلية — من \`package.json\` الثلاثة

- **main:** ${fmtList(mainChecks, 12)}
- **feat/api:** ${apiChecks.length ? fmtList(apiChecks, 12) : '(لا package.json مقروء عبر git — قد يكون apps/api غير موجود بعد)'}
- **feat/studio:** ${studioChecks.length ? fmtList(studioChecks, 12) : '(لا package.json مقروء عبر git — قد يكون apps/studio غير موجود بعد)'}

### الدروس — من \`docs/LESSONS.md\`

- **المدى:** L-${lessons.min} → L-${lessons.max}
- **العدد الفريد:** ${lessons.count} · **الإدخالات:** ${lessons.entries}
- **فجوات:** ${lessons.gaps.length ? lessons.gaps.map((n) => `L-${n}`).join(' · ') : '(لا فجوات)'}
- **تكرار:** ${lessons.dupes.length ? lessons.dupes.map((n) => `L-${n}`).join(' · ') : '(لا تكرار)'}

### قوائم المرحلة 4 — من \`docs/17-phase4-plan.md\`

- **A-list (${l17.a.length}):** ${fmtList(l17.a, 10)}
- **S-list (${l17.s.length}):** ${fmtList(l17.s, 10)}
- **SYNC (${l17.sync.length}):** ${fmtList(l17.sync, 10)}

### نقاط النهاية المبنيّة — \`git ls-tree origin/feat/api apps/api/src/routes/\`

${eps.length ? eps.map((e) => `- \`${e}\``).join('\n') : '- (لا نقاط نهاية مبنيّة بعد أو الفرع لا يحوي المسار)'}

### محتويات المستودع — من \`ls\`

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

// ── التنفيذ ──────────────────────────────────────────

const generated = buildGenerated();

if (process.argv.includes('--stdout')) {
  process.stdout.write(generated);
  process.exit(0);
}

const current = readFileSync(SKILL_PATH, 'utf8');
const updated = inject(current, generated);
const lines = updated.split('\n');

if (lines.length > MAX_LINES) {
  // نجمّع الأقسام (## أو ###) ونعدّ سطورها.
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
  console.error(`  السكيل مرجع لا وثيقة. أطول ثلاثة أقسام:`);
  for (const sec of sections.slice(0, 3)) {
    console.error(`    ${sec.count} سطراً — ${sec.title}`);
  }
  process.exit(1);
}

writeFileSync(SKILL_PATH, updated);
console.log(`[build-skill] ✓ docs/SKILL-mediakit.md (${lines.length} سطر · حد ${MAX_LINES})`);
