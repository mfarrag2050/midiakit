// scripts/verify-breaking-video.mjs — البوابة الدائمة لسلوك breaking.
//
// **العلّة (2026-09-02):** verify-timeline-equivalence.mjs قارن مسار
// v2 بمسار @legacy — بعد حذف legacy، لم يعد له معنى. البديل: مقارنة
// مخرج breaking بـmd5 مرجعي محفوظ (snapshots-video/breaking.md5)
// أُخِذ بينما كان @legacy مصدر الحقيقة الأوحد قبل الحذف. أي انحدار
// في timeline v2 (أو الأدابتر أو أي primitives يستدعيها) يبرز فوراً.
//
// **دور المرجع:** لقطة ذهبية دائمة — كما snapshots/*.png للبطاقات
// الثابتة، snapshots-video/breaking.mp4 للفيديو. يُحدَّث فقط بقرار
// مالك واضح بتحسين المخرج.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const REFERENCE_MD5 = readFileSync(
  join(ROOT, 'snapshots-video/breaking.md5'),
  'utf8'
).trim();

const outMp4 = join(OUT_DIR, 'verify-breaking.mp4');

console.log(`[verify-breaking-video] رندر breaking عبر المسار الحالي …`);
const r = spawnSync(
  'node',
  [
    '--import', 'tsx',
    join(ROOT, 'apps/renderer/src/cli.ts'),
    '--brand=default',
    '--template=breaking',
    `--out=${outMp4}`,
  ],
  { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' }
);
if (r.status !== 0) {
  console.error('[verify-breaking-video] فشل رندر breaking');
  process.exit(1);
}

const actualMd5 = createHash('md5')
  .update(readFileSync(outMp4))
  .digest('hex');

console.log(`\n════════ بوابة breaking المرجعية ════════`);
console.log(`مرجعي: ${REFERENCE_MD5}`);
console.log(`فعلي:  ${actualMd5}`);

if (actualMd5 === REFERENCE_MD5) {
  console.log(`\n✓ متطابق. المسار الحالي يعيد نفس مخرج breaking المرجعي.`);
} else {
  console.error(`\n✗ اختلاف. المسار الحالي غيّر مخرج breaking.`);
  console.error(`  إن كان مقصوداً (تحسين معتمَد)، انسخ ${outMp4} إلى`);
  console.error(`  snapshots-video/breaking.mp4، وحدّث snapshots-video/breaking.md5.`);
  process.exit(1);
}
