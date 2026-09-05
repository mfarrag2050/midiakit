// scripts/check-skill-fresh — يفشل إن كان docs/SKILL-mediakit.md قديماً.
//
// **الآلية:** يشغّل `build-skill --stdout` لتوليد الحالة الحالية، ويقارنها
// بالمنطقة المولَّدة القائمة. اختلاف ⇒ فشل.
//
// **الفرق مع build-skill:** هذا لا يكتب — يقرأ فقط. آمن للاستدعاء في
// كل `pnpm test` بلا آثار جانبية.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILL_PATH = join(ROOT, 'docs/SKILL-mediakit.md');
const BEGIN = '<!-- BEGIN:GENERATED -->';
const END = '<!-- END:GENERATED -->';

function extractGenerated(content) {
  const s = content.indexOf(BEGIN);
  const e = content.indexOf(END);
  if (s < 0 || e < 0) {
    console.error('[check-skill-fresh] ✗ علامات BEGIN/END:GENERATED غير موجودة');
    process.exit(1);
  }
  return content.slice(s + BEGIN.length, e).trim();
}

const current = extractGenerated(readFileSync(SKILL_PATH, 'utf8'));

let fresh;
try {
  fresh = execSync('node scripts/build-skill.mjs --stdout', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (err) {
  console.error('[check-skill-fresh] ✗ build-skill --stdout فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

if (current === fresh) {
  console.log('[check-skill-fresh] ✓ docs/SKILL-mediakit.md طازج — المنطقة المولَّدة مطابقة لحالة الملفات.');
  process.exit(0);
}

console.error('[check-skill-fresh] ✗ السكيل قديم — شغّل `pnpm skill:build`.');
console.error('  المنطقة المولَّدة في docs/SKILL-mediakit.md لا تطابق حالة الملفات الحالية.');
console.error('  السبب المرجَّح: PHASES.md / LESSONS.md / docs/17 / package.json تغيَّر بعد آخر بناء للسكيل.');
process.exit(1);
