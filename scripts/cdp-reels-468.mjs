#!/usr/bin/env node
// cdp-reels-468 — لقطة الإنشاء: أزرارُ «أضِفْ مساراً» و«أضِفْ قطعةً»
// (reels/468 §٥٫٣).
//
// **الغطاء — لقطةٌ واحدة وستَّ عشرةَ محقَّقة:**
//   reels-10-add.png   مساران نصٌّ فوق بعضهما (trk-text-2 · trk-text-3)
//                      وقطعةٌ مضافةٌ حديثاً في الأعلى — والمعاينةُ ترسمُها.
//
// **المحقَّقات (كلُّها من الـDOM/البكسل لا بالنظر):**
//   - «أضِفْ قطعةً» معطَّلٌ قبل اختيار مسارٍ — قطعةٌ بلا مسارٍ لا معنى لها.
//   - قائمةُ «أضِفْ مساراً» تفتحُ وتُغلقُ عند الاختيار (سلوكُ القوائم).
//   - بعد مسارَي نصٍّ: خمسةُ ممرّات، والجديدان فارغان، فوقَ الأصليّة،
//     ومتاخمان — هذه هي الطبقيّةُ التي طلبها المالك (468 §٤).
//   - القطعةُ الجديدة: ٣ث عند رأس القراءة (4.5ث) على المسار المضاف
//     الأخير، وinsert يُطيلُ المدّة 32→35 (قراءةٌ + هندسةٌ).
//   - المعاينةُ ترسمُها: بكسلاتٌ غيرُ شفّافةٍ وبصمةٌ تختلفُ عن قبل
//     الإضافة (§٥٫٣ حرفيّاً).
//   - التراجعُ والإعادة عبر ⌘Z/⌘⇧Z يمسحان القطعةَ ويعيدانها — كلا
//     الفعلَين يدخلان History عبر `apply` (§٤).
//
// **الخرج:** claude/reports/468-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/468-shots';
// مدّةُ عيّنةِ /dev/reels قبل أيّ إضافة، ورأسُ القراءة الابتدائيّ.
const DURATION0 = 32;
const PLAYHEAD0 = 4.5;
const NEW_ITEM_SEC = 3;

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

/** start% لقطعة: بُعدُ حافتها اليُمنى عن حافة ممرّها اليُمنى ÷ عرضه. */
async function startPct(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (el) => {
    const lane = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return ((lane.right - r.right) / lane.width) * 100;
  });
}

/** width% لقطعة نسبةً إلى ممرّها. */
async function widthPctOf(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (el) => {
    const lane = el.parentElement.getBoundingClientRect();
    return (el.getBoundingClientRect().width / lane.width) * 100;
  });
}

/** بصمةُ قماشةِ المعاينة: عددُ البكسلاتِ غيرِ الشفّافةِ + djb2 على
 *  البكسلات — كما في cdp-reels (466). */
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

/** عددُ الممرّات المصوَّرة في الشريط. */
const laneCount = (page) =>
  page.$$eval('[data-testid^="reels-track-"]', (els) => els.length);

/** هل الممرُّ خالٍ من القطع؟ */
const laneEmpty = (page, trackId) =>
  page.$eval(`[data-testid="reels-track-${trackId}"]`, (lane) =>
    lane.querySelector('[data-testid^="reels-item-"]') === null,
  );

/** y لممرٍّ — لترتيب الأعلى→الأسفل (index تنازليّاً). */
const laneY = (page, trackId) =>
  page
    .$eval(`[data-testid="reels-track-${trackId}"]`, (el) => {
      const r = el.getBoundingClientRect();
      return r.top;
    });

