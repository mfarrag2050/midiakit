#!/usr/bin/env node
/**
 * verify-all — يشغّل كل بوابات G-P4 ويطبع جدولاً موحّداً.
 *
 * قرار (2026-09-08): يُترك يدوياً، لا يُربط بـpnpm test. الأسباب:
 *   - يستغرق ~1-2 دقيقة (19 بوابة × spin up fastify)
 *   - يحتاج Postgres + MinIO + Redis + الميني قيد التشغيل
 *   - pnpm test الحالي يفحص الوحدة (283 اختبار vitest) + الحرّاس
 *
 * الاستعمال: pnpm verify:all
 * المخرج: جدول (name · total · fail · state) + Exit code = عدد البوابات
 * التي فشلت (0 = كل شيء أخضر).
 *
 * كل verify:* يجب أن يطبع سطراً بشكل ثابت:
 *   [verify-summary] <name>: <total> فحصاً · <failures> إخفاقاً
 * verify-all يقرأ هذا السطر لبناء الجدول. سكربت بلا هذا السطر يُعلَن
 * "no-summary" — نافذة على أن نمطاً قديماً لم يُهاجَر.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GATES = [
  'tenant-isolation', 'auth', 'brand-kits', 'tenant', 'users',
  'assets', 'templates', 'projects', 'workflows', 'renders',
  'revisions', 'plans', 'control-plane', 'a18-5', 'a18-6',
  'a21', 'a22', 'a23', 'bk-numerals', 'a24', 'a25', 'a28', 'debt1', 'limits1',
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, ...opts });
    let stdout = '', stderr = '';
    p.stdout.on('data', (c) => { stdout += c.toString(); });
    p.stderr.on('data', (c) => { stderr += c.toString(); });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  console.log(`▶ verify:all — ${GATES.length} بوابة`);
  const results = [];
  for (const gate of GATES) {
    process.stdout.write(`  ${gate.padEnd(22, ' ')}`);
    const { code, stdout, stderr } = await run('pnpm', [`verify:${gate}`]);
    const out = stdout + stderr;
    // شكلان مقبولان:
    //   [verify-summary] X: N فحصاً · M إخفاقاً  (full — يحسب total من الرقم)
    //   [verify-summary] X: M إخفاقاً            (simple — total من ✓/✗ في stdout)
    const fullMatch = out.match(/\[verify-summary\]\s+([^:]+):\s+(\d+)\s+فحصاً\s+·\s+(\d+)\s+إخفاقاً/);
    const simpleMatch = out.match(/\[verify-summary\]\s+([^:]+):\s+(\d+)\s+إخفاقاً/);
    if (fullMatch) {
      const total = Number(fullMatch[2]);
      const fails = Number(fullMatch[3]);
      const state = fails === 0 ? '✓' : '✗';
      results.push({ gate, total, fails, code, state, hasSummary: true });
      console.log(`  total=${String(total).padStart(3)}  fail=${String(fails).padStart(3)}  ${state}`);
    } else if (simpleMatch) {
      const fails = Number(simpleMatch[2]);
      const passes = (out.match(/^\s+✓/gm) || []).length;
      const total = passes + fails;
      const state = fails === 0 ? '✓' : '✗';
      results.push({ gate, total, fails, code, state, hasSummary: true });
      console.log(`  total=${String(total).padStart(3)}  fail=${String(fails).padStart(3)}  ${state}`);
    } else {
      // fallback: عدّ ✓/✗ من السطور (النمط القديم قبل L-53)
      const passes = (out.match(/^\s+✓/gm) || []).length;
      const fails  = (out.match(/^\s+✗/gm) || []).length;
      const total = passes + fails;
      const state = fails === 0 ? '✓' : '✗';
      results.push({ gate, total, fails, code, state, hasSummary: false });
      console.log(`  total=${String(total).padStart(3)}  fail=${String(fails).padStart(3)}  ${state}  (no-summary)`);
    }
  }

  console.log('\n── ملخّص ──');
  const failedGates = results.filter((r) => r.fails > 0);
  const missingSummary = results.filter((r) => !r.hasSummary);
  if (failedGates.length === 0) console.log(`✓ ${results.length}/${results.length} بوابة خضراء`);
  else {
    console.log(`✗ ${failedGates.length}/${results.length} بوابة فيها إخفاقات:`);
    for (const r of failedGates) console.log(`  ${r.gate}: ${r.fails} إخفاق`);
  }
  if (missingSummary.length > 0) {
    console.log(`\n⚠  ${missingSummary.length} بوابة لم تُهاجَر إلى [verify-summary] بعد:`);
    for (const r of missingSummary) console.log(`  ${r.gate}`);
  }
  process.exit(failedGates.length);
}

main().catch((e) => { console.error(e); process.exit(2); });
