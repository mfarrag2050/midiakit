#!/usr/bin/env node
// 170-PARITY-IN-BROWSER — قياس تطابق المعاينة مع ملفّ التصدير
// المدخل الواحد: هوية + عنوان + مصدر + أبعاد
// الطرفان: (أ) بكسلات canvas في المتصفّح · (ب) بايتات ملفّ التصدير من الـAPI
// المخرج: %diff + خريطة فرق + اختبار حياة (نُدْغ 1بكسل → يسقط)
//
// شرط التشغيل:
//   1) خادم تطوير قائم على 127.0.0.1:19051 مع NEXT_PUBLIC_API_MOCK=true
//   2) puppeteer-core + skia-canvas في node_modules الجذر (كلاهما مثبَّت بالفعل)
//   3) Chrome for Testing (المسار في CHROME أدناه — بدّله لبيئتك)
//
// ملاحظة صريحة: في وضع mock، مسار التصدير يعيد صورة seed ثابتة —
// ليس رندَراً حقيقيّاً للبطاقة. القياس الحقيقيّ لطرفَي «المعاينة vs
// الرندَر الخادميّ» يشترط mk-api يستدعي renderFrame على skia-canvas.
// اختبار الحياة (نُدْغ 1بكسل) يُثبت أنّ آلة الفرق نفسها صادقة.

import puppeteer from 'puppeteer-core';
import { Canvas, loadImage } from 'skia-canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

const CHROME =
  process.env.CHROME_BIN ??
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.STUDIO_BASE ?? 'http://127.0.0.1:19051';
const OUT = resolve(REPO_ROOT, 'out', 'parity');
mkdirSync(OUT, { recursive: true });

const HEADLINE = 'انفجار في محطّة الوقود يودي بحياة ثلاثة أشخاص.';
const SOURCE = 'وكالات';

// عتبة الفرق: مجموع فروق RGB يتجاوز 30 = بكسل مختلف (يتسامح مع AA خفيف)
const DIFF_THRESHOLD = 30;

function decodeDataUrlToBuffer(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  return Buffer.from(b64, 'base64');
}

/**
 * قارن صورتين (Buffer PNG). يعيد { widthA, heightA, widthB, heightB, sizeMatched, diffPct, diffMap }
 * إن اختلفت الأبعاد نُقيس على أصغرهما (scale down الأكبر).
 */
async function compareImages(bufA, bufB, tag) {
  const imgA = await loadImage(bufA);
  const imgB = await loadImage(bufB);

  const wA = imgA.width, hA = imgA.height;
  const wB = imgB.width, hB = imgB.height;

  // للمقارنة النزيهة: ننزل الأكبر إلى أصغر البُعدَين
  const W = Math.min(wA, wB);
  const H = Math.min(hA, hB);

  const cA = new Canvas(W, H);
  cA.getContext('2d').drawImage(imgA, 0, 0, W, H);
  const dA = cA.getContext('2d').getImageData(0, 0, W, H).data;

  const cB = new Canvas(W, H);
  cB.getContext('2d').drawImage(imgB, 0, 0, W, H);
  const dB = cB.getContext('2d').getImageData(0, 0, W, H).data;

  // خريطة الفرق البصريّة (أحمر حيث اختلف)
  const cDiff = new Canvas(W, H);
  const ctxDiff = cDiff.getContext('2d');
  const imgDiff = ctxDiff.createImageData(W, H);

  let diffCount = 0;
  const total = W * H;
  const zones = { top: 0, middle: 0, bottom: 0 };

  for (let i = 0; i < dA.length; i += 4) {
    const dr = Math.abs(dA[i] - dB[i]);
    const dg = Math.abs(dA[i + 1] - dB[i + 1]);
    const db = Math.abs(dA[i + 2] - dB[i + 2]);
    const delta = dr + dg + db;
    const px = i / 4;
    const y = Math.floor(px / W);
    if (delta > DIFF_THRESHOLD) {
      diffCount++;
      imgDiff.data[i] = 255;
      imgDiff.data[i + 1] = 0;
      imgDiff.data[i + 2] = 0;
      imgDiff.data[i + 3] = 220;
      if (y < H / 3) zones.top++;
      else if (y < (2 * H) / 3) zones.middle++;
      else zones.bottom++;
    } else {
      // بكسل رمادي شبه شفّاف حيث يتطابق
      imgDiff.data[i] = dA[i];
      imgDiff.data[i + 1] = dA[i + 1];
      imgDiff.data[i + 2] = dA[i + 2];
      imgDiff.data[i + 3] = 80;
    }
  }
  ctxDiff.putImageData(imgDiff, 0, 0);
  const diffPngPath = `${OUT}/diff-${tag}.png`;
  writeFileSync(diffPngPath, await cDiff.toBuffer('png'));

  return {
    widthA: wA,
    heightA: hA,
    widthB: wB,
    heightB: hB,
    sizeMatched: wA === wB && hA === hB,
    comparedAt: { w: W, h: H },
    diffCount,
    total,
    diffPct: diffCount / total,
    zones: {
      top: zones.top,
      middle: zones.middle,
      bottom: zones.bottom,
    },
    diffPngPath,
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1400, height: 1500 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

// login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.type('input[type="email"]', 'test@example.com', { delay: 20 });
await page.type('input[type="password"]', 'letmein12345', { delay: 20 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
  page.click('button[type=submit]'),
]);
await new Promise((r) => setTimeout(r, 2500));

// اذهب إلى /breaking واكتب المدخل
await page.goto(`${BASE}/breaking`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(
  (h, s) => {
    const setVal = (el, v) => {
      const proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal(document.getElementById('composer-headline'), h);
    setVal(document.getElementById('composer-source'), s);
  },
  HEADLINE,
  SOURCE
);
await new Promise((r) => setTimeout(r, 1500)); // debounce+render

// ─── الطرف (أ): بكسلات المعاينة من الـcanvas ───
const previewDataUrl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) throw new Error('canvas not found');
  return c.toDataURL('image/png');
});
const previewPng = decodeDataUrlToBuffer(previewDataUrl);
writeFileSync(`${OUT}/side-A-preview.png`, previewPng);
console.log(`[capture] preview canvas → side-A-preview.png (${previewPng.length} bytes)`);

// ─── الطرف (ب): بايتات ملفّ التصدير — نلتقطها من blob قبل ضغط التنزيل ───
await page.evaluate(() => {
  const orig = URL.createObjectURL;
  window.__capturedBlob = null;
  URL.createObjectURL = function (blob) {
    if (blob instanceof Blob && blob.type.startsWith('image/')) {
      window.__capturedBlob = blob;
    }
    return orig.call(URL, blob);
  };
});

// اضغط زرّ «صدّر البطاقة»
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const btn = buttons.find((b) => b.textContent.trim() === 'صدّر البطاقة');
  if (!btn) return false;
  btn.click();
  return true;
});
if (!clicked) throw new Error('export button not found by text');
console.log('[export] clicked, waiting for blob…');

