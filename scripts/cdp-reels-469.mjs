#!/usr/bin/env node
// cdp-reels-469 — بوّابةٌ تقيسُ الصحّةَ لا الوجود (reels/469 §٣–§٥).
//
// **العلّة (§٠):** لقطةُ 468 اجتازت «بكسلات > 0» و«البصمةُ تغيّرت»
// وكانت خربشةً متراكبة. العلاجُ هنا مقياسٌ جديدٌ + لوحةُ الخصائص:
//
// **الغطاء — لقطةٌ واحدةٌ ومحقَّقاتُها:**
//   reels-11-free-position.png   المعاينةُ بعد العلاج: النصوصُ مفترقةٌ
//                                (anchors صريحة) ولوحةُ الخصائصِ ظاهرةٌ
//                                وقطعةٌ مضافةٌ حديثاً محدَّدة.
//
// **المحقَّقات (من الـDOM/القماشة لا بالنظر):**
//   - §٣ البوّابةُ الجديدة: من `reels-text-layout` (صناديقُ النصوص من
//     خطّة المحرّك نفسِها) — كلُّ قطعتَين متداخلتَين زمنيّاً تقاطعُهما
//     الرأسيُّ **صفر**. تُفحصُ على العيّنة، وبعد الإضافة (سيناريو عطبِ
//     468 بعينه)، وبعد التراجع.
//   - §٥٫٢ الحالةُ السلبيّة: مساواةُ موضعَين مؤقّتاً (مُنزلِقُ anchor)
//     ⇒ البوّابةُ **ترسب** (تصطدمُ وتُخفق) ⇒ ⌘Z ⇒ تعودُ خضراء.
//   - §٤ لوحةُ الخصائص: حقولُ النوعِ وحدَه (نص/وسائط/صوت) · الكتابةُ
//     في حقلِ النصِّ تُبدّلُ إطارَ المعاينةِ فوراً · المُنزلِقُ يحرّكُ
//     الصندوقَ قياساً · تعديلاتُ الوسائط (kenBurns من) تُبدّلُ الإطارَ ·
//     وكلُّ تعديلٍ يدخلُ History (التراجعُ يعيدُ الصندوقَ إلى موضعه).
//
// **الخرج:** claude/reports/469-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/469-shots';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  process.stdout.write(`  ✓ ${name}\n`);
}

let failures = 0;
function assertTrue(ok, label) {
  process.stdout.write(`  ${ok ? '✓' : '✗'} ${label}\n`);
  if (!ok) failures += 1;
}

/** بصمةُ قماشةِ المعاينة: عددُ البكسلاتِ غيرِ الشفّافةِ + djb2. */
const canvasStats = (page) =>
  page.$eval('[data-testid="reels-preview-canvas"]', (el) => {
    const ctx = el.getContext('2d');
    const d = ctx.getImageData(0, 0, el.width, el.height).data;
    let count = 0;
    let h = 5381;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) count += 1;
      h = (h * 33) ^ (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24));
    }
    return { count, hash: h };
  });

/** خريطةُ صناديقِ النصوص من آخر إطار — من صفحة dev (469 §٣). */
const readLayout = (page) =>
  page.$eval('[data-testid="reels-text-layout"]', (el) => {
    const txt = el.textContent;
    return txt ? JSON.parse(txt) : { boxes: [], collisionPairs: [] };
  });

/** §٣ حرفيّاً: لكلِّ زوجٍ يتداخلُ زمنيّاً، تقاطعُهما الرأسيُّ يجب أن
 *  يكونُ صفراً. التلامسُ عند نقطةٍ (تقاطعٌ = 0) سلامٌ كصيغة المحرّك. */
function findOverlaps(info) {
  const out = [];
  const boxes = info?.boxes ?? [];
  for (let i =  0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const tOverlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (tOverlap <= 0) continue;
      const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (yOverlap > 0) out.push(`${a.trackId}:${a.itemId}×${b.trackId}:${b.itemId}`);
    }
  }
  return out;
}

const boxOf = (info, itemId) =>
  (info?.boxes ?? []).find((b) => b.itemId === itemId);

