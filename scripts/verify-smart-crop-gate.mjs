// verify-smart-crop-gate.mjs — بوابة L-46 مزدوجة لـsmart-crop:
//
//   (أ) **وجود:** صورة فيها «وجه» خارج المركز ⇒ الإطار الذكي أقرب
//       إلى الوجه من الأعمى (المركز). المسافة بين مركز الإطار ومركز
//       الوجه أقلّ في الذكي.
//   (ب) **ثبات:** نفس المدخل ⇒ نفس المخرج عبر N استدعاء.
//   (ج) **تراجع صامت:** لا وجوه ⇒ لا فشل، تمركز أعمى.
//   (د) **تجاوز يدوي:** content.crop يتقدّم دائماً — حتى مع وجوه.
//   (هـ) **أربعة مقاسات:** نفس الصورة/الوجه × 4 قوالب ⇒ كلها تحوي الوجه.
//   (و) **L-17 بصري:** شبكة مقارنة (قصّ مركزي مقابل ذكي) في PNG واحد.
//
// **الصور:** تُصنَع صناعياً على قماش (تدرّج + شكل مميّز يمثّل «وجهاً»).
// لا صور أشخاص حقيقيين — قاعدة المالك 2026-09-04.

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { smartCrop } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

// ── صورة اصطناعية 1920×1080 مع «وجه» في الربع الأيمن ────
const IMG = { w: 1920, h: 1080 };
// «الوجه» في المكان 1450..1670 × 300..600 — مركزه (1560, 450).
const FACE = { x: 1450, y: 300, w: 220, h: 300, score: 0.99 };

function drawSyntheticImage() {
  const c = new Canvas(IMG.w, IMG.h);
  const g = c.getContext('2d');
  // تدرّج خلفية — يمين→يسار (بنفسجي إلى تركوازي)
  const grad = g.createLinearGradient(0, 0, IMG.w, 0);
  grad.addColorStop(0, '#0B2340');
  grad.addColorStop(0.5, '#1A4B7A');
  grad.addColorStop(1, '#3D8BAE');
  g.fillStyle = grad;
  g.fillRect(0, 0, IMG.w, IMG.h);
  // نصّ تعريفي في المركز — يوضح أن الأعمى يقصّ الوجه
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.font = '500 40px "IBM Plex Sans Arabic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.fillText('صورة اصطناعية 1920×1080', IMG.w / 2, IMG.h / 2);
  // «وجه» — بيضاوي ملوَّن + عينان + فم
  const cx = FACE.x + FACE.w / 2;
  const cy = FACE.y + FACE.h / 2;
  g.fillStyle = '#F4C89C';
  g.beginPath();
  g.ellipse(cx, cy, FACE.w / 2, FACE.h / 2, 0, 0, Math.PI * 2);
  g.fill();
  // عيون
  g.fillStyle = '#1A1A1A';
  g.beginPath();
  g.arc(cx - 35, cy - 40, 12, 0, Math.PI * 2);
  g.arc(cx + 35, cy - 40, 12, 0, Math.PI * 2);
  g.fill();
  // فم
  g.strokeStyle = '#7A1A1A';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy + 35, 30, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  // إطار للـface box (شفاف — للتوضيح فقط، ليس جزءاً من الوجه المكشوف)
  return c;
}

const srcCanvas = drawSyntheticImage();

// ── (أ) وجود — الذكي أقرب من الأعمى ────────────────────
console.log('════════ أ) وجود — الإطار الذكي أقرب إلى الوجه ════════');
const target = { w: 1080, h: 1080 }; // square
const smart = smartCrop(IMG, target, { faces: [FACE] });
const blind = smartCrop(IMG, target);

const fCenter = { x: FACE.x + FACE.w / 2, y: FACE.y + FACE.h / 2 };
const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const dSmart = dist(centerOf(smart), fCenter);
const dBlind = dist(centerOf(blind), fCenter);
console.log(`    الأعمى: rect=(${blind.x},${blind.y},${blind.w},${blind.h}) · مسافة إلى الوجه=${dBlind.toFixed(0)}px`);
console.log(`    الذكي:  rect=(${smart.x},${smart.y},${smart.w},${smart.h}) · مسافة إلى الوجه=${dSmart.toFixed(0)}px`);
assert(dSmart < dBlind, 'الذكي أقرب إلى مركز الوجه من الأعمى');
assert(
  fCenter.x >= smart.x && fCenter.x <= smart.x + smart.w &&
  fCenter.y >= smart.y && fCenter.y <= smart.y + smart.h,
  'مركز الوجه داخل الإطار الذكي'
);

// ── (ب) ثبات ─────────────────────────────────────────
console.log('\n════════ ب) ثبات — عشر استدعاءات ════════');
const first = smartCrop(IMG, target, { faces: [FACE] });
let stable = true;
for (let i = 0; i < 10; i++) {
  const r = smartCrop(IMG, target, { faces: [FACE] });
  if (JSON.stringify(r) !== JSON.stringify(first)) stable = false;
}
assert(stable, 'المخرج ثابت عبر 10 استدعاءات', JSON.stringify(first));

// ── (ج) تراجع صامت ──────────────────────────────────
console.log('\n════════ ج) لا وجوه ⇒ تراجع للتمركز الأعمى ════════');
const noFaces = smartCrop(IMG, target, { faces: [] });
const noOpts = smartCrop(IMG, target);
assert(JSON.stringify(noFaces) === JSON.stringify(noOpts), 'مصفوفة فارغة = بلا opts', JSON.stringify(noFaces));

