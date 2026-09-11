// scripts/bundle-docs — يجمع كل docs/*.md + PHASES.md + PHASES-api.md +
// PHASES-studio.md في docs/BUNDLE.md واحد.
//
// **الغرض (تذكرة DOCS-BUNDLE 2026-09-07):** Opus في واجهة Claude يقرأ
// نسخاً مجمَّدة رُفعت أول يوم — PHASES.md عنده 348 سطراً وعلى main
// 1394. الحزمة تُرفَع بجانب السكيل ليقرأ من مصدر حيّ عند الحاجة.
//
// **قاعدة صارمة (نفس نمط build-skill):** أيّ ملف يتعذّر قراءته ⇒
// SectionReadError باسم القسم والأمر الفاشل. لا نصّ بديل، لا تخطٍّ
// صامت.
//
// **لا حدّ على الحجم:** الحزمة مرجع لا سكيل. تُعلَن كتلتها في التقرير،
// وعند تجاوز 300 KB يُطبَع تحذير (لا فشل).
//
// **الأوضاع:**
//   node scripts/bundle-docs.mjs             → يكتب docs/BUNDLE.md
//   node scripts/bundle-docs.mjs --stdout    → يطبع المخرَج فقط

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_PATH = join(ROOT, 'docs/BUNDLE.md');

class SectionReadError extends Error {
  constructor(section, cmd, cause) {
    super(`[bundle-docs] ✗ فشل قراءة القسم «${section}»\n  الأمر: ${cmd}\n  السبب: ${cause}`);
    this.section = section;
    this.cmd = cmd;
  }
}

function shOrFail(section, cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new SectionReadError(section, cmd, stderr || 'خرج بحالة غير صفرية');
  }
}

function readFileOrFail(section, absPath) {
  try {
    return readFileSync(absPath, 'utf8');
  } catch (err) {
    throw new SectionReadError(section, `readFileSync ${absPath}`, err.message);
  }
}

function hash12(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function build() {
  // (1) docs/*.md عدا BUNDLE.md نفسه
  const docsDir = join(ROOT, 'docs');
  let docsFiles;
  try {
    docsFiles = readdirSync(docsDir)
      .filter((f) => f.endsWith('.md') && f !== 'BUNDLE.md')
      .sort();
  } catch (err) {
    throw new SectionReadError('docs/', `readdirSync docs/`, err.message);
  }

  const sources = [];
  for (const f of docsFiles) {
    sources.push({
      path: `docs/${f}`,
      content: readFileOrFail(`docs/${f}`, join(docsDir, f)),
      source: 'local',
    });
  }

  // (2) PHASES.md و CLAUDE.md محلياً
  //
  // CLAUDE.md كان مرفوعاً إلى مشروع Opus نسخةً مستقلّة قديمة (31 أغسطس
  // — «المرحلة 0، لم يُكتب كود منتج بعد»)، ثم حُذفت. الحزمة تحمله لئلا
  // يبقى غائباً أو متأخّراً (تذكرة PUBLISH-1 · العيب الثالث).
  //
  // 00-README.md **لا يُضاف** — دليل إعداد لإعداد انتهى وحالته خاطئة
  // (قرار التذكرة).
  sources.push({
    path: 'PHASES.md',
    content: readFileOrFail('PHASES.md', join(ROOT, 'PHASES.md')),
    source: 'local (main)',
  });
  sources.push({
    path: 'CLAUDE.md',
    content: readFileOrFail('CLAUDE.md', join(ROOT, 'CLAUDE.md')),
    source: 'local (main)',
  });

  // (3) PHASES-api.md و PHASES-studio.md من origin/feat/*
  sources.push({
    path: 'PHASES-api.md',
    content: shOrFail('PHASES-api.md (feat/api)', 'git show origin/feat/api:PHASES-api.md'),
    source: 'git show origin/feat/api',
  });
  sources.push({
    path: 'PHASES-studio.md',
    content: shOrFail('PHASES-studio.md (feat/studio)', 'git show origin/feat/studio:PHASES-studio.md'),
    source: 'git show origin/feat/studio',
  });

  // ميتا
  const head = shOrFail('git HEAD', 'git rev-parse --short HEAD').trim();
  const apiHead = shOrFail('git origin/feat/api HEAD', 'git rev-parse --short origin/feat/api').trim();
  const studioHead = shOrFail('git origin/feat/studio HEAD', 'git rev-parse --short origin/feat/studio').trim();
  const date = new Date().toISOString().slice(0, 10);

  // بناء المخرَج
  let out = `# BUNDLE — حزمة الوثائق الحيّة

> **الغرض:** مصدر واحد لكل وثائق المشروع، يُرفَع بجانب
> \`docs/SKILL-mediakit.md\` ليقرأه Opus في المحادثات التي يحتاج فيها
> إلى العمق الكامل. السكيل موجز يُقرأ في كل جلسة، والحزمة مرجع يُقرأ
> عند الحاجة.
>
> **يُولَّد بـ\`pnpm docs:bundle\`.** لا يُحرَّر يدوياً. يُرفَع مع
> السكيل معاً — رفع أحدهما دون الآخر يترك Opus بوثائق قديمة.
>
> **تاريخ التوليد:** ${date}
> **HEAD (main):** \`${head}\`
> **HEAD (origin/feat/api):** \`${apiHead}\`
> **HEAD (origin/feat/studio):** \`${studioHead}\`

## الفهرس

| الملف | السطور | البصمة (SHA-256:12) | المصدر |
|---|---:|:---|:---|
`;

  for (const src of sources) {
    const lineCount = src.content.split('\n').length;
    const sig = hash12(src.content);
    out += `| \`${src.path}\` | ${lineCount} | \`${sig}\` | ${src.source} |\n`;
  }

  out += `\n---\n\n`;

  const SEP = '═'.repeat(63);
  for (const src of sources) {
    out += `${SEP}\n# ${src.path}\n${SEP}\n\n${src.content}\n`;
  }

  return { out, count: sources.length };
}

let result;
try {
  result = build();
} catch (err) {
  if (err instanceof SectionReadError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

if (process.argv.includes('--stdout')) {
  process.stdout.write(result.out, (err) => process.exit(err ? 1 : 0));
} else {
  writeFileSync(BUNDLE_PATH, result.out);
  const bytes = Buffer.byteLength(result.out, 'utf8');
  const kb = (bytes / 1024).toFixed(1);
  const totalLines = result.out.split('\n').length;
  console.log(`[bundle-docs] ✓ docs/BUNDLE.md · ${result.count} ملف · ${totalLines} سطر · ${kb} KB`);
  if (bytes > 300 * 1024) {
    console.log(`  ⚠ حجم الحزمة ${kb} KB يتجاوز 300 KB — إعلان (لا فشل).`);
  }
}
