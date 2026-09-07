// scripts/check-docs-bundle-fresh — يفشل إن كان docs/BUNDLE.md قديماً.
//
// **الآلية:** يشغّل `bundle-docs --stdout` لتوليد الحزمة الحالية،
// ويقارنها بـdocs/BUNDLE.md القائم. اختلاف ⇒ فشل بذكر «الحزمة قديمة —
// شغّل pnpm docs:bundle».
//
// **الفرق مع bundle-docs:** هذا لا يكتب — يقرأ فقط.
//
// **خارج سلسلة test:** نفس منطق check-skill-fresh — يقيس طزاجة مخرَج
// خارجي لا سلامة الشجرة، ويربط main بحركة الفرعين.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_PATH = join(ROOT, 'docs/BUNDLE.md');

if (!existsSync(BUNDLE_PATH)) {
  console.error('[check-docs-bundle-fresh] ✗ docs/BUNDLE.md غير موجود — شغّل `pnpm docs:bundle`.');
  process.exit(1);
}

// نُهمل سطور «تاريخ التوليد» و «HEAD» في المقارنة — ميتا لا مصدر.
// تضمينها يجعل الفحص يفشل بعد كلّ commit على main بلا فائدة.
function stripVolatileMeta(text) {
  return text
    .split('\n')
    .filter((line) => (
      !line.startsWith('> **تاريخ التوليد:**') &&
      !line.startsWith('> **HEAD (')
    ))
    .join('\n')
    .trim();
}

const current = stripVolatileMeta(readFileSync(BUNDLE_PATH, 'utf8'));

let fresh;
try {
  const raw = execSync('node scripts/bundle-docs.mjs --stdout', {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8');
  fresh = stripVolatileMeta(raw);
} catch (err) {
  console.error('[check-docs-bundle-fresh] ✗ bundle-docs --stdout فشل:');
  console.error(err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}

if (current === fresh) {
  console.log('[check-docs-bundle-fresh] ✓ docs/BUNDLE.md طازج — الحزمة مطابقة لحالة الملفات.');
  process.exit(0);
}

console.error('[check-docs-bundle-fresh] ✗ الحزمة قديمة — شغّل `pnpm docs:bundle`.');
console.error('  docs/BUNDLE.md لا يطابق حالة الملفات الحالية.');
console.error('  السبب المرجَّح: docs/*.md أو PHASES.md أو فرع تغيَّر بعد آخر بناء للحزمة.');
process.exit(1);
