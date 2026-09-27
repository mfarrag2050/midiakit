// 519 · اختبارٌ صغير: تطابقُ verify-breaking-video مع القيمتَين الموثّقتَين
// (primary و alt) وفشلُه على قيمةٍ ثالثة. لا يستدعي رندراً — يفحص المنطق
// الحرفيّ === على قيمتَين وقيمةٍ محقونة.
//
// **لا يدخل pnpm test بعدُ** — استعمالٌ يدويّ لإثبات L-46 (احمرارٌ ثمّ خضرة).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const primary = readFileSync(join(ROOT, 'snapshots-video/breaking.md5'), 'utf8').trim();
const alt = readFileSync(join(ROOT, 'snapshots-video/breaking.md5.alt'), 'utf8').trim();

// نفسُ منطقِ verify-breaking-video.mjs (§«مطابقةٌ حرفيّة === مع كلٍّ»).
function judge(actual) {
  if (actual === primary) return 'primary';
  if (actual === alt) return 'alt';
  return 'FAIL';
}

const third = '0'.repeat(31) + '1'; // قيمةٌ ثالثةٌ اصطناعيّة (32 hex، ليست primary/alt)
const cases = [
  { actual: primary, expect: 'primary', label: 'primary hash' },
  { actual: alt, expect: 'alt', label: 'alt hash' },
  { actual: third, expect: 'FAIL', label: 'third hash (regression)' },
];

let ok = true;
for (const c of cases) {
  const got = judge(c.actual);
  const pass = got === c.expect;
  console.log(`${pass ? '✓' : '✗'} ${c.label}: ${c.actual.slice(0, 8)}… → ${got} (expected ${c.expect})`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