// ── (د) تجاوز يدوي ─────────────────────────────────
console.log('\n════════ د) content.crop يتقدّم على الوجوه ════════');
const override = { x: 100, y: 100, w: 500, h: 500 };
const withOverride = smartCrop(IMG, target, { faces: [FACE], override });
assert(
  withOverride.x === override.x && withOverride.y === override.y &&
  withOverride.w === override.w && withOverride.h === override.h,
  'override كما هو — لم يتأثّر بالوجوه', JSON.stringify(withOverride)
);

// ── (هـ) أربعة مقاسات ─────────────────────────────
console.log('\n════════ هـ) 4 مقاسات ⇒ كلها تحوي الوجه ════════');
const TARGETS = [
  { name: 'square 1080×1080', size: { w: 1080, h: 1080 } },
  { name: 'portrait 1080×1350', size: { w: 1080, h: 1350 } },
  { name: 'reel 1080×1920', size: { w: 1080, h: 1920 } },
  { name: 'landscape 1920×1080', size: { w: 1920, h: 1080 } },
];
const smartByTarget = TARGETS.map((t) => ({ name: t.name, size: t.size, rect: smartCrop(IMG, t.size, { faces: [FACE] }) }));
smartByTarget.forEach(({ name, rect }) => {
  const contains =
    FACE.x >= rect.x && FACE.y >= rect.y &&
    FACE.x + FACE.w <= rect.x + rect.w &&
    FACE.y + FACE.h <= rect.y + rect.h;
  console.log(`    ${name.padEnd(24)} rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}) contains=${contains}`);
  assert(contains, `الوجه داخل الإطار — ${name}`);
});

// ── (و) L-17 بصري — شبكة مقارنة ────────────────────
console.log('\n════════ و) شبكة مقارنة (مركزي مقابل ذكي) ════════');
const CELL_W = 300; // معاينة موحّدة لكل خلية
const H_HDR = 100;
const H_LBL = 40;
const NCOLS = TARGETS.length;
const NROWS = 2; // مركزي · ذكي

// نحسب أطوال أعمدة مختلفة لأن نسبة كل قالب مختلفة
const cellHeights = TARGETS.map((t) => Math.round(CELL_W * t.size.h / t.size.w));
const MAX_H = Math.max(...cellHeights);

const GAP = 24;
const PAD = 32;
const compW = PAD + NCOLS * (CELL_W + GAP) + PAD;
const compH = PAD + H_HDR + NROWS * (MAX_H + H_LBL + GAP) + PAD;

const comp = new Canvas(compW, compH);
const cctx = comp.getContext('2d');
cctx.fillStyle = '#0F1218';
cctx.fillRect(0, 0, compW, compH);

// عنوان
cctx.fillStyle = '#F8F4E9';
cctx.font = '700 30px "IBM Plex Sans Arabic", sans-serif';
cctx.textAlign = 'center';
cctx.textBaseline = 'top';
cctx.direction = 'rtl';
cctx.fillText('القصّ الذكي — أربعة مقاسات · مركزي مقابل ذكي', compW / 2, 20);
cctx.fillStyle = 'rgba(248,244,233,0.6)';
cctx.font = '400 18px "IBM Plex Sans Arabic", sans-serif';
cctx.fillText('«الوجه» بيضاوي أبيض في الربع الأيمن — راجع بالعين أنّ الذكي يحوي الوجه دائماً', compW / 2, 60);

// نرسم الشبكة
const rows = [
  { label: 'مركزي (الأعمى)', crop: (t) => smartCrop(IMG, t.size) },
  { label: 'ذكي (وجه معلوم)', crop: (t) => smartCrop(IMG, t.size, { faces: [FACE] }) },
];

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  for (let c = 0; c < TARGETS.length; c++) {
    const t = TARGETS[c];
    const rect = row.crop(t);
    const cellH = Math.round(CELL_W * t.size.h / t.size.w);
    const cx = PAD + c * (CELL_W + GAP);
    const cy = PAD + H_HDR + r * (MAX_H + H_LBL + GAP);
    // ارسم الجزء المقصوص من الصورة الاصطناعية إلى الخلية
    cctx.drawImage(srcCanvas, rect.x, rect.y, rect.w, rect.h, cx, cy, CELL_W, cellH);
    // إطار
    cctx.strokeStyle = 'rgba(255,255,255,0.25)';
    cctx.lineWidth = 1;
    cctx.strokeRect(cx, cy, CELL_W, cellH);
    // تسمية اسم القالب أعلى العمود (مرة واحدة عند r=0)
    if (r === 0) {
      cctx.fillStyle = '#F8F4E9';
      cctx.font = '600 16px "IBM Plex Sans Arabic", sans-serif';
      cctx.textAlign = 'center';
      cctx.textBaseline = 'bottom';
      cctx.direction = 'ltr';
      cctx.fillText(t.name, cx + CELL_W / 2, cy - 8);
    }
    // تسمية الصف تحت الخلية
    cctx.fillStyle = 'rgba(248,244,233,0.85)';
    cctx.font = '500 16px "IBM Plex Sans Arabic", sans-serif';
    cctx.textAlign = 'center';
    cctx.textBaseline = 'top';
    cctx.direction = 'rtl';
    cctx.fillText(row.label, cx + CELL_W / 2, cy + cellH + 6);
  }
}

const OUT_PNG = join(OUT, 'smart-crop-demo.png');
await writeFile(OUT_PNG, comp.toBufferSync('png'));
console.log(`    ✓ ${OUT_PNG} (${compW}×${compH})`);

console.log('');
if (failed === 0) console.log('════════ كل البوابات الست ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