// انتظر التقاط blob
const exportDataUrl = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (window.__capturedBlob) {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('FileReader failed'));
          fr.readAsDataURL(window.__capturedBlob);
          return;
        }
        if (Date.now() - started > 30000) reject(new Error('timeout waiting for blob'));
        else setTimeout(tick, 300);
      };
      tick();
    })
);
const exportPng = decodeDataUrlToBuffer(exportDataUrl);
writeFileSync(`${OUT}/side-B-export.png`, exportPng);
console.log(`[capture] export blob → side-B-export.png (${exportPng.length} bytes)`);

// ─── القياس الحقيقيّ: (أ) vs (ب) ───
const real = await compareImages(previewPng, exportPng, 'real');
console.log('\n=== القياس الحقيقيّ · معاينة vs تصدير ===');
console.log(JSON.stringify(real, null, 2));

// ─── اختبار الحياة أ · self vs self ───
const selfMatch = await compareImages(previewPng, previewPng, 'self-match');
console.log('\n=== اختبار الحياة (أخضر) · معاينة vs نفسها ===');
console.log(JSON.stringify(selfMatch, null, 2));

// ─── اختبار الحياة ب · self vs nudged (1px shift) ───
const previewImg = await loadImage(previewPng);
const W = previewImg.width, H = previewImg.height;
const nudged = new Canvas(W, H);
const nCtx = nudged.getContext('2d');
// اسحب الصورة 1px إلى اليمين (بكسل واحد كافٍ لأنّه نصّ بحوافّ حادّة)
nCtx.drawImage(previewImg, 1, 0, W - 1, H);
nCtx.drawImage(previewImg, 0, 0, 1, H);
const nudgedPng = await nudged.toBuffer('png');
writeFileSync(`${OUT}/side-A-preview-nudged.png`, nudgedPng);
const selfNudged = await compareImages(previewPng, nudgedPng, 'self-nudged');
console.log('\n=== اختبار الحياة (أحمر) · معاينة vs نفسها-مُزاحة-1بكسل ===');
console.log(JSON.stringify(selfNudged, null, 2));

// نتيجة الحياة صريحة
const alivePass = selfMatch.diffCount === 0 && selfNudged.diffCount > 0;
console.log(
  `\n[life-test] ${alivePass ? '✔' : '✘'} baseline=${selfMatch.diffCount} · nudged=${selfNudged.diffCount}`
);

await browser.close();
console.log('\ndone.');
