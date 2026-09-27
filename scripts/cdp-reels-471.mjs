#!/usr/bin/env node
// cdp-reels-471 — حافّةُ القماشة (reels/471 §١–§٣).
//
// **القاعدةُ التي تتكوّنُ عندنا (471 §٢ — تُكتبُ هنا كعُرف):**
// > بوّابةٌ تقيس الوجودَ (بكسلاتٌ > 0) أو التبدّلَ (بصمةٌ تغيّرت) لا
// > تقيسُ الصحّة. كلُّ بوّابةٍ جديدةٍ يجبُ أن تُسأل: **ما الحالةُ التي
// > تجعلُها ترسب؟** فإن لم يكن لها جواب، فهي زينةٌ لا حارس.
//
// هذه البوّابةُ تُجيب: **صندوقُ نصٍّ خارجُ [0,1080]×[0,1920] بلا شهادةِ
// bleed يُرسبُها.** ونحن أفحصُ كلَّ الصناديقِ لا النشطَ وحدَه — صندوقٌ
// خارجٌ في غيرِ نافذتِه كذبةٌ مؤجَّلة، والبوّابةُ لا تؤجّل.
//
// **الغطاء — لقطةٌ واحدةٌ ومحقَّقاتُها:**
//   reels-13-edge.png   سحبةٌ حرّةٌ خارجَ الكادر: النصُّ مبتورٌ بالإطار
//                      المقصوص (لا يطفو)، مؤشّرُ التجاوزِ ظاهرٌ، والبوّابةُ
//                      خضراءُ لأنّ العمدَ معلَمٌ بشهادةِ السحبة.
//
// **المحقَّقات (من الـDOM/الحالة لا بالنظر):**
//   - §٣.3 برقمان: offset.x بعد سحبةٍ حرّةٍ (خارج)، وبعدَها مع Shift
//     (محصورٌ داخل الكادر بالضبط).
//   - §٢ البوّابةُ خضراءُ على العيّنة، وترسبُ حين يُكتبُ -480 بالحقول
//     (خروجٌ بلا شهادة)، وتعودُ خضراءَ بعد التراجع.
//   - §١.1 مؤشّرُ التجاوز: عبارةٌ تظهرُ والإطارُ يصفرُ إلى التحذير.
//   - §٣.4 إطارُ التحويمِ داخلُ حدودِ القماشةِ هندسيّاً — الحاويةُ تقصّه.
//
// **الخرج:** claude/reports/471-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/471-shots';
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

/** §٢ البوّابةُ نفسُها: خروجٌ بلا شهادةِ bleed ⇒ فشلٌ صريح. نُفحصُ
 *  الصناديقُ كلَّها (أشدُّ من «النشطِ» حرفاً — الكذبةُ المؤجَّلةُ كذبةٌ). */
function frameViolations(info) {
  const out = [];
  for (const b of info?.boxes ?? []) {
    if (b.outside && !b.bleed) out.push(b.itemId);
  }
  return out;
}

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
      el.focus();
      el.blur();
    },
    value,
  );
  await sleep(350);
}

const fieldValue = (page, testId) =>
  page.$eval(`[data-testid="${testId}"]`, (el) => el.value);

async function undo(page) {
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(450);
}

