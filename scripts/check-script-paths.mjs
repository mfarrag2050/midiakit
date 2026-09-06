#!/usr/bin/env node
/**
 * SEC-1d — check-script-paths — يفحص أن كل مفتاح scripts يشير إلى ملف موجود.
 *
 * السياق: SEC-1c كشف أن main حمل `verify:tenant-isolation` يشير إلى
 * `scripts/verify-tenant-isolation.mjs` المحذوف منذ commit A4 (935c344).
 * لم يُكتشف لأنه ليس في سلسلة test. هذا الحارس يمنع تكرار ذلك.
 *
 * **النطاق:**
 *   • package.json الجذر
 *   • كل package.json تحت pnpm workspace (packages/*, apps/*)
 *   • لكل مفتاح في scripts:
 *     - إن كان يستدعي مسار ملف → تحقّق الوجود
 *     - إن كان يستدعي `pnpm --filter <pkg> <script>` → تحقّق أن
 *       <script> موجود في scripts للحزمة <pkg>
 *     - إن كان يستدعي أداة (tsc, vitest, next…) → تخطٍّ
 *
 * **قاعدة التمييز (المُعلَنة):**
 *   token يُعامَل كمسار ملف إن:
 *     (أ) بدأ بـ`./` (مسار shell صريح)، أو
 *     (ب) احتوى `/` و انتهى بامتداد معروف: .mjs .ts .js .mts .cjs .py
 *   كل شيء آخر (`tsc`, `vitest run`, `next dev`، أسماء أوامر
 *   بلا مسار) يُتخطّى بلا فحص. الأعلام (`--flag`، `-x`) تُتجاهَل.
 *
 * **`pnpm --filter <pkg> <script>` (توسيع 2026-09-07 على main):**
 *   السياق: A26 كشف أن `check:template-sync` كان في سلسلة test
 *   على feat/api منذ A13، وأُعلن ✓ في أربعة تقارير، **ولم يعمل
 *   قطّ** — السلسلة تستدعي
 *   `pnpm --filter @pf-mediakit/db check:template-sync` والمفتاح
 *   لم يكن موجوداً في `packages/db/package.json`. القاعدة القديمة
 *   («لا مسار ⇒ تخطٍّ») تركت هذا الصنف بلا حراسة.
 *
 *   الفحص الآن يستخرج كل `pnpm --filter <pkg> <script>`، يفتش عن
 *   `<pkg>` في workspace بحسب `name` في package.json، ويتحقّق أن
 *   `<script>` موجود في `scripts` تلك الحزمة. غياب الحزمة أو
 *   السكربت ⇒ فشل بذكر المفتاح والحزمة.
 *
 * **الاستثناء:** مسارات تبدأ بـ`./node_modules/` تُفحَص كأيّ ملف
 * (بعد pnpm install يجب أن توجد).
 *
 * الخروج: 0 إن كل المسارات موجودة، 1 مع قائمة المكسور.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// اقرأ pnpm-workspace.yaml بسيطاً (patterns فقط)
async function findWorkspacePackageJsons() {
  const wsPath = join(ROOT, 'pnpm-workspace.yaml');
  const wsText = await readFile(wsPath, 'utf8');
  const patterns = [];
  for (const line of wsText.split('\n')) {
    const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
    if (m && m[1]) patterns.push(m[1].trim());
  }

  const dirs = new Set();
  for (const p of patterns) {
    // ندعم نمطَي `packages/*` و `apps/*`
    const m = p.match(/^([^*]+)\*$/);
    if (!m) continue;
    const base = join(ROOT, m[1]);
    if (!existsSync(base)) continue;
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.add(join(base, entry.name));
    }
  }
  return [ROOT, ...dirs].filter((d) => existsSync(join(d, 'package.json')));
}

// استخراج مسارات الملفات من قيمة script (per القاعدة أعلاه).
const FILE_EXT_RE = /\.(mjs|ts|js|mts|cjs|py)$/i;

function extractFilePaths(scriptValue) {
  const tokens = scriptValue.split(/\s+/);
  const paths = [];
  for (const t of tokens) {
    if (!t) continue;
    if (t.startsWith('-')) continue;                          // flag
    if (t === '&&' || t === '||' || t === '|' || t === ';') continue;
    if (t.startsWith('./')) { paths.push(t); continue; }
    if (t.includes('/') && FILE_EXT_RE.test(t)) paths.push(t);
  }
  return paths;
}

// كل ظهور `pnpm --filter <pkg> <script>` في القيمة. نتعامل مع
// سلاسل مركّبة بـ`&&` و `||` بأن نلتقط كل مطابقة على حدة.
const PNPM_FILTER_RE = /\bpnpm\s+(?:run\s+)?--filter\s+(\S+)\s+(\S+)/g;

function extractPnpmFilterCalls(scriptValue) {
  const out = [];
  for (const m of scriptValue.matchAll(PNPM_FILTER_RE)) {
    const [, pkgName, scriptName] = m;
    // نتجاهل tokens الشل التي قد تتلوّث بها المطابقة
    if (['&&', '||', '|', ';'].includes(scriptName)) continue;
    out.push({ pkgName, scriptName });
  }
  return out;
}

// ── main ────────────────────────────────────────────────────

const pkgDirs = await findWorkspacePackageJsons();
console.log(`▶ SEC-1d check-script-paths`);
console.log(`  scan: ${pkgDirs.length} package.json (root + workspace)`);
console.log(`  file-path rule: starts-with './' OR (contains '/' AND ends with .mjs|.ts|.js|.mts|.cjs|.py)`);
console.log(`  pnpm --filter rule: <pkg> يُبحث في workspace بحسب name، <script> يجب أن يوجد في scripts`);
console.log(`  skipped: tsc · vitest · next · بلا مسار صريح ولا --filter`);

// نبني فهرس workspace: name → { dir, scripts }
const pkgIndex = new Map();
for (const dir of pkgDirs) {
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  if (pkg.name) {
    pkgIndex.set(pkg.name, { dir, scripts: pkg.scripts ?? {} });
  }
}

const broken = [];
let totalKeys = 0;
let totalPaths = 0;
let totalFilterCalls = 0;

for (const dir of pkgDirs) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const relPkg = relative(ROOT, pkgPath) || 'package.json';
  for (const [key, value] of Object.entries(scripts)) {
    totalKeys++;
    if (typeof value !== 'string') continue;

    // (1) مسارات ملفات
    const paths = extractFilePaths(value);
    for (const p of paths) {
      totalPaths++;
      const abs = resolve(dir, p);
      if (!existsSync(abs)) {
        broken.push({
          kind: 'file',
          pkg: relPkg, key, value,
          detail: `missing: ${relative(ROOT, abs)}`,
        });
      }
    }

    // (2) pnpm --filter <pkg> <script>
    const filterCalls = extractPnpmFilterCalls(value);
    for (const { pkgName, scriptName } of filterCalls) {
      totalFilterCalls++;
      const target = pkgIndex.get(pkgName);
      if (!target) {
        broken.push({
          kind: 'filter',
          pkg: relPkg, key, value,
          detail: `pnpm --filter ${pkgName}: الحزمة غير موجودة في workspace`,
        });
        continue;
      }
      if (!(scriptName in target.scripts)) {
        broken.push({
          kind: 'filter',
          pkg: relPkg, key, value,
          detail: `pnpm --filter ${pkgName}: السكربت "${scriptName}" غير موجود في scripts`,
        });
      }
    }
  }
}

console.log(`  scripts examined: ${totalKeys} · file paths extracted: ${totalPaths} · pnpm --filter calls: ${totalFilterCalls}`);

if (broken.length === 0) {
  console.log(`\n✓ check-script-paths PASSED — كل المفاتيح تشير إلى ملفات/سكربتات موجودة`);
  process.exit(0);
}

console.error(`\n✗ check-script-paths FAILED — ${broken.length} مخالفة/مخالفات:`);
for (const b of broken) {
  console.error(`  ${b.pkg} · scripts["${b.key}"] [${b.kind}]`);
  console.error(`    value: ${b.value}`);
  console.error(`    ${b.detail}`);
}
process.exit(1);
