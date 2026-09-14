#!/usr/bin/env node
/**
 * scripts/write-ci-status.mjs — يكتب حال CI في claude/reports/_ci.md.
 *
 * قاعدة 250b · «العين التي في أمرٍ تفاعليٍّ لن تصل مرصدي»:
 *   المرصد يقرأ ملفّات لا يشغّل أوامر. `bin/mk-runbook status` عرضٌ
 *   للإنسان; هذا السكربت يكتب المصدر — يُشغَّل دورياً (mk-watch-core.sh)
 *   بلا تدخّل بشريّ.
 *
 * ما يكتبه لكلّ فرع (main, feat/ci):
 *   1. خلاصة آخر جريان (نجاح · فشل · لا جريان).
 *   2. عدد الدفعات المتتالية بلا خضرة (الرقم الذي كشف عمر الأحمر 51 ساعة).
 *   3. وقت آخر خضرة (UTC).
 *   4. سطر «لا بوّابة GitHub على main» ما دامت .github/workflows/ خارجها.
 *
 * قاعدة العمى الصريح:
 *   إن تعذّرت القراءة (gh غير مصادق · لا شبكة · rate limit) فاكتب السبب
 *   صريحاً + احتفظ بختم الوقت. «ملفّ قديم صامت أخطر من ملفّ يقول إنّه أعمى».
 *
 * الاستعمال:
 *   node scripts/write-ci-status.mjs
 *
 * الخرج: claude/reports/_ci.md (يُنشأ أو يُستبدَل ذرّياً · write-then-rename).
 * exit 0 دائماً (فشل القياس ليس فشل السكربت — يُسجَّل في الملفّ).
 */

import { execFile } from 'node:child_process';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// _ci.md بجوار _panes.md و _stale.md في شجرة المرصد (pf-mediakit)، لا في
// شجرة العمل (pf-mediakit-dash). يمكن تجاوزه بـMK_CI_STATUS_OUT لأغراض اختبار.
const OUT_PATH = process.env.MK_CI_STATUS_OUT
  || '/Users/mdervis/MediaKit/pf-mediakit/claude/reports/_ci.md';
const OUT_TMP  = OUT_PATH + '.tmp';

const BRANCHES = ['main', 'feat/ci'];
const execFileP = promisify(execFile);

