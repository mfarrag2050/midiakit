// scripts/verify-breaking-video.mjs — البوابة الدائمة لسلوك breaking.
//
// **العلّة (2026-09-02):** verify-timeline-equivalence.mjs قارن مسار
// v2 بمسار @legacy — بعد حذف legacy، لم يعد له معنى. البديل: مقارنة
// مخرج breaking بـmd5 مرجعي محفوظ (snapshots-video/breaking-<platform>.md5)
// أُخِذ بينما كان @legacy مصدر الحقيقة الأوحد قبل الحذف. أي انحدار
// في timeline v2 (أو الأدابتر أو أي primitives يستدعيها) يبرز فوراً.
//
// **دور المرجع:** لقطة ذهبية دائمة — كما snapshots/*.png للبطاقات
// الثابتة، snapshots-video/breaking-<platform>.mp4 للفيديو. يُحدَّث فقط
// بقرار مالك واضح بتحسين المخرج.
//
// **مراجع منصّاتيّة (شُدِّد 2026-09-11 · 20-CI-BUILD §3):** md5 يختلف بين
// macOS و Linux بسبب فرق `measureText` boundingBox (~2px عموديّاً)
// المُوثَّق في PLATFORM-2. الحلّ: مرجع لكلّ منصّة —
//   • snapshots-video/breaking-macos.md5 (توليد على mac arm64)
//   • snapshots-video/breaking-linux.md5 (توليد داخل حاوية Linux amd64)
// PLATFORM-3 يُثبت أنّ linux/arm64 و linux/amd64 متطابقان بت-بت في
// measureText — فمرجع Linux واحد يخدم كليهما.
//
// **اختبار الوجود (L-46):**
//   1. عدّل حرفاً في apps/renderer/src/index.ts (مسار الرندر) ⇒ md5 يتغيّر
//      ⇒ البوابة تسقط.
//   2. أعِد الحرف ⇒ md5 يعود ⇒ البوابة تمرّ.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── فحص المنصّة (GATE-2LAYER §٤ · 2026-09-11 · PLATFORM-2) ──
if (process.platform !== 'linux') {
  console.error('');
  console.error(`✗ verify-breaking-video: هذا المرجع لينكس حصراً.`);
  console.error(`  المنصّة الحاليّة: ${process.platform} · المطلوبة: linux`);
  console.error(``);
  console.error(`  الحل: ./bin/mk-ci`);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// نختار المرجع بحسب المنصّة الحاليّة. القيم المُعتَبَرة: 'darwin' (macOS)،
// 'linux'. أيّ منصّة أخرى تكسر البوابة بوضوح.
const PLATFORM_TAG =
  process.platform === 'darwin' ? 'macos' :
  process.platform === 'linux'  ? 'linux' :
  process.platform;

const REF_PATH = join(ROOT, `snapshots-video/breaking-${PLATFORM_TAG}.md5`);

if (!existsSync(REF_PATH)) {
  console.error(`[verify-breaking-video] ✗ لا مرجع لمنصّة ${PLATFORM_TAG}`);
  console.error(`  المتوقّع: ${relative(ROOT, REF_PATH)}`);
  console.error(`  الحلّ: شغِّل الرندر على هذه المنصّة، تحقّق من المخرج بصرياً،`);
  console.error(`         ثمّ احفظ md5 في المسار أعلاه.`);
  process.exit(1);
}

const REFERENCE_MD5 = readFileSync(REF_PATH, 'utf8').trim();

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

console.log(`\n════════ بوابة breaking المرجعية (${PLATFORM_TAG}) ════════`);
console.log(`مرجعي: ${REFERENCE_MD5}`);
console.log(`فعلي:  ${actualMd5}`);

if (actualMd5 === REFERENCE_MD5) {
  console.log(`\n✓ متطابق. المسار الحالي يعيد نفس مخرج breaking المرجعي على ${PLATFORM_TAG}.`);
} else {
  console.error(`\n✗ اختلاف. المسار الحالي غيّر مخرج breaking على ${PLATFORM_TAG}.`);
  console.error(`  إن كان مقصوداً (تحسين معتمَد)، انسخ ${outMp4} إلى`);
  console.error(`  snapshots-video/breaking-${PLATFORM_TAG}.mp4، وحدّث ${relative(ROOT, REF_PATH)}.`);
  process.exit(1);
}
