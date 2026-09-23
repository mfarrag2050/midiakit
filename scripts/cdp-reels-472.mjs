#!/usr/bin/env node
// cdp-reels-472 — سطرٌ حيث تشاء · وإنذارٌ موصولٌ بالشاشة (reels/472 §١–§٣).
//
// **العلّة (§٠):** المحرّكُ يحذّرُ من تراكبِ النصوصِ منذ 464
// (plan.collisions) — إنذارٌ يُطلَقُ ولا أحدَ يستمع. هذه الدورةُ تصلُهُ
// بالشاشةِ ولا تكتبُ بوّابةً جديدة: شريطُ تنبيهٍ فوقَ القماشةِ يسمّي
// المتصادمَين، وحدٌّ تحذيريٌّ على القطعتَين في الشريط — إخبارٌ لا منع.
// وكسرُ السطورِ اليدويُّ مبنيٌّ في المحرّك (BreakToken عند \n) —
// الناقصُ كان textarea.
//
// **الغطاء — لقطةٌ واحدةٌ ومحقَّقاتُها:**
//   reels-14-collision-break.png   شريطُ التصادمِ ظاهرٌ بقطعتَين
//                                  محدَّدتَين تحذيريّاً، والنصُّ في القماشة
//                                  بسطرَين يدويَّين.
//
// **المحقَّقات (من الـDOM/القماشة لا بالنظر):**
//   - §٣.٢ حالةٌ حيّة بالرقمَين: تصادمٌ عبر المسارات (title-01 ×
//     title-04) ⇒ الشريطُ يظهرُ وحدّا التحذيريُّ على القطعتَين ⇒
//     الفصلُ يُخفيهما. المخرَجانِ يُنقلان نصّاً.
//   - §٣.٣ الكسرُ اليدويُّ: نصٌّ بسطرَين ⇒ lines=2 وtext بلا فاصل ⇒
//     lines=1 — **والبصمتان مختلفتان** بالأرقام.
//   - §٣.٤ بوّابةُ الحدود (471) خضراءُ في الحالةِ النهائيّة —
//     وسلبيُّها يُعادُ تشغيلُه في سكربته.
//   - اتّساقٌ متقاطع: تصادمُ المحرّكِ المعروضُ = تقاطعُ الصناديقِ
//     المحسوبُ في السكربت — لا قولَين.
//
// **الخرج:** claude/reports/472-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/472-shots';

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

const readLayout = (page) =>
  page.$eval('[data-testid="reels-text-layout"]', (el) => {
    const txt = el.textContent;
    return txt ? JSON.parse(txt) : { boxes: [], collisions: [] };
  });

const boxOf = (info, itemId) =>
  (info?.boxes ?? []).find((b) => b.itemId === itemId);

/** بصمةُ قماشةِ المعاينة — مرآةُ تغيّرٍ لا مساواة (عُرف 469). */
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

function frameViolations(info) {
  const out = [];
  for (const b of info?.boxes ?? []) {
    if (b.outside && !b.bleed) out.push(b.itemId);
  }
  return out;
}

async function setInput(page, testId, value) {
  await page.$eval(
    `[data-testid="${testId}"]`,
    (el, v) => {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement
          : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (proto === HTMLInputElement) {
        el.focus();
        el.blur();
      }
    },
    value,
  );
  await sleep(400);
}

const hasTestId = async (page, testId) =>
  (await page.$(`[data-testid="${testId}"]`)) !== null;

