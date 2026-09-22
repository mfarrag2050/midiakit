#!/usr/bin/env node
// cdp-reels-470 — اسحبْه حيث تشاء · وفاصلةٌ تخالف نقطة (reels/470 §١–§٤).
//
// **الغطاء — لقطةٌ واحدةٌ ومحقَّقاتُها:**
//   reels-12-canvas-drag.png   القماشةُ واللوحةُ المقرَّبةُ تحتها، وإطارُ
//                              التحويمِ حولَ صندوقِ النصّ المحدَّد.
//
// **المحقَّقات (من الـDOM/الحالة لا بالنظر):**
//   - §١ بعد الإصلاح: «3,5» و«٣٫٥» تُقرآن 3.5 لا صفراً (القياسُ قبلَ
//     الإصلاح أثبتَ الطحنَ إلى 0 — في تقرير الدورة)، والصيغةُ تتبعُ
//     مبدّل ١٢٣/123: لاتينيّةٌ «4.5» وعربيّةٌ «٤٫٥» عبر الشاشة.
//   - §٢ سحبةٌ واحدةٌ على القماشة: +١٠٠px أفقيّاً و+٦٠px رأسيّاً
//     بالفأرة ⇒ offset.x += 100×معاملِ التحويل وanchor += 60×المعامل/1920
//     (§٤.٣ حرفيّاً)، والحقولُ تتبعُ أثناءَ السحب، وتراجعٌ **واحدٌ**
//     يعيدُ كلَّ شيء.
//   - إطارُ التحويم يظهرُ فوقَ صندوقِ المحدَّد قبلَ الإمساك.
//   - §٣ اللوحةُ تحتَ القماشةِ مباشرةً — ترتيبُ الـDOM مقيسٌ.
//   - §٥ بوّابةُ 469 خضراءُ في هذه الحالة (والحالةُ السلبيّةُ في
//     سكربت 469 نفسِه — يُعادُ تشغيلُه).
//
// **الخرج:** claude/reports/470-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/470-shots';
const CANVAS_W = 1080;
const CANVAS_H = 1920;

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

function assertClose(actual, expected, tol, label) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  process.stdout.write(
    `  ${ok ? '✓' : '✗'} ${label}: ${actual} (متوقَّع ${expected} ±${tol})\n`,
  );
  if (!ok) failures += 1;
}

const readLayout = (page) =>
  page.$eval('[data-testid="reels-text-layout"]', (el) => {
    const txt = el.textContent;
    return txt ? JSON.parse(txt) : { boxes: [], collisionPairs: [] };
  });

const boxOf = (info, itemId) =>
  (info?.boxes ?? []).find((b) => b.itemId === itemId);

function findOverlaps(info) {
  const out = [];
  const boxes = info?.boxes ?? [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const tOverlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (tOverlap <= 0) continue;
      const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (yOverlap > 0) out.push(`${a.itemId}×${b.itemId}`);
    }
  }
  return out;
}

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
      // تركيزٌ ثمّ غيابٌ حقيقيّان: React يسمعُ focusout لا blur
      // التصنيعيّ، والقيمةُ المكرَّرةُ لا تُطلقُ onChange من دونها —
      // هذا مسارُ المستخدمِ بعينه (يكتبُ ثمّ يغادرُ الحقل).
      el.focus();
      el.blur();
    },
    value,
  );
  await sleep(350);
}

/** نقرُ زرِّ مبدّلِ الأرقام — useDigitStyle حالةٌ لكلِّ مستدعٍ لا
 *  تُبثُّ حيّاً، فالتبديلُ يظهرُ بعدَ إعادةِ التحميل (عرف 458). */
async function switchDigits(page, label) {
  await page.evaluate(
    (lbl) => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === lbl,
      );
      if (btn) btn.click();
    },
    label,
  );
  await sleep(400);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', {
    timeout: 10000,
  });
  await page.waitForSelector('[data-testid="reels-preview"][data-state="ready"]', {
    timeout: 15000,
  });
  await sleep(600);
}

const fieldValue = (page, testId) =>
  page.$eval(`[data-testid="${testId}"]`, (el) => el.value);

async function undo(page) {
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(450);
}

