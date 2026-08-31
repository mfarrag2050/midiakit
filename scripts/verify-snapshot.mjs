// verify-snapshot — يقارن مخرجات المعاينة الحالية بلقطات ذهبية
// محفوظة في `snapshots/`. يحمي من تغيّر أنبوب الرندر عرَضاً.
//
// **الاستخدام:** `node scripts/verify-snapshot.mjs`
//   يشغّل preview لكل هوية، ثم يقارن preview-<brand>.png بايت-بايت
//   مع `snapshots/preview-<brand>.png`.
//
// **متى يفشل:**
//   • renderFrame أنتج شيئاً مختلفاً عن اللقطة (رسم جديد، خلل فادح).
//   • تغيّر خفي في skia-canvas أو دالة طبقة أو الهوية.
//
// **متى يُحدَّث المرجع:** بعد قرار مالك واضح بتحسين المخرج — يُنسَخ
// `out/preview-<brand>.png` إلى `snapshots/preview-<brand>.png` ويوثَّق
// السبب في PHASES.md.

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

// (١) تجديد المخرجات
for (const brand of BRANDS) {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', join(ROOT, 'scripts/preview.mjs'), `--brand=${brand}`],
    { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.error(`[verify-snapshot] فشل تشغيل preview للهوية ${brand}`);
    process.exit(1);
  }
}

// (٢) المقارنة البايتية
let failures = 0;
for (const brand of BRANDS) {
  const actualPath = join(OUT, `preview-${brand}.png`);
  const expectedPath = join(SNAP, `preview-${brand}.png`);
  if (!existsSync(expectedPath)) {
    console.error(
      `[verify-snapshot] لقطة مفقودة: ${expectedPath} — إن كان هذا مقصوداً، انسخ out/ إلى snapshots/ ووثّق`
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
      `[verify-snapshot] فشل: ${brand} — البايتات مختلفة (فعلي=${actual.length}b متوقّع=${expected.length}b)`
    );
    failures++;
  } else {
    console.log(`[verify-snapshot] ✓ ${brand} — ${actual.length} بايت مطابق`);
  }
}

if (failures > 0) {
  console.error(`\n[verify-snapshot] ${failures} إخفاق. راجع الفروق البصرية قبل تحديث المرجع.`);
  process.exit(1);
}
console.log('\n[verify-snapshot] كل اللقطات مطابقة.');
