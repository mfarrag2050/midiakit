#!/usr/bin/env node
/**
 * scripts/ci-steps-diff.mjs — يقارن خطوات ci.yml بما يشغّله bin/mk-ci.
 *
 * المخرج: قائمة الخطوات التي في ci.yml ولا يشغّلها mk-ci ("لم يُقَس هنا").
 *
 * القاعدة (250-A-GATE-THAT-NAMES-ITS-BLIND-SPOTS §١):
 *   البوّابة تُعلن ما لا تقيسه · قبل أيّ إصلاح آخر. القائمة مشتقّة من
 *   ci.yml نفسه لا من يدي — قائمةٌ مكتوبةٌ بيدي تشيخ بصمت.
 *
 * الاستعمال:
 *   node scripts/ci-steps-diff.mjs               → يطبع القائمة
 *   node scripts/ci-steps-diff.mjs --check-count → يفشل إن تغيّر عدد خطوات ci.yml
 *                                                 (يُشغَّل من pnpm test لاحقاً كضامن)
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CI_YML = resolve(ROOT, '.github/workflows/ci.yml');

// عدد الخطوات المُعلَن — يُحدَّث يدوياً حين تُضاف/تُحذف خطوة من ci.yml.
// الغرض: يفشل السكربت إن تغيّر العدد بلا تحديث الجدول أدناه، فيجبرنا على
// مراجعة إعلان العمى.
const EXPECTED_CI_STEP_COUNT = 11;

// ما يشغّله bin/mk-ci — قائمة مكتوبة يدويّاً بأسماء الخطوات كما تظهر في
// ci.yml (تُقارَن بـstring includes). كلّ خطوة هنا يعرف mk-ci كيف يشغّلها
// أو يُحاكيها بلا خدمة خارجيّة.
const MK_CI_COVERS = [
  'apt install',                           // ✓ (داخل bash -c في bin/mk-ci)
  'corepack pnpm',                          // ✓
  'تخبئة متجر pnpm',                        // ~ (node_modules volume — بديل)
  'pnpm install (frozen)',                  // ✓
  'pnpm test (31 بوابة',                    // ✓
];

// خطوات تخصّ CI بطبيعتها (checkout · safe.directory · post-steps) — تُستثنى
// من «العمى» لأنّها لا تعنيه على شجرة محلّيّة.
const CI_ONLY_BY_NATURE = [
  'Checkout',
  'git safe.directory',
];

function extractStepNames(yamlText) {
  const names = [];
  const re = /^\s+-\s+name:\s*(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(yamlText)) !== null) {
    let name = m[1].trim();
    // إن مُغلَّف بـ" أو ' — أزلها
    if ((name.startsWith('"') && name.endsWith('"')) ||
        (name.startsWith("'") && name.endsWith("'"))) {
      name = name.slice(1, -1);
    }
    names.push(name);
  }
  return names;
}

function classifyStep(name) {
  if (CI_ONLY_BY_NATURE.some(p => name.includes(p))) return 'ci-only';
  if (MK_CI_COVERS.some(p => name.includes(p))) return 'covered';
  return 'blind';
}

async function main() {
  const args = process.argv.slice(2);
  const checkCountOnly = args.includes('--check-count');

  const yaml = await readFile(CI_YML, 'utf8');
  const steps = extractStepNames(yaml);

  if (steps.length !== EXPECTED_CI_STEP_COUNT) {
    console.error(`✗ ci.yml يحوي ${steps.length} خطوة · المتوقّع ${EXPECTED_CI_STEP_COUNT}.`);
    console.error(`  أُضيفت/حُذفت خطوة بلا تحديث EXPECTED_CI_STEP_COUNT + MK_CI_COVERS`);
    console.error(`  في scripts/ci-steps-diff.mjs. راجع القائمة وأعِد التصنيف.`);
    process.exit(1);
  }

  if (checkCountOnly) {
    console.log(`[ci-steps-diff] ✓ عدد خطوات ci.yml = ${EXPECTED_CI_STEP_COUNT} (كما هو مسجَّل)`);
    return;
  }

  const blind = [];
  const covered = [];
  const ciOnly = [];
  for (const name of steps) {
    const c = classifyStep(name);
    if (c === 'blind') blind.push(name);
    else if (c === 'covered') covered.push(name);
    else ciOnly.push(name);
  }

  // مخرج بالصيغة التي يستهلكها bin/mk-ci في ختامه.
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ما لم يُقَس هنا (bin/mk-ci) مقارنةً بـci.yml:');
  console.log('════════════════════════════════════════════════════════════');
  if (blind.length === 0) {
    console.log('  ✓ لا فجوة — mk-ci يشغّل أو يُحاكي كلّ خطوات ci.yml');
    console.log('    (باستثناء خطوات CI بطبيعتها: Checkout · safe.directory)');
  } else {
    for (const name of blind) {
      console.log(`  · لم يُقَس هنا: ${name}`);
    }
    console.log('');
    console.log(`  ${blind.length} خطوة من ${steps.length} في ci.yml لا يشغّلها mk-ci.`);
    console.log('  «أخضر» على bin/mk-ci = pnpm test فقط — لا كامل CI.');
  }
  console.log('');
  console.log(`  covered: ${covered.length} · blind: ${blind.length} · ci-only-by-nature: ${ciOnly.length}`);
  console.log('  المصدر: .github/workflows/ci.yml (مشتقّ آلياً · لا يُكتَب يدوياً).');
  console.log('  الجدول في scripts/ci-steps-diff.mjs — MK_CI_COVERS يحدَّث حين يوسّع mk-ci تغطيته.');
}

main().catch(err => {
  console.error(`✗ ci-steps-diff فشل: ${err.message}`);
  process.exit(2);
});
