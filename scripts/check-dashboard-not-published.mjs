#!/usr/bin/env node
// scripts/check-dashboard-not-published.mjs
// حارس D1 — يمنع apps/dashboard من الدخول في أيّ بناء إنتاجي.
// السياق: قرار المالك 2026-09-07 · apps/dashboard/DEV-ONLY.md.
//
// **قواعد الفحص (كلها ثابتة — grep + JSON، لا شيء يُشغَّل من كود اللوحة):**
//   1. apps/dashboard/DEV-ONLY.md موجود.
//   2. apps/dashboard/package.json:
//        - scripts.dev إلزامي · يحوي "-H 127.0.0.1"
//        - scripts.start (إن وُجد) يحوي "-H 127.0.0.1"
//        - scripts.build (إن وُجد) مشروط بعلم DEV_ONLY_BUILD
//   3. لا ملف نشر يذكر "apps/dashboard":
//        Dockerfile* · docker-compose*.y[a]ml · compose*.y[a]ml
//        .github/workflows/*.y[a]ml · fly.toml · vercel.json ·
//        netlify.toml · أيّ ملف تحت infra/ أو deploy/
//
// **اختبار الوجود (L-46):** أزل "-H 127.0.0.1" من scripts.dev ⇒ الفحص
// يفشل. أعده ⇒ يمرّ. يُوثَّق في تقرير D1.
//
// **مصدر النطاق:** git ls-files — يعزل الفحص عن node_modules/out/.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const failures = [];
const fail = (msg) => failures.push(msg);

// ── 1. DEV-ONLY.md موجود ─────────────────────────────────────
const DEV_ONLY = 'apps/dashboard/DEV-ONLY.md';
if (!existsSync(join(ROOT, DEV_ONLY))) {
  fail(`${DEV_ONLY} غير موجود — التصريح إلزامي لأداة محلّية`);
}

// ── 2. package.json ────────────────────────────────────────
const PKG = 'apps/dashboard/package.json';
if (!existsSync(join(ROOT, PKG))) {
  fail(`${PKG} غير موجود`);
} else {
  const pkg = JSON.parse(readFileSync(join(ROOT, PKG), 'utf8'));
  const scripts = pkg.scripts ?? {};

  if (!scripts.dev) {
    fail(`${PKG}: scripts.dev مفقود`);
  } else if (!scripts.dev.includes('-H 127.0.0.1')) {
    fail(`${PKG}: scripts.dev يجب أن يحوي "-H 127.0.0.1" — القيمة: ${JSON.stringify(scripts.dev)}`);
  }

  if (scripts.start && !scripts.start.includes('-H 127.0.0.1')) {
    fail(`${PKG}: scripts.start يجب أن يحوي "-H 127.0.0.1" — القيمة: ${JSON.stringify(scripts.start)}`);
  }

  if (scripts.build && !scripts.build.includes('DEV_ONLY_BUILD')) {
    fail(`${PKG}: scripts.build يجب أن يكون مشروطاً بعلم DEV_ONLY_BUILD — القيمة: ${JSON.stringify(scripts.build)}`);
  }
}

// ── 3. لا إعداد نشر يذكر apps/dashboard ─────────────────────
const DEPLOY_PATTERNS = [
  /(^|\/)Dockerfile(\.\w+)?$/,
  /(^|\/)docker-compose[^/]*\.ya?ml$/,
  /(^|\/)compose[^/]*\.ya?ml$/,
  /^\.github\/workflows\/.*\.ya?ml$/,
  /(^|\/)fly\.toml$/,
  /(^|\/)vercel\.json$/,
  /(^|\/)netlify\.toml$/,
  /^infra\//,
  /^deploy\//,
];

let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch (err) {
  fail(`فشل استدعاء git ls-files: ${String(err.message ?? err)}`);
}

const deployFiles = tracked.filter((f) => DEPLOY_PATTERNS.some((re) => re.test(f)));
for (const f of deployFiles) {
  const content = readFileSync(join(ROOT, f), 'utf8');
  if (content.includes('apps/dashboard')) {
    fail(`إعداد نشر ${f} يذكر apps/dashboard — اللوحة أداة تطوير محلّية (راجع ${DEV_ONLY})`);
  }
}

// ── إخراج ─────────────────────────────────────────────────
console.log(`▶ check-dashboard-not-published`);
console.log(`  DEV-ONLY.md: ${existsSync(join(ROOT, DEV_ONLY)) ? '✓' : '✗'}`);
console.log(`  package.json scripts checked: dev · start · build`);
console.log(`  deploy configs scanned: ${deployFiles.length}${deployFiles.length ? ` (${deployFiles.join(', ')})` : ''}`);

if (failures.length === 0) {
  console.log(`\n✓ check-dashboard-not-published PASSED — 0 إخفاق`);
  process.exit(0);
}
console.error(`\n✗ check-dashboard-not-published FAILED — ${failures.length} إخفاق:`);
for (const m of failures) console.error(`  · ${m}`);
process.exit(1);