/** فتحُ قائمةِ «أضِفْ مساراً» واختيارُ نوعٍ منها — ثمّ تُغلقُ بنفسها. */
async function addTrackByMenu(page, type) {
  await page.click('[data-testid="reels-add-track"]');
  await sleep(150);
  await page.click(`[data-testid="reels-add-track-${type}"]`);
  await sleep(400);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // ١٢٠٠: المعاينةُ (٤٨٠px) فوقَ الشريطِ (٥ ممرّات) فوقَ الأزرار —
    // لقطةٌ واحدةٌ تجمعُها كلَّها بلا قطع.
    defaultViewport: { width: 1400, height: 1200 },
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

  // ── الحالةُ الأصليّة: ثلاثةُ ممرّات، والمعاينةُ ترسم، والزرُّ
  //    معطَّلٌ بلا مسارٍ مختار ──
  assertTrue(
    (await laneCount(page)) === 3,
    'قبل الإضافة: ثلاثةُ ممرّات (media · text · audio)',
  );
  const stats0 = await canvasStats(page);
  assertTrue(stats0.count > 0, `المعاينةُ ترسمُ قبل الإضافة: ${stats0.count} بكسلاً`);
  const addItemDisabled0 = await page.$eval(
    '[data-testid="reels-add-item"]',
    (el) => el.disabled,
  );
  assertTrue(addItemDisabled0, '«أضِفْ قطعةً» معطَّلٌ قبل اختيار مسارٍ');

  // ── مسارُ نصٍّ أوّل (trk-text-2): القائمةُ تُغلقُ عند الاختيار ──
  await addTrackByMenu(page, 'text');
  const menuClosed = await page.$eval(
    '[data-testid="reels-add-track"]',
    (el) => !el.parentElement.open,
  );
  assertTrue(menuClosed, 'قائمةُ «أضِفْ مساراً» أُغلقت عند الاختيار');
  assertTrue(
    (await laneCount(page)) === 4,
    'بعد مسارِ النصّ الأوّل: أربعةُ ممرّات',
  );
  assertTrue(
    await laneEmpty(page, 'trk-text-2'),
    'trk-text-2 وُلدَ فارغاً',
  );
  const addItemEnabled = await page.$eval(
    '[data-testid="reels-add-item"]',
    (el) => !el.disabled,
  );
  assertTrue(
    addItemEnabled,
    '«أضِفْ قطعةً» فُعِّل باختيارِ المسارِ المضافِ تلقائيّاً',
  );

  // ── مسارُ نصٍّ ثانٍ (trk-text-3): الطبقيّةُ فوقَ الأصليّة ──
  await addTrackByMenu(page, 'text');
  assertTrue(
    (await laneCount(page)) === 5,
    'بعد مسارِ النصّ الثاني: خمسةُ ممرّات — مساران من نوعٍ واحدٍ مسموحان',
  );
  assertTrue(
    await laneEmpty(page, 'trk-text-3'),
    'trk-text-3 وُلدَ فارغاً',
  );
  // الترتيبُ البصريّ (أعلى→أسفل = index تنازليّاً): الجديدان فوقَ
  // الصوت، والصوتُ فوقَ النصّ الأصليّ فوقَ الوسائط — والجديدان
  // متاخمان: هذه «مساران نصٌّ فوق بعضهما».
  const y = {
    t3: await laneY(page, 'trk-text-3'),
    t2: await laneY(page, 'trk-text-2'),
    au: await laneY(page, 'trk-audio'),
    tx: await laneY(page, 'trk-text'),
    md: await laneY(page, 'trk-media'),
  };
  assertTrue(
    y.t3 < y.t2 && y.t2 < y.au && y.au < y.tx && y.tx < y.md,
    `الطبقيّةُ: الجديدان فوق الكلّ ومتاخمان (y ${y.t3.toFixed(0)} < ${y.t2.toFixed(0)} < ${y.au.toFixed(0)} < ${y.tx.toFixed(0)} < ${y.md.toFixed(0)})`,
  );

  // ── القطعةُ الجديدة: ٣ث عند رأس القراءة على الممرّ المحدَّد
  //    (الأخير)، بـinsert فتُطيلُ المدّة ──
  await page.click('[data-testid="reels-add-item"]');
  await sleep(600);
  const inTopLane = await page.$eval(
    '[data-testid="reels-track-trk-text-3"]',
    (lane) => lane.querySelector('[data-testid="reels-item-title-04"]') !== null,
  );
  assertTrue(
    inTopLane,
    'القطعةُ title-04 وُلدت في المسار المحدَّد (trk-text-3 الأخير)',
  );
  const readout = await page.$eval(
    '[data-testid="reels-readout"]',
    (el) => el.textContent,
  );
  assertTrue(
    /35/.test(readout),
    `insert أطالَ المدّة إلى 35 — القراءة: «${readout.trim()}»`,
  );
  // هندسةُ القطعة: تبدأ عند 4.5/35 وعرضُها 3/35 من الممرّ.
  assertClose(
    await startPct(page, 'reels-item-title-04'),
    (PLAYHEAD0 / 35) * 100,
    0.75,
    'title-04 تبدأ عند رأس القراءة (start%)',
  );
  assertClose(
    await widthPctOf(page, 'reels-item-title-04'),
    (NEW_ITEM_SEC / 35) * 100,
    0.75,
    'title-04 عرضُها ٣ ثوانٍ (width%)',
  );

  // ── المعاينةُ ترسمُها: بصمةٌ مختلفةٌ عن قبل الإضافة (§٥٫٣) ──
  const previewState = await page.$eval('[data-testid="reels-preview"]', (el) =>
    el.getAttribute('data-state'),
  );
  assertTrue(previewState === 'ready', `حالةُ المعاينة "ready" — قِيل: "${previewState}"`);
  const stats1 = await canvasStats(page);
  assertTrue(
    stats1.count > 0,
    `المعاينةُ ترسمُ بعد الإضافة: ${stats1.count} بكسلاً غيرَ شفّاف`,
  );
  assertTrue(
    stats1.hash !== stats0.hash,
    `بصمةُ الإطار تغيّرت بعد الإضافة (${stats0.hash} → ${stats1.hash})`,
  );

  // ── التراجع والإعادة: الفعلان يدخلان History عبر apply (§٤) ──
  await page.keyboard.down('Meta');
  await page.keyboard.press('z');
  await page.keyboard.up('Meta');
  await sleep(500);
  const goneAfterUndo = await laneEmpty(page, 'trk-text-3');
  const readoutUndo = await page.$eval(
    '[data-testid="reels-readout"]',
    (el) => el.textContent,
  );
  assertTrue(
    goneAfterUndo && /32/.test(readoutUndo),
    `⌘Z محا القطعةَ ورجعَ المدّةَ إلى 32 — القراءة: «${readoutUndo.trim()}»`,
  );
  const statsUndo = await canvasStats(page);
  assertTrue(
    statsUndo.hash !== stats1.hash,
    `بصمةُ الإطار بعد التراجع تغيّرت (${stats1.hash} → ${statsUndo.hash})`,
  );
  await page.keyboard.down('Meta');
  await page.keyboard.down('Shift');
  await page.keyboard.press('z');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Meta');
  await sleep(600);
  const backAfterRedo = await page.$eval(
    '[data-testid="reels-track-trk-text-3"]',
    (lane) => lane.querySelector('[data-testid="reels-item-title-04"]') !== null,
  );
  assertTrue(backAfterRedo, '⌘⇧Z أعاد القطعةَ كما كانت');

  // ── اللقطة: مساران نصٌّ فوق بعضهما وقطعةٌ مضافةٌ حديثاً ──
  await shot(page, 'reels-10-add.png');

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
