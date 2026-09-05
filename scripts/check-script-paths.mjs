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
 *     - إن كان يستدعي أداة (tsc, vitest, pnpm --filter, next…) → تخطٍّ
 *
 * **قاعدة التمييز (المُعلَنة):**
 *   token يُعامَل كمسار ملف إن:
 *     (أ) بدأ بـ`./` (مسار shell صريح)، أو
 *     (ب) احتوى `/` و انتهى بامتداد معروف: .mjs .ts .js .mts .cjs .py
 *   كل شيء آخر (`tsc`, `vitest run`, `pnpm --filter @x/y sub`,
 *   `next dev`, أسماء أوامر بلا مسار) يُتخطّى بلا فحص.
 *   الأعلام (`--flag`، `-x`) تُتجاهَل دائماً.
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

// ── main ────────────────────────────────────────────────────

const pkgDirs = await findWorkspacePackageJsons();
console.log(`▶ SEC-1d check-script-paths`);
console.log(`  scan: ${pkgDirs.length} package.json (root + workspace)`);
console.log(`  file-path rule: starts-with './' OR (contains '/' AND ends with .mjs|.ts|.js|.mts|.cjs|.py)`);
console.log(`  skipped: tsc · vitest · pnpm --filter · next · بلا مسار صريح`);

const broken = [];
let totalKeys = 0;
let totalPaths = 0;

for (const dir of pkgDirs) {
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const relPkg = relative(ROOT, pkgPath) || 'package.json';
  for (const [key, value] of Object.entries(scripts)) {
    totalKeys++;
    if (typeof value !== 'string') continue;
    const paths = extractFilePaths(value);
    for (const p of paths) {
      totalPaths++;
      const abs = resolve(dir, p);
      if (!existsSync(abs)) {
        broken.push({ pkg: relPkg, key, value, path: p, abs: relative(ROOT, abs) });
      }
    }
  }
}

console.log(`  scripts examined: ${totalKeys} · file paths extracted: ${totalPaths}`);

if (broken.length === 0) {
  console.log(`\n✓ check-script-paths PASSED — كل المفاتيح تشير إلى ملفات موجودة`);
  process.exit(0);
}

console.error(`\n✗ check-script-paths FAILED — ${broken.length} مفتاح/مفاتيح تشير إلى ملفات غير موجودة:`);
for (const b of broken) {
  console.error(`  ${b.pkg} · scripts["${b.key}"]`);
  console.error(`    value: ${b.value}`);
  console.error(`    missing: ${b.abs}`);
}
process.exit(1);