async function gh(...args) {
  try {
    const { stdout } = await execFileP('gh', args, { maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, error: err.message.split('\n')[0].slice(0, 200) };
  }
}

async function checkGhAuth() {
  const r = await gh('auth', 'status');
  return r.ok;
}

async function fetchBranchStatus(branch) {
  const runs = await gh('run', 'list', '--branch', branch, '--limit', '50',
                        '--json', 'conclusion,status,displayTitle,createdAt,databaseId');
  if (!runs.ok) return { branch, blind: `gh فشل: ${runs.error}` };
  let list;
  try { list = JSON.parse(runs.stdout); }
  catch (e) { return { branch, blind: `JSON فاسد: ${e.message}` }; }

  if (list.length === 0) return { branch, empty: true };

  const latest = list[0];
  let noGreen = 0;
  let lastGreenAt = null;
  for (const r of list) {
    if (r.conclusion === 'success') { lastGreenAt = r.createdAt; break; }
    noGreen++;
  }

  return {
    branch,
    latest: {
      conclusion: latest.conclusion || latest.status || '?',
      status: latest.status,
      id: latest.databaseId,
      title: (latest.displayTitle || '').slice(0, 100),
      createdAt: latest.createdAt,
    },
    noGreen,
    lastGreenAt,
    scannedCount: list.length,
  };
}

function fmtDelta(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const hours = (now - then) / 3600000;
  if (hours < 1) return ` (~${Math.round(hours * 60)} دقيقة)`;
  if (hours < 48) return ` (~${hours.toFixed(1)} ساعة)`;
  return ` (~${(hours / 24).toFixed(1)} يوم)`;
}

function renderBranch(s) {
  if (s.blind) {
    return `### \`${s.branch}\`\n\n- ⚠  **تعذّر القياس:** ${s.blind}\n`;
  }
  if (s.empty) {
    return `### \`${s.branch}\`\n\n- ⚠  **لا بوّابة GitHub على ${s.branch}** — لا workflow يعمل على هذا الفرع (250b §4).\n`;
  }
  const marker = { success:'✓', failure:'✗', cancelled:'⚠', in_progress:'⧗', queued:'⧗' }[s.latest.conclusion] || '?';
  const lines = [];
  lines.push(`### \`${s.branch}\`\n`);
  lines.push(`- **آخر جريان:** ${marker} \`${s.latest.conclusion}\` · id \`${s.latest.id}\`${fmtDelta(s.latest.createdAt)}`);
  lines.push(`  - العنوان: «${s.latest.title}»`);
  lines.push(`- **دفعات متتالية بلا خضرة:** **${s.noGreen}** (من ${s.scannedCount} فحصت)`);
  if (s.lastGreenAt) {
    lines.push(`- **آخر خضرة:** ${s.lastGreenAt}${fmtDelta(s.lastGreenAt)}`);
  } else if (s.scannedCount > 0) {
    lines.push(`- **آخر خضرة:** لا نجاح في آخر ${s.scannedCount} دفعة (قد يكون الأخضر خارج النافذة)`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const stamp = new Date().toISOString();
  const header = [
    '# _ci.md — حال GitHub CI · مصدر لمرصد Opus و `mk-runbook status`',
    '',
    `**آخر تحديث:** \`${stamp}\` (UTC)`,
    '**كاتبه:** `scripts/write-ci-status.mjs` (تشغيل دوريّ من `mk-watch-core.sh`)',
    '**قاعدة العمى:** إن تعذّر القياس · السبب مكتوب هنا · لا ملفّ قديم صامت.',
    '**قاعدة العدّ (240):** «ما يبقى أحمر يوماً كاملاً يصير غير مرئيّ» — عدد الدفعات بلا خضرة هنا لا في التوقّع.',
    '',
    '---',
    '',
  ];

  const ghOk = await checkGhAuth();
  if (!ghOk) {
    const body = [
      ...header,
      '## ⚠ تعذّر القياس',
      '',
      '`gh auth status` فشل — لا يمكن قراءة GitHub.',
      '',
      '**الحلّ:** شغّل `gh auth login` بيدك.',
      '',
      '**لا فحص لأيّ فرع في هذا الملفّ.** الطابع الزمنيّ أعلاه يُظهر متى حدثت الحال — إن كان قديماً فالمرصد أعمى.',
    ].join('\n') + '\n';
    await mkdir(dirname(OUT_TMP), { recursive: true });
    await writeFile(OUT_TMP, body, 'utf8');
    await rename(OUT_TMP, OUT_PATH);
    console.log(`[write-ci-status] ✗ gh غير مصادق — كتبتُ عمى صريح في ${OUT_PATH}`);
    return;
  }

  const parts = [...header];
  for (const branch of BRANCHES) {
    const s = await fetchBranchStatus(branch);
    parts.push(renderBranch(s));
    parts.push('');
  }

  parts.push('---');
  parts.push('');
  parts.push('**كيف يُقرَأ:**');
  parts.push('- ✓ `success` = خضراء الآن.');
  parts.push('- ✗ `failure` مع «دفعات متتالية بلا خضرة» = **الرقم يقول عمر الأحمر**، لا اللون وحده.');
  parts.push('- ⚠ «لا بوّابة GitHub» = فرع بلا workflow — حقيقة تُرى كلّ دورة حتّى تُصلَح.');
  parts.push('- ⚠ «تعذّر القياس» = المرصد أعمى · الوقت في الرأس يقول متى.');
  parts.push('');

  await mkdir(dirname(OUT_TMP), { recursive: true });
  await writeFile(OUT_TMP, parts.join('\n'), 'utf8');
  await rename(OUT_TMP, OUT_PATH);
  console.log(`[write-ci-status] ✓ كُتب ${OUT_PATH} · ${BRANCHES.length} فرع`);
}

main().catch(err => {
  // فشل غير متوقّع — نكتب ذلك بدل الصمت
  const stamp = new Date().toISOString();
  const body = `# _ci.md — تعذّر القياس\n\n**آخر تحديث:** \`${stamp}\` (UTC)\n\n**خطأ غير متوقّع في scripts/write-ci-status.mjs:**\n\n\`\`\`\n${err.message}\n\`\`\`\n`;
  writeFile(OUT_PATH, body, 'utf8').catch(() => {});
  console.error(`[write-ci-status] ✗ ${err.message}`);
  // exit 0 دائماً — السكربت مسؤول عن كتابة الملفّ، لا عن نجاح gh.
  process.exit(0);
});
