// verify-snapshot — يقارن مخرجات المعاينة الحالية بلقطات ذهبية
// محفوظة في `snapshots/` و `snapshots-semantic/`. يحمي من تغيّر أنبوب
// الرندر عرَضاً.
//
// **الاستخدام:** `pnpm verify:snapshot`
//   يشغّل preview مرتين لكل هوية (semantic=off ثم semantic=on)، ثم
//   يقارن كل ملف في `out/nosemantic/` مع `snapshots/`، وكل ملف في
//   `out/semantic/` مع `snapshots-semantic/`. المجموع: 24 مقارنة
//   (6 قوالب × 2 هويتين × 2 وضعَي دلالي).
//
// **المرجعان:**
//   • `snapshots/` = enabled=false — التوافق الخلفي (قبل الجزء ب-2).
//   • `snapshots-semantic/` = enabled=true + ExtendedLexicon — الافتراضي الحالي.
//
// **متى يفشل:**
//   • renderFrame أنتج شيئاً مختلفاً عن اللقطة (رسم جديد، خلل فادح).
//   • تغيّر خفي في skia-canvas أو دالة طبقة أو الهوية.
//
// **متى يُحدَّث المرجع:** بعد قرار مالك واضح بتحسين المخرج — تُنسَخ
// المخرجات من `out/<subdir>/` إلى المجلد المرجعي المقابل، ويوثَّق السبب
// في PHASES.md.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BRANDS = ['default', 'client-demo'];
const TEMPLATES = ['breaking', 'card_centered', 'card_bottom', 'card_kicker', 'reel', 'plain'];

// اسم الملف: template=breaking ⇒ preview-<brand>.png، الباقي ⇒ preview-<brand>-<tpl-with-dashes>.png
const filenameFor = (brand, tpl) =>
  tpl === 'breaking'
    ? `preview-${brand}.png`
    : `preview-${brand}-${tpl.replace(/_/g, '-')}.png`;

// (١) تجديد المخرجات — مرتين لكل هوية (off ثم on)
for (const brand of BRANDS) {
  for (const semantic of ['off', 'on']) {
    const result = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        join(ROOT, 'scripts/preview.mjs'),
        `--brand=${brand}`,
        '--template=all',
        `--semantic=${semantic}`,
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' }
    );
    if (result.status !== 0) {
      console.error(`[verify-snapshot] فشل تشغيل preview للهوية ${brand} (semantic=${semantic})`);
      process.exit(1);
    }
  }
}

// (٢) المقارنة البايتية — لكل مجموعة (subdir + مجلد مرجعي)
const modes = [
  { outSubdir: 'nosemantic', refDir: 'snapshots', label: 'nosemantic' },
  { outSubdir: 'semantic', refDir: 'snapshots-semantic', label: 'semantic' },
];

const summary = [];
let totalFailures = 0;
for (const mode of modes) {
  const OUT = join(ROOT, 'out', mode.outSubdir);
  const SNAP = join(ROOT, mode.refDir);
  let failures = 0;
  let passed = 0;
  for (const brand of BRANDS) {
    for (const tpl of TEMPLATES) {
      const name = filenameFor(brand, tpl);
      const actualPath = join(OUT, name);
      const expectedPath = join(SNAP, name);
      if (!existsSync(expectedPath)) {
        console.error(
          `[verify-snapshot:${mode.label}] لقطة مفقودة: ${mode.refDir}/${name} — إن كان هذا مقصوداً، انسخ من out/${mode.outSubdir}/ ووثّق`
        );
        failures++;
        continue;
      }
      const [actual, expected] = await Promise.all([
        readFile(actualPath),
        readFile(expectedPath),
      ]);
      if (actual.length !== expected.length || !actual.equals(expected)) {
        console.error(
          `[verify-snapshot:${mode.label}] ✗ ${name} — فروق (فعلي=${actual.length}b متوقّع=${expected.length}b)`
        );
        failures++;
      } else {
        passed++;
      }
    }
  }
  summary.push({ label: mode.label, passed, failures, total: BRANDS.length * TEMPLATES.length });
  totalFailures += failures;
}

console.log('\n[verify-snapshot] النتائج:');
for (const s of summary) {
  console.log(`  ${s.label.padEnd(11)} ${s.passed} مطابقة · ${s.failures} إخفاق · من ${s.total} لقطة`);
}
if (totalFailures > 0) {
  console.error('راجع الفروق البصرية قبل تحديث المرجع.');
  process.exit(1);
}
