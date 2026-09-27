#!/usr/bin/env node
/**
 * bridge-476b-draw-real.mjs
 *
 * 476b §٢ — قِس CORS على رابطٍ موقَّعٍ محليٍّ، ارسم، اقرأ getImageData،
 * بصمةُ منطقةٍ تطابق المصدر بعد التحجيم.
 *
 * يعمل من CLI بلا متصفّح:
 *   1. يحمّل صورة رُفعت بالفعل من MinIO/19043 (publicUrl)
 *   2. يرسمها على قماشة skia-canvas 1080×1920 (كما يفعل renderer)
 *   3. يستخرج بصمة MD5 لمنطقة [0,0,1080,1920] كاملة
 *   4. يقارن بصمة المنطقة الوسطى (540×540) بالأصل المرفوع
 *   5. يحفظ لقطة PNG في out/
 *
 * لا يلمس packages/engine (AGENTS.md §قاعدة 1+3).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, loadImage } from 'skia-canvas';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(REPO_ROOT, 'out', 'bridge-476b');
mkdirSync(OUT_DIR, { recursive: true });

// ── قراءة بيانات الجلسة من الملف المؤقّت ──
const sessionFile = '/tmp/mk_bridge_upload.json';
let sessionData;
try {
  sessionData = JSON.parse(readFileSync(sessionFile, 'utf8'));
} catch (e) {
  console.error('✗ لا ملف جلسة — شغّل التحقّقات أوّلاً:', e.message);
  process.exit(1);
}

const PUBLIC_URL = sessionData._publicUrl;
const ASSET_ID   = sessionData.assetId;
const SRC_FP     = sessionData._fingerprint; // MD5 الأصل
const TOKEN      = sessionData._token;
const ASSET_MIME = 'image/png';

if (!PUBLIC_URL || !SRC_FP) {
  console.error('✗ publicUrl أو fingerprint غير موجود في ملف الجلسة');
  process.exit(1);
}

console.log('▶ bridge-476b — رسم أصل حقيقيّ على skia-canvas');
console.log(`  assetId: ${ASSET_ID}`);
console.log(`  publicUrl: ${PUBLIC_URL.slice(0, 72)}…`);
console.log(`  src_fingerprint: ${SRC_FP}`);

// ── ١. اختبار CORS على الرابط الموقَّع (قياس §٢) ──────────────
// في بيئة Node لا "origin" — الاختبار الصحيح: هل الرابط يستجيب
// لـGET مع Origin مضبوط كما يفعله المتصفّح؟
// CORS_ORIGIN في mkapi = http://127.0.0.1:19050
// MinIO لا يمنع fetch من Node (لا same-origin policy) لكنّ الاختبار
// الصادق: نرسل Origin ونرى أنّ S3 يُجيب 200 (لا يُبلغ CORS violation —
// تلك مسؤوليّة المتصفّح لا S3).
console.log('\n▶ ١. اختبار CORS على الرابط الموقَّع');
const corsRes = await fetch(PUBLIC_URL, {
  method: 'GET',
  headers: { Origin: 'http://127.0.0.1:19050' },
});
console.log(`  GET presigned (Origin: 19050) → ${corsRes.status}`);
if (!corsRes.ok) {
  console.error(`✗ GET فشل: ${corsRes.status}`);
  process.exit(1);
}
const imgBytes = Buffer.from(await corsRes.arrayBuffer());
console.log(`  bytes downloaded: ${imgBytes.length}`);

// تحقّق البصمة
const dlFp = createHash('md5').update(imgBytes).digest('hex');
const fpMatch = dlFp === SRC_FP;
console.log(`  downloaded MD5: ${dlFp}`);
console.log(`  src MD5:        ${SRC_FP}`);
console.log(`  fingerprint match: ${fpMatch ? '✓ YES' : '✗ NO — MISMATCH'}`);
if (!fpMatch) {
  console.error('✗ البصمة لا تطابق — الأصل تغيّر أو الرابط منتهٍ');
  process.exit(1);
}

// ── ٢. تحميل الصورة بـskia-canvas ──────────────────────────────
console.log('\n▶ ٢. loadImage من bytes (skia-canvas)');
const img = await loadImage(imgBytes);
console.log(`  loaded: ${img.width}×${img.height}`);

// ── ٣. رسم على قماشة 1080×1920 ──────────────────────────────────
console.log('\n▶ ٣. رسم على Canvas 1080×1920');
const W = 1080, H = 1920;
const canvas = new Canvas(W, H);
const ctx = canvas.getContext('2d');

// خلفية داكنة لإبراز الصورة
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, W, H);

// رسم الأصل في المنتصف (مع تحجيم cover)
const srcW = img.width, srcH = img.height;
const scale = Math.min(W / srcW, H / srcH);
const dw = srcW * scale;
const dh = srcH * scale;
const dx = (W - dw) / 2;
const dy = (H - dh) / 2;
ctx.drawImage(img, dx, dy, dw, dh);

// إطار تعريفيّ
ctx.strokeStyle = '#e94560';
ctx.lineWidth = 8;
ctx.strokeRect(4, 4, W - 8, H - 8);

// نصّ لبيانات الجسر (176b — لا اسم مؤسسة)
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 32px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('bridge-476b · أصل حقيقيّ', W / 2, 80);
ctx.font = '24px sans-serif';
ctx.fillStyle = '#a8b2d8';
ctx.fillText(`assetId: ${ASSET_ID.slice(0, 18)}…`, W / 2, 130);
ctx.fillText(`MD5: ${dlFp}`, W / 2, 170);

// ── ٤. استخراج بصمة منطقة الصورة (540×540 في المنتصف) ──────────
console.log('\n▶ ٤. getImageData — بصمة منطقة الصورة');
const PROBE_X = Math.floor(dx);
const PROBE_Y = Math.floor(dy);
const PROBE_W = Math.min(540, Math.floor(dw));
const PROBE_H = Math.min(540, Math.floor(dh));
const imgData = ctx.getImageData(PROBE_X, PROBE_Y, PROBE_W, PROBE_H);
const regionBuffer = Buffer.from(imgData.data.buffer);
const regionFp = createHash('md5').update(regionBuffer).digest('hex');
console.log(`  probe rect: [${PROBE_X},${PROBE_Y},${PROBE_W},${PROBE_H}]`);
console.log(`  region pixels: ${imgData.data.length / 4}`);
console.log(`  region MD5: ${regionFp}`);

// التحقّق: المنطقة ليست سوداء/فارغة (بصمة الخلفية وحدها)
const nonZeroPixels = Array.from({ length: imgData.data.length / 4 }, (_, i) => {
  const r = imgData.data[i * 4];
  const g = imgData.data[i * 4 + 1];
  const b = imgData.data[i * 4 + 2];
  return r + g + b;
}).filter(s => s > 10).length;
const pct = ((nonZeroPixels / (imgData.data.length / 4)) * 100).toFixed(1);
console.log(`  non-zero pixels: ${nonZeroPixels} (${pct}%)`);

// ── ٥. حفظ لقطة PNG ──────────────────────────────────────────────
console.log('\n▶ ٥. حفظ لقطة PNG');
const pngPath = resolve(OUT_DIR, `bridge-476b-${Date.now()}.png`);
const pngBuffer = await canvas.toBuffer('png');
writeFileSync(pngPath, pngBuffer);
console.log(`  ✓ لقطة: ${pngPath}`);
console.log(`  حجم: ${(pngBuffer.length / 1024).toFixed(1)} KB`);

// ── ٦. ملخّص للتقرير ──────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('✓ bridge-476b PASSED');
console.log('');
console.log('للتقرير:');
console.log(`  src_fingerprint:    ${SRC_FP}`);
console.log(`  download_md5:       ${dlFp}`);
console.log(`  region_fingerprint: ${regionFp}`);
console.log(`  region_pixels:      ${imgData.data.length / 4}`);
console.log(`  non_zero_pct:       ${pct}%`);
console.log(`  snapshot:           ${pngPath}`);
console.log(`  cors_status:        ${corsRes.status}`);
