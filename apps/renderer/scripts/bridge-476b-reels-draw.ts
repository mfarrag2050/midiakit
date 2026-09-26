/**
 * bridge-476b-reels-draw.ts
 *
 * 476b §٢ — رسم الجسر في (app)/reels من أصلٍ حقيقيّ مرفوع في MinIO@19043.
 *
 * يستخدم نفس الـ SAMPLE timeline الموجود في (app)/reels/page.tsx
 * مع استبدال أصل `asset:reel-a` بالصورة الحقيقيّة المرفوعة.
 *
 * المحرّك: drawTimelineAt من @pf-mediakit/engine (يُستدعى لا يُعدَّل).
 * القماشة: skia-canvas 1080×1920 (نفس renderer).
 * الخط: IBMPlexSansArabic من apps/renderer/assets/fonts/.
 *
 * تشغيل: node --import tsx apps/renderer/scripts/bridge-476b-reels-draw.ts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, FontLibrary, loadImage } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { REEL } from '@pf-mediakit/templates';
import {
  applyLocaleToBrand,
  buildTimelinePlan,
  drawTimelineAt,
  resolveBrand,
} from '@pf-mediakit/engine';
import type { Timeline } from '@pf-mediakit/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDERER_ROOT = resolve(__dirname, '..');
const REPO_ROOT    = resolve(RENDERER_ROOT, '..', '..');
const OUT_DIR      = resolve(REPO_ROOT, 'out', 'bridge-476b');
mkdirSync(OUT_DIR, { recursive: true });

// ── تحميل بيانات الجلسة ─────────────────────────────────────
const sessionFile = '/tmp/mk_bridge_upload.json';
if (!existsSync(sessionFile)) {
  console.error('✗ ملف الجلسة غير موجود — شغّل التحقّقات أوّلاً');
  process.exit(1);
}
const session = JSON.parse(readFileSync(sessionFile, 'utf8'));
const PUBLIC_URL  = session._publicUrl as string;
const ASSET_ID    = session.assetId as string;
const SRC_FP      = session._fingerprint as string;
const TOKEN       = session._token as string;

if (!PUBLIC_URL || !SRC_FP) {
  console.error('✗ publicUrl أو fingerprint غير موجود');
  process.exit(1);
}

console.log('▶ bridge-476b-reels-draw — رسم Reels Timeline بأصل حقيقيّ');
console.log(`  assetId: ${ASSET_ID}`);
console.log(`  src_fingerprint: ${SRC_FP}`);

// ── ١. تسجيل الخطّ (FontLibrary) ────────────────────────────
// الخطوط في assets/fonts/ على مستوى جذر المستودع
const FONTS_DIR = resolve(REPO_ROOT, 'assets', 'fonts');
const FONT_FILES = [
  'IBMPlexSansArabic-Light.ttf',
  'IBMPlexSansArabic-Regular.ttf',
  'IBMPlexSansArabic-Bold.ttf',
];

console.log('\n▶ ١. تسجيل الخطوط');
for (const f of FONT_FILES) {
  const p = resolve(FONTS_DIR, f);
  if (existsSync(p)) {
    FontLibrary.use(p);
    console.log(`  ✓ ${f}`);
  } else {
    console.warn(`  ⚠ غير موجود: ${p}`);
  }
}

// ── ٢. تحميل الصورة الحقيقيّة من MinIO ─────────────────────
console.log('\n▶ ٢. تحميل الصورة من MinIO (publicUrl)');
const imgRes = await fetch(PUBLIC_URL);
if (!imgRes.ok) {
  console.error(`✗ GET publicUrl → ${imgRes.status}`);
  process.exit(1);
}
const imgBytes = Buffer.from(await imgRes.arrayBuffer());
const dlFp = createHash('md5').update(imgBytes).digest('hex');
const fpMatch = dlFp === SRC_FP;
console.log(`  bytes: ${imgBytes.length}`);
console.log(`  MD5: ${dlFp} ${fpMatch ? '✓ match' : '✗ MISMATCH'}`);
if (!fpMatch) { console.error('✗ بصمة لا تطابق'); process.exit(1); }

const realImg = await loadImage(imgBytes);
console.log(`  loaded: ${realImg.width}×${realImg.height}`);

// ── ٣. بناء الـ Timeline (نفس SAMPLE من reels/page.tsx) ─────
// نستبدل `asset:reel-a` بالأصل الحقيقيّ. مفتاح الأصل في assets.images
// يطابق item.src وآثر draw-media's assetKey.
const REAL_KEY = `asset:real-${ASSET_ID.slice(0, 8)}`;

const SAMPLE: Timeline = {
  duration: 32,
  fps: 30,
  size: 'reel',
  tracks: [
    {
      id: 'trk-media',
      type: 'media',
      index: 0,
      items: [
        // ← الأصل الحقيقيّ في الشريحة الأولى
        {
          id: 'clip-real',
          start: 0,
          end: 9.5,
          src: REAL_KEY,
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: REAL_KEY },
          ],
        },
        // شريحتان بـplaceholder للسياق
        {
          id: 'clip-02',
          start: 9.5,
          end: 18,
          src: 'asset:reel-b',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'topLeft' },
            { type: 'draw-media', assetKey: 'asset:reel-b' },
          ],
        },
        {
          id: 'clip-03',
          start: 18,
          end: 32,
          src: 'asset:reel-c',
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'draw-media', assetKey: 'asset:reel-c' },
          ],
        },
      ],
    },
    {
      id: 'trk-text',
      type: 'text',
      index: 1,
      items: [
        {
          id: 'title-01',
          start: 0.5,
          end: 7,
          anchor: 0.2,
          effects: [
            { type: 'kenBurns', from: 1, to: 1.08, origin: 'center' },
            { type: 'text-item-byWord', stagger: 0.08, fadeDuration: 0.25 },
          ],
          value: 'الإيقاعُ السريعُ يشدُّ المشاهدَ من أوّلِ ثانية',
        },
        {
          id: 'title-02',
          start: 7,
          end: 14,
          anchor: 0.5,
          effects: [{ type: 'text-item-lines' }],
          value: 'كلُّ لقطةٍ تخدمُ الحكايةَ ولا تحيدُ عنها',
        },
        {
          id: 'title-03',
          start: 20,
          end: 28,
          anchor: 0.8,
          effects: [{ type: 'text-item-lines' }],
          value: 'النصُّ المكتوبُ جيّداً يصلُ قبلَ الصورة',
        },
      ],
    },
    {
      id: 'trk-audio',
      type: 'audio',
      index: 2,
      items: [
        { id: 'vo-main', start: 0, end: 18, gain: 0.9 },
        { id: 'sting-01', start: 18, end: 20.5 },
      ],
    },
  ],
};

// ── ٤. إعداد أصول الرسم ─────────────────────────────────────
const W = 1080, H = 1920;
const SIZE = { w: W, h: H };

// بناء placeholder لكل أصل عدا الحقيقيّ
const brand  = resolveBrand(applyLocaleToBrand(DEFAULT_BRAND, 'ar'));
const images: Record<string, { width: number; height: number }> = {};

// الأصل الحقيقيّ
images[REAL_KEY] = realImg;

// Placeholders للآخرين (canvas بتدرّج لونيّ كما في TimelinePreview)
for (const tr of SAMPLE.tracks) {
  if (tr.type !== 'media') continue;
  for (const item of tr.items) {
    const key = item.src;
    if (!key || key in images) continue;
    const c = new Canvas(W, H);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, brand.colors.placeholder[0]);
    grad.addColorStop(1, brand.colors.placeholder[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    images[key] = c;
  }
}

const content = { locale: 'ar', title: 'حكايةُ اليومِ في ستّينَ ثانيةً' };
const assets = { images };

// ── ٥. رسم إطار t=4.5s (مطابق للحظة الافتراضيّة في reels/page.tsx) ─
console.log('\n▶ ٥. رسم Canvas 1080×1920 عند t=4.5s');
const T = 4.5; // playheadSec الافتراضيّ في reels/page.tsx

const canvas = new Canvas(W, H);
const ctx = canvas.getContext('2d');

const plan = buildTimelinePlan({
  ctx: ctx as Parameters<typeof buildTimelinePlan>[0]['ctx'],
  size: SIZE,
  timeline: SAMPLE,
  brand,
  template: REEL,
  assets,
});

ctx.clearRect(0, 0, W, H);
drawTimelineAt({
  ctx: ctx as Parameters<typeof drawTimelineAt>[0]['ctx'],
  size: SIZE,
  timeline: SAMPLE,
  brand,
  template: REEL,
  content,
  assets,
  plan,
  t: T,
});

console.log('  ✓ drawTimelineAt نجح');

// ── ٦. بصمة منطقة الصورة الحقيقيّة ─────────────────────────
// منطقة الأصل الحقيقيّ = القماشة كاملة (t=4.5s داخل clip-real [0,9.5])
console.log('\n▶ ٦. getImageData — بصمة المنطقة');
const imgData = ctx.getImageData(0, 0, W, H);
const regionBuf = Buffer.from(imgData.data.buffer);
const regionMd5 = createHash('md5').update(regionBuf).digest('hex');
const nonZero = Array.from({ length: imgData.data.length / 4 }, (_, i) =>
  imgData.data[i * 4] + imgData.data[i * 4 + 1] + imgData.data[i * 4 + 2]
).filter(s => s > 0).length;
const pct = ((nonZero / (imgData.data.length / 4)) * 100).toFixed(1);
console.log(`  region: ${W}×${H}`);
console.log(`  region MD5: ${regionMd5}`);
console.log(`  non-zero pixels: ${nonZero} (${pct}%)`);

// ── ٧. حفظ اللقطة PNG ────────────────────────────────────────
console.log('\n▶ ٧. حفظ اللقطة');
const pngBuf = await canvas.toBuffer('png');
const snapName = `bridge-reels-real-${Date.now()}.png`;
const snapPath = resolve(OUT_DIR, snapName);
writeFileSync(snapPath, pngBuf);

// SHA256 للقطة (المطلوب في التقرير)
const snapSha256 = createHash('sha256').update(pngBuf).digest('hex');

console.log(`  ✓ ${snapPath}`);
console.log(`  حجم: ${(pngBuf.length / 1024).toFixed(1)} KB`);
console.log(`  SHA256: ${snapSha256}`);

// ── ملخّص ─────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('✓ bridge-476b-reels-draw PASSED');
console.log('');
console.log('للتقرير:');
console.log(`  src_fingerprint (MD5):    ${SRC_FP}`);
console.log(`  download_md5:             ${dlFp}`);
console.log(`  region_md5 (1080×1920):   ${regionMd5}`);
console.log(`  snapshot_sha256:          ${snapSha256}`);
console.log(`  snapshot_path:            ${snapPath}`);
console.log(`  snapshot_size:            ${(pngBuf.length / 1024).toFixed(1)} KB`);
console.log(`  non_zero_pct:             ${pct}%`);
console.log(`  render_t_sec:             ${T}`);
console.log(`  real_asset_key:           ${REAL_KEY}`);