/** كتابةٌ في حقلِّ إدخالٍ عبر الـsetter الأصليّ — كما مسطرة 458. */
async function setInput(page, testId, value) {
  await page.$eval(
    `[data-testid="${testId}"]`,
    (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value,
  );
  await sleep(350);
}

/** حضورُ عنصرٍ بلا رمي — الغيابُ هنا نتيجةٌ لا خطأ. */
const present = async (page, testId) =>
  (await page.$(`[data-testid="${testId}"]`)) !== null;

async function undo(page) {
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(450);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // ١٤٥٠: المعاينةُ + الشريطُ + الأزرارُ + لوحةُ الخصائصِ كلُّها في
    // اللقطة — بلا قطع.
    defaultViewport: { width: 1400, height: 1450 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) =>
    process.stderr.write(`[pageerror] ${e.message}\n`),
  );

  await page.goto(`${BASE}/dev/reels`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', {
    timeout: 10000,
  });
  await page.waitForSelector('[data-testid="reels-preview"][data-state="ready"]', {
    timeout: 15000,
  });
  await sleep(600);

  // ── §٣ على العيّنة: anchors صريحة ⇒ لا تقاطعَ ولا تصادم ──
  const layout0 = await readLayout(page);
  assertTrue(
    (layout0.boxes ?? []).length >= 3,
    `خريطةُ الصناديق تُصدَّر: ${layout0.boxes?.length ?? 0} صناديقَ نصٍّ`,
  );
  const overlaps0 = findOverlaps(layout0);
  assertTrue(
    overlaps0.length === 0 && (layout0.collisionPairs ?? []).length === 0,
    `§٣ على العيّنة: صفرُ تقاطعٍ وصفرُ تصادم (المحرك: ${layout0.collisionPairs?.length ?? 0})`,
  );
  // مرجعٌ حتميٌّ قبل أيّ تحرير — التراجعُ يُقارَنُ على الصناديق لا على
  // البكسل: بصمةُ القماشة مرآةُ تغيّرٍ لا مرآةَ مساواة (تنقيطُ إعادة
  // الرسم يبدّل صفاً متناثراً بين إطارَين متطابقَين — قيس بمسبار 469).
  const t1Before = boxOf(layout0, 'title-01');
  assertTrue(
    t1Before !== undefined,
    `صندوقُ title-01 مرجعاً: top ${t1Before?.top.toFixed(0)}`,
  );

  // ── §٤ لوحةُ الخصائص — على title-01: نشطةٌ عند 4.5 فتُرى ──
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(300);
  assertTrue(
    await present(page, 'reels-properties'),
    'اللوحةُ تظهرُ عند تحديدِ قطعة',
  );
  for (const f of ['reels-prop-value', 'reels-prop-anchor', 'reels-prop-offset-x', 'reels-prop-offset-y']) {
    assertTrue(
      await present(page, f),
      `حقلُ النصِّ حاضر: ${f}`,
    );
  }
  assertTrue(
    !(await present(page, 'reels-prop-src')) &&
      !(await present(page, 'reels-prop-gain')),
    'لا حقولَ وسائطَ ولا صوتٍ لقطعةِ نصٍّ — حقولُ النوعِ وحدَه',
  );

  // الكتابةُ تُبدّلُ الإطارَ فوراً — على قطعةٍ تُرى عند رأس القراءة.
  const h0 = await canvasStats(page);
  await setInput(page, 'reels-prop-value', 'نصٌّ يحرّكه المالكُ إلى أيِّ مكان');
  const h1 = await canvasStats(page);
  assertTrue(
    h1.hash !== h0.hash,
    `الكتابةُ في حقلِ النصِّ بدّلت الإطار (${h0.hash} → ${h1.hash})`,
  );

  // المُنزلِقُ يحرّكُ الصندوقَ — قياساً من الخريطة (حتميّ) والبكسلُ
  // معه لأنّ القطعةَ تُرى.
  await setInput(page, 'reels-prop-anchor', 0.35);
  const t1Moved = boxOf(await readLayout(page), 'title-01');
  const h2 = await canvasStats(page);
  assertTrue(
    t1Moved && t1Before && t1Moved.top !== t1Before.top,
    `المُنزلِقُ حرّك الصندوقَ (top ${t1Before?.top.toFixed(0)} → ${t1Moved?.top.toFixed(0)})`,
  );
  assertTrue(h2.hash !== h1.hash, 'الإطارُ تبدّل مع الموضع');

  // التراجعُ يعيدُ الصندوقَ إلى مرجعِه — كلُّ تعديلٍ عبر apply (§٤).
  await undo(page);
  await undo(page);
  const t1Restored = boxOf(await readLayout(page), 'title-01');
  assertTrue(
    t1Restored && t1Before &&
      t1Restored.top === t1Before.top && t1Restored.bottom === t1Before.bottom,
    `⌘Z×2 أعاد الصندوقَ إلى موضعه (top ${t1Restored?.top.toFixed(0)} = ${t1Before.top.toFixed(0)})`,
  );

  // ── §٣ على سيناريو عطبِ 468: قطعةٌ مضافةٌ تتداخلُ زمنيّاً مع
  //    title-01 — الافتراضيُّ 0.8 فلا تركبُ أحداً ──
  await page.click('[data-testid="reels-add-track"]');
  await sleep(150);
  await page.click('[data-testid="reels-add-track-text"]');
  await sleep(400);
  await page.click('[data-testid="reels-add-item"]');
  await sleep(600);
  const layoutAdd = await readLayout(page);
  const overlapsAdd = findOverlaps(layoutAdd);
  const newBox = boxOf(layoutAdd, 'title-04');
  assertTrue(
    newBox !== undefined,
    'القطعةُ المضافة (title-04) في خريطةِ الصناديق',
  );
  assertTrue(
    overlapsAdd.length === 0 && (layoutAdd.collisionPairs ?? []).length === 0,
    `§٣ بعد الإضافة (سيناريو 468 بعينه): صفرُ تقاطع — ${overlapsAdd.length || 'لا أزواج'} والمحرك: ${layoutAdd.collisionPairs?.length ?? 0}`,
  );

  // ── §٥٫٢ الحالةُ السلبيّة: مساواةُ الموضعَين ⇒ البوّابةُ ترسب ──
  // القطعةُ المضافةُ ما زالت محدَّدةً — مُنزلِقُها إلى 0.2 (موضعُ title-01).
  await setInput(page, 'reels-prop-anchor', 0.2);
  const layoutBad = await readLayout(page);
  const overlapsBad = findOverlaps(layoutBad);
  assertTrue(
    overlapsBad.length > 0,
    `الحالةُ السلبيّة: موضعانِ متساويان ⇒ البوّابةُ رسبت (${overlapsBad.join('، ')})`,
  );
  assertTrue(
    (layoutBad.collisionPairs ?? []).length > 0,
    `ومحركُ المحركِ يوافقُ: ${layoutBad.collisionPairs?.length ?? 0} تصادماً`,
  );
  await undo(page);
  const layoutBack = await readLayout(page);
  assertTrue(
    findOverlaps(layoutBack).length === 0 &&
      (layoutBack.collisionPairs ?? []).length === 0,
    '⌘Z استعادَ السلامةَ — البوّابةُ خضراءُ من جديد',
  );

  // ── وسائط: الأصلُ وkenBurns — التعديلُ يُبدّلُ الإطارَ ──
  await page.click('[data-testid="reels-item-clip-01"]');
  await sleep(300);
  assertTrue(
    (await present(page, 'reels-prop-src')) &&
      (await present(page, 'reels-prop-kb-from')) &&
      (await present(page, 'reels-prop-kb-to')),
    'حقولُ الوسائطِ حاضرةٌ للأصلِ ومن/إلى kenBurns',
  );
  assertTrue(
    !(await present(page, 'reels-prop-value')) &&
      !(await present(page, 'reels-prop-gain')),
    'لا حقولَ نصٍّ ولا gain لقطعةِ وسائط',
  );
  const hm0 = await canvasStats(page);
  await setInput(page, 'reels-prop-kb-from', 1.05);
  const hm1 = await canvasStats(page);
  assertTrue(
    hm1.hash !== hm0.hash,
    `تعديلُ kenBurns من بدّل الإطار (${hm0.hash} → ${hm1.hash})`,
  );
  await undo(page);

  // ── صوت: gain وحدَه ──
  await page.click('[data-testid="reels-item-vo-main"]');
  await sleep(300);
  assertTrue(
    (await present(page, 'reels-prop-gain')) &&
      !(await present(page, 'reels-prop-value')) &&
      !(await present(page, 'reels-prop-src')),
    'قطعةُ الصوت: gain وحدَه — المحرّكُ لا يرسمُ صوتاً',
  );

  // ── اللقطة النهائية: أعِد تحديدَ القطعةِ المضافةِ حديثاً ──
  await page.click('[data-testid="reels-item-title-04"]');
  await sleep(500);
  const finalLayout = await readLayout(page);
  assertTrue(
    findOverlaps(finalLayout).length === 0,
    'الحالةُ النهائيّةُ سليمةٌ قبل اللقطة',
  );
  await shot(page, 'reels-11-free-position.png');

  await browser.close();

  if (failures > 0) {
    process.stderr.write(`fatal: ${failures} فشل تحقّق\n`);
    process.exit(1);
  }
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});