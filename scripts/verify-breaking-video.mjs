// scripts/verify-breaking-video.mjs — البوابة الدائمة لسلوك breaking.
//
// **العلّة (2026-09-02):** verify-timeline-equivalence.mjs قارن مسار
// v2 بمسار @legacy — بعد حذف legacy، لم يعد له معنى. البديل: مقارنة
// مخرج breaking بـmd5 مرجعي محفوظ (snapshots-video/breaking.md5).
//
// **دور المرجع:** لقطة ذهبية دائمة — كما snapshots/*.png للبطاقات
// الثابتة، snapshots-video/breaking.mp4 للفيديو. يُحدَّث فقط بقرار
// مالك واضح بتحسين المخرج.
//
// **mk/486c · حتميّةٌ في التحقّق فقط:** نُمرِّر `--threads=1` إلى CLI
// لِـlibx264 (يعطّل slice-based threading الذي يتذبذب بحسب عدد نوى
// runner). الإنتاج (تصدير المستخدم · العرض) يبقى `auto` — أسرع بلا
// تغيير سلوك. راجع claude/reports/486-BREAKING-MD5-DUALITY.md.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── فحص المنصّة (487 · PLATFORM-SCOPED) ──
if (process.platform === 'darwin' || process.arch !== 'x64') {
  console.log(`SKIP verify:breaking-video (arch=${process.arch}, platform=${process.platform}) — CI enforces amd64 golden; local run is not authoritative.`);
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// 486c: قراءةُ ملفِّ المرجع (سطرٌ واحد · 32 hex بالضبط).
function readMd5(path, label) {
  const raw = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{32}$/.test(raw)) {
    console.error(`[verify-breaking-video] ✗ ${label} ليس md5 (32 hex): "${raw}"`);
    process.exit(1);
  }
  return raw;
}

const REFERENCE_MD5 = readMd5(
  join(ROOT, 'snapshots-video/breaking.md5'),
  'breaking.md5'
);

const outMp4 = join(OUT_DIR, 'verify-breaking.mp4');

console.log(`[verify-breaking-video] رندر breaking عبر المسار الحالي (threads=1) …`);
const r = spawnSync(
  'node',
  [
    '--import', 'tsx',
    join(ROOT, 'apps/renderer/src/cli.ts'),
    '--brand=default',
    '--template=breaking',
    '--threads=1',
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

// 486c: مطابقةٌ حرفيّةٌ === (المرجعُ حتميٌّ الآن بفضل threads=1 في CI و
// mk-ci محلّيّاً). قيمةٌ مختلفةٌ = انحدارٌ حقيقيّ.
if (actualMd5 === REFERENCE_MD5) {
  console.log(`\n✓ متطابق. المسار الحالي يعيد نفس مخرج breaking المرجعي.`);
} else {
  console.error(`\n✗ اختلاف. المسار الحالي غيّر مخرج breaking.`);
  console.error(`  إن كان مقصوداً (تحسين معتمَد)، انسخ ${outMp4} إلى`);
  console.error(`  snapshots-video/breaking.mp4، وحدّث snapshots-video/breaking.md5.`);
  process.exit(1);
}