async function canvasRect(page) {
  return page.$eval('[data-testid="reels-preview-canvas"]', (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** سحبةُ صندوقٍ محدَّدٍ على القماشة — بإزاحةٍ بالبكسلِ الشاشيّة. */
async function dragBoxBy(page, dxScreen, dyScreen, { shift = false } = {}) {
  const info = await readLayout(page);
  const box = boxOf(info, 'title-01');
  const rect = await canvasRect(page);
  const factor = CANVAS_W / rect.width;
  const cx = rect.left + ((box.left + box.right) / 2) / factor;
  const cy = rect.top + ((box.top + box.bottom) / 2) / factor;
  await page.mouse.move(cx, cy);
  await sleep(200);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(cx + (dxScreen * i) / 6, cy + (dyScreen * i) / 6, {
      steps: 1,
    });
    await sleep(30);
  }
  await sleep(150);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await sleep(450);
  return factor;
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

  // (473) الصفحة صارت خلف AppShell في (app)/reels — فحصُ الجلسة عند
  // البدء وجوديٌّ (لا استدعاء API): توكنٌّ محليٌّ يكفي للأغطية.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pfmk.studio.session.access', 'cdp-local-token');
    localStorage.setItem('pfmk.studio.session.refresh', 'cdp-local-token');
  });
  await page.goto(`${BASE}/reels`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', {
    timeout: 10000,
  });
  await page.waitForSelector('[data-testid="reels-preview"][data-state="ready"]', {
    timeout: 15000,
  });
  await sleep(600);
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(400);

  // ── §٢ البوّابةُ على العيّنة: كلُّ الصناديقِ داخلُ الكادر ──
  const sampleInfo = await readLayout(page);
  const sampleViolations = frameViolations(sampleInfo);
  assertTrue(
    sampleViolations.length === 0,
    `البوّابةُ خضراءُ على العيّنة: ${sampleInfo.boxes.length} صناديقَ كلُّها داخلُ الكادر`,
  );

  // ── §٣.3 سحبةٌ حرّةٌ ثمّ نفسُها مع Shift — برقمان ──
  const dxScreen = -150;
  const dyScreen = 40;
  const factor = await dragBoxBy(page, dxScreen, dyScreen);
  const freeOffsetX = Number(await fieldValue(page, 'reels-prop-offset-x'));
  const freeInfo = await readLayout(page);
  const freeBox = boxOf(freeInfo, 'title-01');
  assertTrue(freeOffsetX === dxScreen * factor, `سحبةٌ حرّة: offset.x = ${freeOffsetX}`);
  assertTrue(freeBox?.outside === true, 'والصندوقُ خارجُ الكادر — عمدٌ مرئيٌّ بالإطار');
  // السحبةُ الحرّةُ أُفلتت خارجَ الكادرِ بيدٍ رأتِ التحذيرَ ⇒ شهادةُ bleed
  assertTrue(freeBox?.bleed === true, 'وأُفلتت بشهادةِ bleed — العمدُ معلَمٌ لا مهمل');
  assertTrue(
    frameViolations(freeInfo).length === 0,
    'فالبوّابةُ خضراءُ: خروجٌ معلَمٌ ليس خطأً (حكمُ §١)',
  );

  await undo(page);
  const undoneInfo = await readLayout(page);
  const undoneBox = boxOf(undoneInfo, 'title-01');
  assertTrue(
    frameViolations(undoneInfo).length === 0 && undoneBox?.outside === false,
    '⌘Z أعادت الداخلَ والبوّابةُ خضراءُ — والشهادةُ بطلت مع القيم',
  );

  await dragBoxBy(page, dxScreen, dyScreen, { shift: true });
  const shiftOffsetX = Number(await fieldValue(page, 'reels-prop-offset-x'));
  const shiftInfo = await readLayout(page);
  const shiftBox = boxOf(shiftInfo, 'title-01');
  assertTrue(
    shiftBox?.outside === false && shiftBox.left >= -0.5 && shiftBox.right <= CANVAS_W + 0.5,
    `Shift حصر: الصندوقُ [${shiftBox.left.toFixed(1)}, ${shiftBox.right.toFixed(1)}] داخلُ [0, ${CANVAS_W}]`,
  );
  // §٣.3 الرقمانِ المطلوبانِ نصّاً: الحرّةُ خارج، وبالـShift محصورةٌ
  // إلى حافةِ الكادر بالضبط (left0 = -offset.x بعد الحصر).
  process.stdout.write(
    `  §٣.3 الرقمان: سحبةٌ حرّة ⇒ offset.x = ${freeOffsetX} · ومع Shift ⇒ offset.x = ${shiftOffsetX} (حصرٌ إلى الحافة: left0 = ${(-shiftOffsetX).toFixed(1)})\n`,
  );
  await undo(page);

  // ── §٢ الحالةُ السلبيّةُ: -480 بالحقول — خروجٌ بلا شهادةٍ يرسب ──
  await setInput(page, 'reels-prop-offset-x', '-480');
  const badInfo = await readLayout(page);
  const badBox = boxOf(badInfo, 'title-01');
  const badViolations = frameViolations(badInfo);
  assertTrue(badBox?.outside === true && badBox?.bleed === false, '«-480» بالحقول: خارجٌ وبلا شهادة');
  assertTrue(
    badViolations.length > 0,
    `⇒ البوّابةُ **رسبت**: ${badViolations.join('، ')} — هذا هو جوابُ «ما الذي يُرسبُها؟»`,
  );

  // ── §١.1 مؤشّرُ التجاوز: عبارةٌ ظاهرةٌ وإطارٌ تحذيريٌّ ──
  const overflowLabel = await page.$('[data-testid="reels-preview-overflow"]');
  assertTrue(overflowLabel !== null, 'عبارةُ «جزءٌ خارجَ الكادر» ظاهرةٌ');
  const overflowText = await page.$eval(
    '[data-testid="reels-preview-overflow"]',
    (el) => el.textContent,
  );
  assertTrue(
    /خارج/.test(overflowText),
    `نصُّ المؤشّر من i18n: «${overflowText.trim()}»`,
  );
  // التحويمُ فوقَ الجزءِ المرئيّ من الصندوقِ ⇒ إطارٌ تحذيريٌّ مقصوص.
  const rect = await canvasRect(page);
  const visibleLeft = Math.max(badBox.left, 0);
  const visibleRight = Math.min(badBox.right, CANVAS_W);
  const hoverX = rect.left + ((visibleLeft + visibleRight) / 2) * (rect.width / CANVAS_W);
  const hoverY = rect.top + ((badBox.top + badBox.bottom) / 2) * (rect.width / CANVAS_W);
  await page.mouse.move(hoverX, hoverY);
  await sleep(350);
  const outlineState = await page.$eval(
    '[data-testid="reels-preview-box-outline"]',
    (el) => {
      const r = el.getBoundingClientRect();
      return {
        warning: el.className.includes('border-warning'),
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      };
    },
  );
  assertTrue(outlineState.warning, 'إطارُ التحويمِ صفرَ إلى التحذير (border-warning)');
  // §٣.4 هندسيّاً: الإطارُ داخلَ حدودِ القماشةِ — الحاويةُ تقصّه.
  assertClose(outlineState.left, rect.left, 1, 'حافةُ الإطارِ اليسرى عند حافةِ القماشة (مقصوص)');
  assertTrue(
    outlineState.right <= rect.left + rect.width + 1 &&
      outlineState.top >= rect.top - 1 &&
      outlineState.bottom <= rect.top + rect.height + 1,
    'الإطارُ كلُّه داخلَ مستطيلِ القماشة — لا يطفو في الفراغ',
  );

  await undo(page);
  const recoveredInfo = await readLayout(page);
  assertTrue(
    frameViolations(recoveredInfo).length === 0,
    '⌘Z استعادَ السلامةَ — البوّابةُ خضراءُ من جديد',
  );

  // ── بوّابةُ 469 ما زالت خضراءَ في هذه الحالة ──
  assertTrue(
    findOverlaps(recoveredInfo).length === 0 &&
      (recoveredInfo.collisionPairs ?? []).length === 0,
    'بوّابةُ التراكب (469 §٣) خضراءُ في ختامِ الفحوص',
  );

  // ── اللقطة: عمدٌ معلَمٌ — سحبةٌ حرّةٌ خارجَ الكادرِ تبقى ──
  await dragBoxBy(page, dxScreen, dyScreen);
  const shotInfo = await readLayout(page);
  const shotBox = boxOf(shotInfo, 'title-01');
  assertTrue(
    shotBox?.bleed === true && frameViolations(shotInfo).length === 0,
    'حالةُ اللقطة: خروجٌ معلَمٌ والبوّابةُ خضراء',
  );
  const shotRect = await canvasRect(page);
  const svLeft = Math.max(shotBox.left, 0);
  const svRight = Math.min(shotBox.right, CANVAS_W);
  await page.mouse.move(
    shotRect.left + ((svLeft + svRight) / 2) * (shotRect.width / CANVAS_W),
    shotRect.top + ((shotBox.top + shotBox.bottom) / 2) * (shotRect.width / CANVAS_W),
  );
  await sleep(400);
  await shot(page, 'reels-13-edge.png');

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