// verify-snapshot — يقارن مخرجات المعاينة الحالية بلقطات ذهبية
// محفوظة في `snapshots/`. يحمي من تغيّر أنبوب الرندر عرَضاً.
//
// **الاستخدام:** `pnpm verify:snapshot`
//   يشغّل preview لكل هوية × كل قالب، ثم يقارن كل `preview-<brand>[-<tpl>].png`
//   بايت-بايت مع نظيره في `snapshots/`.
//
// **متى يفشل:**
//   • renderFrame أنتج شيئاً مختلفاً عن اللقطة (رسم جديد، خلل فادح).
//   • تغيّر خفي في skia-canvas أو دالة طبقة أو الهوية.
//
// **متى يُحدَّث المرجع:** بعد قرار مالك واضح بتحسين المخرج — تُنسَخ
// المخرجات من `out/` إلى `snapshots/` ويوثَّق السبب في PHASES.md.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
const SNAP = join(ROOT, 'snapshots');

const BRANDS = ['default', 'client-demo'];
const TEMPLATES = ['breaking', 'card_centered', 'card_bottom', 'card_kicker', 'reel', 'plain'];

// اسم الملف: template=breaking ⇒ preview-<brand>.png، الباقي ⇒ preview-<brand>-<tpl-with-dashes>.png
const filenameFor = (brand, tpl) =>
  tpl === 'breaking'
    ? `preview-${brand}.png`
    : `preview-${brand}-${tpl.replace(/_/g, '-')}.png`;

// (١) تجديد المخرجات — --template=all لكل هوية
for (const brand of BRANDS) {
  const result = spawnSync(
    'node',
    [
      '--import',
      'tsx',
      join(ROOT, 'scripts/preview.mjs'),
      `--brand=${brand}`,
      '--template=all',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.error(`[verify-snapshot] فشل تشغيل preview للهوية ${brand}`);
    process.exit(1);
  }
}

// (٢) المقارنة البايتية — 12 ملفاً (6 قوالب × 2 هويتين)
let failures = 0;
let passed = 0;
for (const brand of BRANDS) {
  for (const tpl of TEMPLATES) {
    const name = filenameFor(brand, tpl);
    const actualPath = join(OUT, name);
    const expectedPath = join(SNAP, name);
    if (!existsSync(expectedPath)) {
      console.error(
        `[verify-snapshot] لقطة مفقودة: snapshots/${name} — إن كان هذا مقصوداً، انسخ من out/ ووثّق`
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
        `[verify-snapshot] ✗ ${name} — فروق (فعلي=${actual.length}b متوقّع=${expected.length}b)`
      );
      failures++;
    } else {
      passed++;
    }
  }
}

console.log(
  `\n[verify-snapshot] ${passed} مطابقة · ${failures} إخفاق · من ${BRANDS.length * TEMPLATES.length} لقطة`
);
if (failures > 0) {
  console.error('راجع الفروق البصرية قبل تحديث المرجع.');
  process.exit(1);
}