const itemHasWarningRing = (page, testId) =>
  page.$eval(`[data-testid="${testId}"]`, (el) =>
    el.className.includes('ring-warning'),
  );

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

  // ── §٢ (في تذكرة 472): الكسرُ اليدويُّ — نفسُ النصِّ بفاصلٍ وبلا ──
  await page.click('[data-testid="reels-item-title-01"]');
  await sleep(300);
  const h0 = await canvasStats(page);
  await setInput(
    page,
    'reels-prop-value',
    'سطرٌ أوّلُ يبدأ الحكاية\nوسطرٌ ثانٍ يكمّلها',
  );
  const twoLineInfo = await readLayout(page);
  const h1 = await canvasStats(page);
  assertTrue(
    boxOf(twoLineInfo, 'title-01')?.lines === 2,
    `نصٌّ بفاصلٍ يدويّ ⇒ السطورُ ${boxOf(twoLineInfo, 'title-01')?.lines}`,
  );
  await setInput(
    page,
    'reels-prop-value',
    'سطرٌ أوّلُ يبدأ الحكاية وسطرٌ ثانٍ يكمّلها',
  );
  const oneLineInfo = await readLayout(page);
  const h2 = await canvasStats(page);
  assertTrue(
    boxOf(oneLineInfo, 'title-01')?.lines === 1,
    `نفسُ النصِّ بلا فاصل ⇒ السطورُ ${boxOf(oneLineInfo, 'title-01')?.lines}`,
  );
  assertTrue(
    h1.hash !== h2.hash,
    `§٣.٣ والبصمتان مختلفتان: بسطرَين ${h1.hash} · بلا فاصل ${h2.hash}`,
  );
  await undo(page); // نُبقي النصَّ بسطرَين لحالةِ اللقطة.
  assertTrue(
    boxOf(await readLayout(page), 'title-01')?.lines === 2,
    '⌘Z أعادت النصَّ إلى سطرَيه اليدويَّين',
  );

  // ── §١ حالةٌ حيّة: تصادمٌ عبر المسارات (تسلسلُ المسارِ يمنعُ
  //    التراكبَ داخله — فالتصادمُ الحيُّ الوحيدُ عبرَ مسارَين) ──
  await page.click('[data-testid="reels-add-track"]');
  await sleep(150);
  await page.click('[data-testid="reels-add-track-text"]');
  await sleep(400);
  await page.click('[data-testid="reels-add-item"]');
  await sleep(600);
  assertTrue(
    await hasTestId(page, 'reels-item-title-04'),
    'قطعةٌ جديدةٌ في مسارٍ نصٍّ ثانٍ (title-04) — تتداخلُ زمنيّاً مع title-01',
  );
  const beforeCollision = await readLayout(page);
  assertTrue(
    (beforeCollision.collisions ?? []).length === 0 &&
      !(await hasTestId(page, 'reels-collision-bar')),
    'قبل التصادم: الشريطُ مخفيٌّ (الموضعان 0.2 و0.8 مفترقان)',
  );

  // نفسُ موضعِ title-01 (anchor 0.2) مع تداخلٍ زمنيّ ⇒ إنذارُ المحرّك.
  await setInput(page, 'reels-prop-anchor', '0.2');
  await sleep(300);
  const barText = await hasTestId(page, 'reels-collision-bar')
    ? await page.$eval('[data-testid="reels-collision-bar"]', (el) => el.textContent)
    : '';
  const ringA = await itemHasWarningRing(page, 'reels-item-title-01');
  const ringB = await itemHasWarningRing(page, 'reels-item-title-04');
  process.stdout.write(
    `  «الشريطُ يظهرُ»: «${barText.trim()}» — وحدٌّ تحذيريٌّ على ${ringA ? 'title-01' : '—'}${ringB ? ' وtitle-04' : ''}\n`,
  );
  assertTrue(
    /تصادم/.test(barText) && /title-01/.test(barText) && /title-04/.test(barText),
    'شريطُ التصادم ظهرَ: كلمةٌ من i18n واسمُ القطعتَين',
  );
  assertTrue(ringA && ringB, 'والقطعتانِ تحملانِ الحدَّ التحذيريَّ في الشريط');

  // اتّساقٌ متقاطع: ما يعرضُه المحرّكُ هو ما تحسبُه الصناديقُ.
  const collidingInfo = await readLayout(page);
  const overlaps = findOverlaps(collidingInfo);
  assertTrue(
    overlaps.length === 1 && overlaps[0] === 'title-01×title-04',
    `اتّساق: تقاطعُ الصناديقِ ${overlaps.join('، ')} = المعروضُ في الشريط`,
  );

  // الفصلُ يُخفي الشريطَ والحدَّ.
  await setInput(page, 'reels-prop-anchor', '0.8');
  await sleep(300);
  const separatedGone = !(await hasTestId(page, 'reels-collision-bar'));
  const ringGone =
    !(await itemHasWarningRing(page, 'reels-item-title-01')) &&
    !(await itemHasWarningRing(page, 'reels-item-title-04'));
  process.stdout.write(
    `  «الشريطُ يختفي»: بعدَ الفصلِ غابَ الشريطُ${separatedGone ? '' : ' — لا!'} والحدُّ${ringGone ? ' غاب' : ' بقي!'}\n`,
  );
  assertTrue(
    separatedGone && ringGone,
    'وبعدَ الفصل: لا شريطَ ولا حدَّ — الإخبارُ يتبعُ الحقيقة',
  );

  // ── الحالةُ النهائيّةُ للقطة: تصادمٌ معروضٌ وسطرانِ يدويّان ──
  await setInput(page, 'reels-prop-anchor', '0.2');
  await sleep(400);
  const finalInfo = await readLayout(page);
  assertTrue(
    (finalInfo.collisions ?? []).length > 0 &&
      (await hasTestId(page, 'reels-collision-bar')),
    'حالةُ اللقطة: الإنذارُ ظاهرٌ',
  );
  assertTrue(
    boxOf(finalInfo, 'title-01')?.lines === 2,
    'حالةُ اللقطة: النصُّ بسطرَيه اليدويَّين',
  );
  assertTrue(
    frameViolations(finalInfo).length === 0,
    'بوّابةُ الحدود (471 §٢) خضراءُ في الحالةِ النهائيّة',
  );
  await shot(page, 'reels-14-collision-break.png');

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