/** مركزُ صندوقٍ بإحداثيّات الشاشة — من الخريطة ومعاملِ التحويل. */
async function boxCenterOnScreen(page, info, itemId) {
  const box = boxOf(info, itemId);
  const rect = await page.$eval('[data-testid="reels-preview-canvas"]', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const factor = CANVAS_W / rect.width;
  return {
    factor,
    x: rect.left + ((box.left + box.right) / 2) / factor,
    y: rect.top + ((box.top + box.bottom) / 2) / factor,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1400, height: 1500 },
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

  // ── §١ بعد الإصلاح: الفاصلةُ والهنديّةُ تُقرآن، لا طحناً إلى صفر ──
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(300);
  const start0 = (boxOf(await readLayout(page), 'title-01') ?? {}).start;
  assertTrue(start0 === 0.5, `البدايةُ قبل الكتابة: ${start0}`);

  await setInput(page, 'reels-prop-start', '3,5');
  const startComma = (boxOf(await readLayout(page), 'title-01') ?? {}).start;
  assertTrue(
    startComma === 3.5,
    `«3,5» قُرئت ${startComma} — لا صفراً (قبلَ الإصلاح كانت تُطحنُ إلى 0)`,
  );
  await undo(page);

  await setInput(page, 'reels-prop-start', '٣٫٥');
  const startArabic = (boxOf(await readLayout(page), 'title-01') ?? {}).start;
  assertTrue(startArabic === 3.5, `«٣٫٥» قُرئت ${startArabic} — لا صفراً`);
  await undo(page);
  const startBack = (boxOf(await readLayout(page), 'title-01') ?? {}).start;
  assertTrue(startBack === 0.5, `⌘Z×2 أعادت البدايةَ إلى ${startBack}`);

  // الصيغةُ الموحَّدة باللاتينيّة: الحقلُ والمسطرةُ وسطرُ الزمن كلُّها
  // بنقطة — والحقولُ النصّيةُ لا يعجنها المتصفّح بعد اليوم.
  const latinShown = await fieldValue(page, 'reels-prop-start');
  assertTrue(
    /^0\.5$/.test(latinShown),
    `الصيغةُ اللاتينيّةُ موحَّدةٌ بالنقطة: الحقلُ يعرض «${latinShown}»`,
  );

  // ── §١ مع المبدّل: عربيّة-هنديّة ⇒ «٠٫٥» في الحقول والزمن معاً ──
  // useDigitStyle حالةٌ لكلِّ مستدعٍ فلا بثَّ حيّاً — إعادةُ تحميلٍ بعد
  // التبديل (عرف 458) ثمّ القياس.
  await switchDigits(page, '١٢٣');
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(300);
  const arabicShown = await fieldValue(page, 'reels-prop-start');
  assertTrue(
    /^٠٫٥$/.test(arabicShown),
    `بمبدّل ١٢٣: الحقلُ يعرض «${arabicShown}» (هنديّةٌ وفاصلةٌ عربيّة)`,
  );
  const arabicTime = await page.$eval(
    '[data-testid="reels-readout"]',
    (el) => el.textContent,
  );
  assertTrue(
    /[٠-٩]/.test(arabicTime),
    `وسطرُ الزمنِ بالمصدرِ نفسِه: «${arabicTime.trim()}»`,
  );
  // الكتابةُ بالهنديّةِ تحت الهنديّة تُقرأ: ٣٫٥ ⇒ 3.5.
  await setInput(page, 'reels-prop-start', '٣٫٥');
  const startHindi = (boxOf(await readLayout(page), 'title-01') ?? {}).start;
  assertTrue(startHindi === 3.5, `«٣٫٥» تحت العرضِ الهنديِّ قُرئت ${startHindi}`);
  await undo(page);
  // عُد إلى اللاتينيّة لبقيّةِ الفحوص.
  await switchDigits(page, '123');
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(300);
  const latinBack = await fieldValue(page, 'reels-prop-start');
  assertTrue(
    /^0\.5$/.test(latinBack),
    `بالعكسِ يعودُ بالنقطة: الحقلُ يعرض «${latinBack}»`,
  );

  // ── §٣ اللوحةُ تحتَ القماشةِ مباشرةً — ترتيبُ الـDOM مقيسٌ ──
  const order = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="reels-preview-canvas"]');
    const panel = document.querySelector('[data-testid="reels-properties"]');
    const strip = document.querySelector('[data-testid="reels-viewport"]');
    return {
      panelAfterCanvas: !!(panel && canvas && panel.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_PRECEDING),
      stripAfterPanel: !!(strip && panel && strip.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING),
    };
  });
  assertTrue(
    order.panelAfterCanvas && order.stripAfterPanel,
    'اللوحةُ بين القماشةِ والشريط — تحتَها مباشرةً',
  );

  // ── §٢ السحبُ على القماشة — إطارُ التحويم ثمّ سحبةٌ واحدة ──
  const info0 = await readLayout(page);
  const center0 = await boxCenterOnScreen(page, info0, 'title-01');
  const factor = center0.factor;
  assertTrue(
    Math.abs(factor - 1080 / 270) < 0.05,
    `معاملُ التحويل = ${factor.toFixed(3)} (1080 ÷ ${(CANVAS_W / factor).toFixed(1)}px معروضة)`,
  );

  // إطارُ التحويم يظهرُ فوقَ الصندوق قبلَ الإمساك.
  await page.mouse.move(center0.x, center0.y);
  await sleep(300);
  const outline = await page.$('[data-testid="reels-preview-box-outline"]');
  assertTrue(outline !== null, 'إطارُ التحويمِ ظهرَ حولَ صندوقِ المحدَّد');

  // سحبةٌ واحدة: +١٠٠px أفقيّاً و+٦٠px رأسيّاً بالفأرة.
  const dxMouse = 100;
  const dyMouse = 60;
  const anchorBefore = Number(await fieldValue(page, 'reels-prop-anchor'));
  const offsetXBefore = Number(await fieldValue(page, 'reels-prop-offset-x'));
  await page.mouse.down();
  await page.mouse.move(center0.x + dxMouse / 2, center0.y + dyMouse / 2, {
    steps: 2,
  });
  await sleep(450);
  // الحقولُ تتبعُ أثناءَ السحبِ — قراءةٌ والإصبعُ ما زالت على الزرّ.
  const offsetMidDrag = Number(await fieldValue(page, 'reels-prop-offset-x'));
  assertTrue(
    offsetMidDrag !== offsetXBefore && offsetMidDrag > 0,
    `الحقلُ يتبعُ السحبَ لحظةً بلحظة: offset.x ${offsetXBefore} → ${offsetMidDrag} والإفلاتُ لم يقع`,
  );
  await page.mouse.move(center0.x + dxMouse, center0.y + dyMouse, {
    steps: 2,
  });
  await sleep(200);
  await page.mouse.up();
  await sleep(500);

  const offsetXAfter = Number(await fieldValue(page, 'reels-prop-offset-x'));
  const expectedDx = dxMouse * factor;
  const expectedDy = dyMouse * factor;
  // الصندوقُ من الخريطةِ الحتميّة — مقياسُ anchor لا قيمةُ المُنزلِق
  // (المُنزلِقُ يكسرُ القيمةَ على شبكةِ خطوته عند العرض).
  const boxAfter = boxOf(await readLayout(page), 'title-01');
  const boxBefore = boxOf(info0, 'title-01');
  assertClose(
    offsetXAfter - offsetXBefore,
    expectedDx,
    4,
    `§٤.٣: إزاحةُ فأرةٍ ${dxMouse}px ⇒ offset.x +${expectedDx} على القماشة`,
  );
  assertClose(
    (boxAfter.top - boxBefore.top) / CANVAS_H,
    expectedDy / CANVAS_H,
    0.003,
    `§٤.٣: إزاحةُ فأرةٍ ${dyMouse}px ⇒ anchor +${(expectedDy / CANVAS_H).toFixed(4)} (من صندوقِ الخريطة)`,
  );
  assertTrue(
    boxAfter && boxBefore && Math.abs((boxAfter.top - boxBefore.top) - expectedDy) < 4,
    `الصندوقُ تحرّكَ رأسيّاً ${(boxAfter.top - boxBefore.top).toFixed(0)}px على القماشة`,
  );

  // تراجعٌ **واحدٌ** يعيدُ السحبةَ كلَّها — لا أثلاثاً في التاريخ.
  await undo(page);
  const anchorRestored = Number(await fieldValue(page, 'reels-prop-anchor'));
  const offsetXRestored = Number(await fieldValue(page, 'reels-prop-offset-x'));
  const boxRestored = boxOf(await readLayout(page), 'title-01');
  assertTrue(
    Math.abs(anchorRestored - anchorBefore) < 1e-9 &&
      Math.abs(offsetXRestored - offsetXBefore) < 1e-9,
    `⌘Z واحدةٌ أعادت السحبةَ كلَّها (anchor ${anchorRestored} وoffset.x ${offsetXRestored})`,
  );
  assertTrue(
    boxRestored && Math.abs(boxRestored.top - boxBefore.top) < 1,
    'وصندوقُ الخريطةِ عادَ إلى موضعه',
  );

  // ── §٥ بوّابةُ 469 في هذه الحالة ──
  const infoFinal = await readLayout(page);
  assertTrue(
    findOverlaps(infoFinal).length === 0 &&
      (infoFinal.collisionPairs ?? []).length === 0,
    'بوّابةُ التراكب (469 §٣) خضراءُ في ختامِ الفحوص',
  );

  // ── اللقطة: سحبةٌ حقيقيّةٌ تُرى، وإطارُ تحويمٍ فوقَ الصندوق ──
  // اسحبْ title-01 إلى موضعٍ جديدٍ يبقى (للقطة) ثمّ حوِّم لتظهرَ
  // المقبضُ، والتقط.
  const center1 = await boxCenterOnScreen(page, await readLayout(page), 'title-01');
  await page.mouse.move(center1.x, center1.y);
  await sleep(150);
  await page.mouse.down();
  await page.mouse.move(center1.x - 120, center1.y + 150, { steps: 3 });
  await sleep(250);
  await page.mouse.up();
  await sleep(400);
  const center2 = await boxCenterOnScreen(page, await readLayout(page), 'title-01');
  await page.mouse.move(center2.x, center2.y);
  await sleep(400);
  await shot(page, 'reels-12-canvas-drag.png');

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