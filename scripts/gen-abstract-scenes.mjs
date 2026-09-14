// gen-abstract-scenes · _AMEND-300 §١ — مشاهد تجريديّة نظيفة بالبناء.
//
// المشاهد السابقة (`fixtures/demo-live/scene-{summit,diplomacy,decision}.png`)
// كانت تحمل نصّاً رماديّاً مطبوعاً داخل الملفّ (`SUMMIT`, إلخ)، فلوّثت
// كلّ قياسٍ بصريّ جرى على خلفيّةٍ فيها نصّ دخيل.
//
// **خلوّ هذا المُولَّد من النصّ بالبناء لا بالفحص:**
//   • لا `ctx.fillText` في هذا الملفّ · تفقّده: `grep fillText`.
//   • لا `ctx.strokeText` · لا تحميل خطّ · لا مسار SVG لحرف.
//   • كلّ ما يُرسم: `fillRect` (خلفيّة) + `arc/ellipse` (أشكال) +
//     `createLinearGradient/createRadialGradient` (تدرّجات).
//
// إن أضاف أحدنا نصّاً هنا مستقبلاً، فحصٌ يدويّ للسطر يكشفه.
// **الحماية القويّة عبر البناء لا الفحص الآليّ.**

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'fixtures/demo-live');

const { Canvas } = await import('skia-canvas');

// ── ألوان مَرافئ (متسقّة مع packages/shared/src/brands/marafi.ts) ──
const INK     = '#0E1A24';
const SURFACE = '#F4F1EA';
const ACCENT  = '#C8622D';
const MUTED   = '#6B7A83';

/** خلفيّة تدرّج ورقيّ فاتح + هالة دائريّة ناعمة أعلى اليمين. */
function sceneWarm(w, h) {
  const c = new Canvas(w, h);
  const ctx = c.getContext('2d');
  // خلفيّة surface صلبة
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, w, h);
  // تدرّج طولي خفيف يُغمّق الأسفل
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(107, 122, 131, 0.00)');
  g.addColorStop(1, 'rgba(107, 122, 131, 0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // هالة دائريّة أعلى اليمين (متدرّجة نصف قطريّة)
  const rg = ctx.createRadialGradient(w * 0.85, h * 0.20, 0, w * 0.85, h * 0.20, w * 0.55);
  rg.addColorStop(0, 'rgba(200, 98, 45, 0.22)');
  rg.addColorStop(1, 'rgba(200, 98, 45, 0.00)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** خطوط قطريّة رفيعة بلون muted (نسيج). */
function sceneLinen(w, h) {
  const c = new Canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, w, h);
  // شريط بانك أعلى داكن قليلاً
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  g.addColorStop(0, 'rgba(14, 26, 36, 0.10)');
  g.addColorStop(1, 'rgba(14, 26, 36, 0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.35);
  // خطوط قطريّة (نسيج)
  ctx.strokeStyle = 'rgba(107, 122, 131, 0.08)';
  ctx.lineWidth = 1;
  const spacing = 16;
  for (let x = -h; x < w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
  }
  return c;
}

/** أشكال هندسيّة كبيرة ناعمة (دائرتان متقاطعتان). */
function sceneGeometry(w, h) {
  const c = new Canvas(w, h);
  const ctx = c.getContext('2d');
  // خلفيّة تدرّج ink فاتح إلى surface
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#E8E3D8');
  g.addColorStop(1, SURFACE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // دائرة كبيرة بلون accent شفّاف
  ctx.fillStyle = 'rgba(200, 98, 45, 0.18)';
  ctx.beginPath();
  ctx.arc(w * 0.25, h * 0.55, w * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // دائرة muted متقاطعة
  ctx.fillStyle = 'rgba(107, 122, 131, 0.20)';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.35, w * 0.30, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

const SCENES = [
  { name: 'scene-warm.png',     w: 1080, h: 1350, gen: sceneWarm     },
  { name: 'scene-linen.png',    w: 1080, h: 1350, gen: sceneLinen    },
  { name: 'scene-geometry.png', w: 1080, h: 1350, gen: sceneGeometry },
];

console.log('gen-abstract-scenes · _AMEND-300 §١');
console.log('');
for (const s of SCENES) {
  const canvas = s.gen(s.w, s.h);
  const buf = await canvas.toBuffer('png');
  const outPath = join(OUT_DIR, s.name);
  writeFileSync(outPath, buf);
  console.log(`  ✓ ${s.name.padEnd(24)} ${s.w}×${s.h} · ${buf.length} B`);
}
console.log('');
console.log('اختبار قابل للتكذيب — خلوّها من النصّ بالبناء:');
console.log('  grep -E "fillText|strokeText|FontLibrary|loadFont" scripts/gen-abstract-scenes.mjs');
console.log('  → متوقّع: 0 نتائج (عدا هذه الأسطر نفسها في التعليق)');
