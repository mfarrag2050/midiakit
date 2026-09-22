#!/usr/bin/env node
// cdp-reels — لقطات محرّر الخطّ الزمني على /dev/reels (reels/454 → 456 → 458 → 463).
//
// **الغطاء (458 §2.3 — ستُّ لقطات · و463 أضافت السابعة):**
//   reels-01-idle.png           الشريط ساكناً
//   reels-02-selected.png       وقطعةٌ مختارة
//   reels-03-after-drag.png     بعد نقلِ قطعةٍ برمزيّاً (سحب ماوس فعليّ
//                               عبر أحداث CDP — يمارس مسار السحب الحقيقيّ)
//   reels-04-after-split.png    بعد شطرٍ عند رأس القراءة (اختصار S)
//   reels-05-arabic-digits.png  ومبدّلُ الأرقام على ١٢٣
//   reels-06-zoomed.png         الشريطُ مقرَّباً (×8): المحتوى تجاوز
//                               العرضَ والتمريرُ ظاهر.
//   reels-07-preview.png        الزجاجُ الأماميّ (463): القماشةُ فوق
//                               الشريط ترسمُ إطارَ رأس القراءة.
//
// **القياسات قبل اللقطات (456 §٣ · 463 قلبَ اتجاهَ الأسهم):** سطرُ
// اللقطات يبدأ بحالةٍ نظيفة، لذا يُقاس التحريكُ أوّلاً ثمّ تُعاد قراءة
// الصفحة:
//   - bidi: ترتيب «⌘Z» البصريّ (عطبت 454: Z⌘ — قيس قبل الإصلاح
//     في تقرير 456، وهنا يُتحقَّق من التصحيح بمواضع Range.x).
//   - الأسهمُ تمضي حيث تشير (463): **← تقدّماً في الزمن** و→ عَكساً —
//     قياساً من الـDOM لا افتراضاً. ⇧ = خطوة أوسع (علامة كبرى).
//     القياسُ على title-02 — أوسعِ فجوةٍ في العيّنة (للوسائطُ ثانيةٌ
//     واحدةٌ تكفي نُقلَها منذ 464).
//   - [ / ] يقصّان الحافّتين: العرضُ ينقص بقدر الخطوة.
//
// **قياسات الزوم (458 §١) — كلّها من الـDOM بالحساب لا بالنظر:**
//   - الإثبات الهندسيّ: عرضُ قطعةٍ مدّتُها D يساوي D × pxPerSec عند
//     مستويَي زوم (الملاءمة و×8) — pxPerSec مستنتَجٌ من عرض الممرّ
//     في الـHTML نفسه، والنسبةُ بين العرضَين = 8.
//   - ⌘+عجلة (Input.dispatchMouseEvent بـmodifiers=4) تقرِّب وتمحور
//     رأسَ القراءة (موضعه داخل المستطلع يثبت)، وعجلةٌ عكسيةٌ تعود
//     بالضبط إلى الملاءمة (عامل exp متماثل).
//   - الأزرار المعلنة (+ ×3 ⇒ ×8) وزرا لوحة المفاتيح ⌘= / ⌘− (المختصران
//     المعلنان في aria-keyshortcuts).
//   - كثافة المسطرة تتبع الزوم: عددُ التسميات 7 (خطوة 5ث) عند
//     الملاءمة ⇒ 65 (خطوة 0.5ث) عند ×8، وأصغرُ تباعدٍ بين تسميتين
//     ≥ 48px — لا ازدحامَ أبداً.
//   - التمرير: عجلةٌ وحدها (بلا مُعدِّلات) تُقدّم العرضَ 240px، والصفرُ
//     يبقى يمينَ المحتوى (تسميةُ الصفر تخرج يميناً خارج الشاشة —
//     التمريرَ لا يقلب الاتّجاه).
//
// **التحقّق الداخليّ:** بعد كلّ خطوة نقرأ الهندسة من الـDOM ونقارنها
// بالمتوقَّع — اللقطة تُلتقط فقط إن صحّت الخطوة التي قبلها. فشل
// تحقّق ⇒ exit 1 مع رسالة.
//
// **ملاحظة قياس:** المواضع صارت بكسلاً (458) لا نسباً مئويّة في
// style — لذا تُستنتج النسبُ من getBoundingClientRect دائماً: start%
// = بُعدُ حافة القطعة اليُمنى عن حافة الممرّ اليُمنى ÷ عرض الممرّ.
// النسبةُ إلى المدّة ثابتةٌ عبر الزوم كلّه، فتصلح للملاءمة والتقريب.
//
// **المخرجات:** `claude/reports/458-shots/` (أو argv[2] — مسار مطلق
// مقبول). شغِّ والخادم قائم على 127.0.0.1:19050:
//   pnpm --filter @pf-mediakit/studio dev
//   node scripts/cdp-reels.mjs [outDir]

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/458-shots';
// مدّة عيّنة /dev/reels — SAMPLE.duration في apps/studio/app/dev/reels/page.tsx
const DURATION = 32;
// فائضُ التمرير المهمل — يطابق SCROLL_SLACK_PX في TimelineStrip.tsx.
const SCROLL_SLACK_PX = 8;
// CDP Input.dispatchMouseEvent modifiers bitmask: Alt=1 · Ctrl=2 · Meta=4.
const MOD_META = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  process.stdout.write(`  ✓ ${name}\n`);
}

let failures = 0;
function assertClose(actual, expected, tol, label) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  process.stdout.write(
    `  ${ok ? '✓' : '✗'} ${label}: ${actual} (متوقَّع ${expected} ±${tol})\n`,
  );
  if (!ok) failures += 1;
}

function assertTrue(ok, label) {
  process.stdout.write(`  ${ok ? '✓' : '✗'} ${label}\n`);
  if (!ok) failures += 1;
}

// ── قياسات DOM — مستطيلات فقط، لا سلاسل style ──────────────

/** start% لقطعة: بُعدُ حافتها اليُمنى عن حافة ممرّها اليُمنى ÷ عرضه.
 *  RTL: start يُقاس من اليمين — والنسبةُ إلى المدّة ثابتةٌ عبر الزوم. */
async function startPct(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (el) => {
    const lane = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return ((lane.right - r.right) / lane.width) * 100;
  });
}

/** width% لقطعة — لقياس القصّ (كمّيّات ثابتةٌ عبر الزوم). */
async function widthPctOf(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (el) => {
    const lane = el.parentElement.getBoundingClientRect();
    return (el.getBoundingClientRect().width / lane.width) * 100;
  });
}

/** هندسةٌ بالبكسل: عرضُ قطعةٍ وعرضُ ممرّها — عقدُ الإثبات الهندسيّ. */
async function itemGeomPx(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (el) => {
    const lane = el.parentElement.getBoundingClientRect();
    return {
      w: el.getBoundingClientRect().width,
      laneW: lane.width,
    };
  });
}

/** موضعُ رأس القراءة % داخل المحتوى — من مركزه (مركز 2px مع هامش −1). */
async function playheadPct(page) {
  return page.$eval('[data-testid="reels-playhead"]', (el) => {
    const content = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    return ((content.right - cx) / content.width) * 100;
  });
}

/** موضعُ رأس القراءة بالبكسل داخل المستطلع — يثبت عند التمحور. */
async function playheadViewportX(page) {
  return page.$eval('[data-testid="reels-playhead"]', (ph) => {
    const vp = ph.closest('[data-testid="reels-viewport"]');
    return ph.getBoundingClientRect().left - vp.getBoundingClientRect().left;
  });
}

/** بعدُ التمرير d: كمّ خرجت حافةُ المحتوى اليُمنى (t=0) عن يمين
 *  المستطلع. صفرٌ عند الملاءمة وأوّل التمرير — يزداد بالتقدّم. */
async function scrollDist(page) {
  return page.$eval('[data-testid="reels-viewport"]', (vp) => {
    const c = vp.firstElementChild.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    return c.right - v.right;
  });
}

/** scrollWidth/clientWidth للمستطلع — دليلُ تجاوز المحتوى العرض. */
async function viewportDims(page) {
  return page.$eval('[data-testid="reels-viewport"]', (vp) => ({
    sw: vp.scrollWidth,
    cw: vp.clientWidth,
  }));
}

/** مستطيلُ المستطلع — إحداثيّات أحداث العجلة. */
async function viewportCenter(page) {
  const box = await (
    await page.$('[data-testid="reels-viewport"]')
  ).boundingBox();
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** عدُّ تسميات المسطرة الكبرى وأصغرُ تباعدٍ بين مركزين متجاورين.
 *  الترتيبُ في الـDOM = ترتيبُ الزمن (0, 0.5, …) — وبعد إصلاح إرساء
 *  458 تتقدّم المراكزُ تنازليّاً في x (RTL): نُثبت الرتابةَ ونقيس
 *  الفجوةَ مطلقةً. */
async function rulerLabels(page) {
  return page.$$eval('[data-testid="reels-ruler-label"]', (els) => {
    const vp = els[0].closest('[data-testid="reels-viewport"]');
    const vpRight = vp.getBoundingClientRect().right;
    const cxs = els.map((e) => {
      const r = e.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    let minGap = Infinity;
    for (let i = 1; i < cxs.length; i += 1) {
      minGap = Math.min(minGap, Math.abs(cxs[i] - cxs[i - 1]));
    }
    const rtlOrdered = cxs.every((v, i) => i === 0 || v < cxs[i - 1]);
    return { count: els.length, minGap, rtlOrdered, firstCx: cxs[0], vpRight };
  });
}

/** الترتيب البصريّ لحروف شريحة نصّية: مواضع Range.x لأوّل وآخر حرف.
 *  «⌘Z» المصحَّح: ⌘ يسار Z (x أصغر). عطبُ 454 كان ⌘ يمين Z.
 *  الشريحةُ قد تتداخّل (Ltr يُنشئ spanاً داخليّاً) — ننزل إلى أوّل
 *  عقدةٍ نصّية. */
async function chipVisualOrder(page, btnTestId) {
  return page.$eval(`[data-testid="${btnTestId}"]`, (btn) => {
    const chip = btn.querySelector('span:last-child');
    let node = chip.firstChild;
    while (node && node.nodeType !== Node.TEXT_NODE) {
      node = node.firstChild;
    }
    const txt = node.textContent;
    const xAt = (i) => {
      const rg = document.createRange();
      rg.setStart(node, i);
      rg.setEnd(node, i + 1);
      return rg.getBoundingClientRect().x;
    };
    return { text: txt, firstX: xAt(0), lastX: xAt(txt.length - 1) };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));

  await page.goto(`${BASE}/dev/reels`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', { timeout: 10000 });
  await sleep(800);

  // ── قياسات ما قبل اللقطات — تُفسد الحالة فتُعاد قراءة الصفحة بعدها ──

  // bidi: «⌘Z» و«⌘⇧Z» بالترتيب البصريّ الصحيح (عزل Ltr — 456 §٢.1)
  for (const [btn, text] of [['reels-undo', '⌘Z'], ['reels-redo', '⌘⇧Z']]) {
    const chip = await chipVisualOrder(page, btn);
    assertTrue(
      chip.text === text && chip.firstX < chip.lastX,
      `bidi ${text}: النصُّ «${chip.text}» وأوّلُه يسارُ آخره (x ${chip.firstX.toFixed(1)} < ${chip.lastX.toFixed(1)})`,
    );
  }

  // التحريك (463: الأسهمُ تمضي حيث تشير): اختيار title-02 للقياس —
  // فجوتُها [7, 13] أوسعُ فجوةٍ في العيّنة (للوسائط ثانيةٌ واحدة تكفيها).
  await page.click('[data-testid="reels-item-title-02"]');
  await sleep(300);
  // 7/32 = 21.875٪
  assertClose(await startPct(page, 'reels-item-title-02'), 21.875, 0.2, 'قبل التحريك title-02 start%');

  // ← خطوة صغيرة = علامة صغرى = 1ث تقدّماً في الزمن → 8/32 = 25٪
  await page.keyboard.press('ArrowLeft');
  await sleep(300);
  assertClose(
    await startPct(page, 'reels-item-title-02'),
    25,
    0.75,
    'ArrowLeft (←) = تقدّمٌ في الزمن (463): title-02 start%',
  );

  // ⇧← خطوة أوسع = علامة كبرى = 5ث → 13/32 = 40.625٪ (سقفُ الفجوة،
  // والالتصاقُ يُنزل النهايةَ على بدايةِ title-03)
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await sleep(300);
  assertClose(
    await startPct(page, 'reels-item-title-02'),
    40.625,
    0.75,
    'Shift+← خطوةٌ أوسع: title-02 start%',
  );

  // → خطوة صغيرة عَكساً → 12/32 = 37.5٪
  await page.keyboard.press('ArrowRight');
  await sleep(300);
  assertClose(
    await startPct(page, 'reels-item-title-02'),
    37.5,
    0.75,
    'ArrowRight (→) عَكساً (463): title-02 start%',
  );

  // ] تقصّ النهاية 1ث: العرض 7ث → 6ث = 18.75٪
  await page.keyboard.press(']');
  await sleep(300);
  assertClose(
    await widthPctOf(page, 'reels-item-title-02'),
    18.75,
    0.75,
    '] يقصّ حافة النهاية: title-02 width%',
  );

  // [ تقصّ البداية 1ث: العرض 5ث = 15.625٪
  await page.keyboard.press('[');
  await sleep(300);
  assertClose(
    await widthPctOf(page, 'reels-item-title-02'),
    15.625,
    0.75,
    '[ يقصّ حافة البداية: title-02 width%',
  );

  // إعادة القراءة — اللقطات تبدأ من العيّنة النظيفة
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', { timeout: 10000 });
  await sleep(800);

  // ── 01: ساكناً — clip-01 من الحافة اليُمنى (start = 0) ──
  assertClose(await startPct(page, 'reels-item-clip-01'), 0, 0.2, 'idle clip-01 start%');

  // RTL عند الملاءمة: الصفرُ عند الحافة اليُمنى، والكثافةُ 5ث (7 تسميات)
  // — تسميةُ الصفر تجلس كاملةً داخل الحافة (458: إصلاحُ إرساءٍ كان
  // معكوساً منذ 453؛ هذه المحاكمة هي التي كشفته).
  const fitLabels = await rulerLabels(page);
  assertTrue(
    fitLabels.count === 7,
    `كثافةُ المسطرة عند الملاءمة: ${fitLabels.count} تسميات (خطوة 5ث)`,
  );
  assertClose(
    fitLabels.firstCx - fitLabels.vpRight,
    0,
    6,
    'RTL: تسميةُ الصفر على الحافة اليُمنى',
  );
  await shot(page, 'reels-01-idle.png');

  // ── 02: اختيار clip-02 ──
  await page.click('[data-testid="reels-item-clip-02"]');
  await sleep(300);
  const hasRing = await page.$eval('[data-testid="reels-item-clip-02"]', (el) =>
    el.classList.contains('ring-accent'),
  );
  process.stdout.write(`  ${hasRing ? '✓' : '✗'} clip-02 محدَّد (ring-accent)\n`);
  if (!hasRing) failures += 1;
  await shot(page, 'reels-02-selected.png');

  // تدفّق 03: سحب title-02 بـ+٥ ثوانٍ (يساراً = لاحقاً في الزمن) —
  // يستعمل مرّتين: للقطة 03، ثمّ مجدّداً بعد تبديل الأرقام (05).
  // القطعُ الإعلاميّةُ (clip-01..03) محشورةٌ بلا فجوةٍ منذ 462 فلا
  // تتحرك — والقاطعةُ المتّسعةُ المؤهَّلةُ للسحبِ الآمنِ هي title-02
  // (فجوتُها [7, 13] والإفلاتُ في 12 داخلُها).
  const runDrag = async () => {
    const box = await (
      await page.$('[data-testid="reels-item-title-02"]')
    ).boundingBox();
    const laneWidth = await page.$eval('[data-testid="reels-item-title-02"]', (el) =>
      el.parentElement.getBoundingClientRect().width,
    );
    const px = 5 * (laneWidth / DURATION); // ٥ ثوانٍ بالبكسل
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(cx - (px * i) / 12, cy, { steps: 1 });
      await sleep(25);
    }
    await sleep(200);
    await page.mouse.up();
    await sleep(300);
    // (7+5)/32 = 37.5% — الإفلات ثبَّت moveItemSafe في History.
    assertClose(
      await startPct(page, 'reels-item-title-02'),
      37.5,
      0.75,
      'after-drag title-02 start%',
    );
  };

  // تدفّق 04: شطر القطعة المختارة عند رأس القراءة (١٤ ث) باختصار S.
  // السحب أبقى title-02 مختارة (select عند mousedown) — بعد +٥ ث هي
  // ١٢–١٩ و14 داخلها. بلا نقرٍ إضافيّ: السحبُ الآمنُ لا يُنتج تراكباً
  // (462) فلا جارَ تحتَ القطعة يلتقط النقرة.
  const runSplit = async () => {
    await page.$eval('[data-testid="reels-scrub"]', (el) => {
      // الـsetter الأصليّ من prototype — إسناد el.value مباشرةً يمرّ عبر
      // متتبّع قيم React فيرى الحدث «بلا تغيير» ويهمل onChange.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(el, '14');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    // رأس القراءة عند ١٤/٣٢ = 43.75% — التمرير وصل فعلاً.
    assertClose(await playheadPct(page), 43.75, 0.2, 'playhead عند 14ث');
    await page.keyboard.press('s');
    await sleep(400);
    const splitExists = await page.$(
      '[data-testid="reels-item-title-02__split_1"]',
    );
    process.stdout.write(
      `  ${splitExists ? '✓' : '✗'} title-02__split_1 وُجد بعد الشطر\n`,
    );
    if (!splitExists) failures += 1;
    // النصف الثاني يبدأ عند ١٤/٣٢ = 43.75% — الشطر وقع عند رأس القراءة.
    assertClose(
      await startPct(page, 'reels-item-title-02__split_1'),
      43.75,
      0.75,
      'after-split title-02__split_1 start%',
    );
  };

  // ── 03: بعد السحب ──
  await runDrag();
  await shot(page, 'reels-03-after-drag.png');

  // ── 04: بعد الشطر ──
  await runSplit();
  await shot(page, 'reels-04-after-split.png');

  // ── 05: مبدّل الأرقام على ١٢٣ ──
  // نقرةٌ فعليّة على الخيار تثبّت التفضيل (useDigitStyle يكتب التخزين
  // المحليّ، ويقرؤه كلّ مسارٍ عند التركيب) — ثمّ إعادة تحميل فتُطبّق
  // الأرقامُ العربيّة على المسطرة والقراءة معاً، ويُعاد تدفّق 03+04
  // نفسه فتُلتقط الحالُ ذاتها بالأرقام العربيّة.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === '١٢٣',
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  assertTrue(clicked, 'زرُّ ١٢٣ وُجد ونُقر');
  await sleep(400);
  const activeAfterClick = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === '١٢٣',
    );
    return btn?.classList.contains('bg-surface-2') ?? false;
  });
  assertTrue(activeAfterClick, 'خيار ١٢٣ نشِطٌ بعد النقرة (bg-surface-2)');

  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', { timeout: 10000 });
  await sleep(800);

  const digitsState = await page.evaluate(() => {
    const arabicBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === '١٢٣',
    );
    const active = arabicBtn?.classList.contains('bg-surface-2') ?? false;
    const ruler = document.querySelector('[data-testid="reels-ruler"]');
    const text = ruler?.textContent ?? '';
    return { active, hasArabic: /[٠-٩]/.test(text), hasLatin: /[0-9]/.test(text) };
  });
  assertTrue(digitsState.active, 'خيار ١٢٣ نشِط بعد التحميل (bg-surface-2)');
  assertTrue(digitsState.hasArabic, 'المسطرة تعرض أرقاماً عربية (٠-٩)');
  assertTrue(!digitsState.hasLatin, 'لا أرقام لاتينية في المسطرة');

  // (458 §٢.2) مقاسُ الخطّ الزمنيّ معروضٌ بمفتاحٍ مترجَم — القيمةُ في
  // البيانات تبقى TimelineSize، والواجهةَ تعرض «ريلز» لا «reel».
  const readout = await page.$eval(
    '[data-testid="reels-readout"]',
    (el) => el.textContent,
  );
  assertTrue(
    /ريلز/.test(readout) && !/reel/i.test(readout),
    `المقاسُ معروضٌ مترجَماً («ريلز») لا قيمةً لاتينيّة — القراءة: «${readout.trim()}»`,
  );

  // الحالُ نفسها: سحبٌ وشطرٌ ثمّ اللقطة.
  await runDrag();
  await runSplit();
  await shot(page, 'reels-05-arabic-digits.png');

  // ── 06: الزوم والتمرير (458 §١) — كلُّه بالقياس من الـDOM ──
  const cdp = await page.createCDPSession();

  // (أ) الإثباتُ الهندسيّ عند الملاءمة: clip-03 مدّتُها 14ث
  //     (18→32) — عرضُها = 14 × pxPerSec حيث pxPerSec = عرضُ الممرّ/32
  //     من الـHTML نفسه.
  const fitGeom = await itemGeomPx(page, 'reels-item-clip-03');
  const fitPps = fitGeom.laneW / DURATION;
  assertClose(
    fitGeom.w,
    14 * fitPps,
    1,
    `الملاءمة: عرض clip-03 = 14 × pxPerSec (${(14 * fitPps).toFixed(2)}px)`,
  );
  const fitDims = await viewportDims(page);
  assertTrue(
    fitDims.sw - fitDims.cw <= SCROLL_SLACK_PX,
    `الملاءمة: المحتوى يسع العرض (scrollWidth ${fitDims.sw} ≤ clientWidth ${fitDims.cw} + ${SCROLL_SLACK_PX})`,
  );

  // (ب) ⌘+عجلة (mouseWheel بـmodifiers=Meta): تقريبٌ يتمحور حول رأس
  //     القراءة — موضعُه داخل المستطلع يثبت.
  const vp = await viewportCenter(page);
  let phX = await playheadViewportX(page);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: vp.cx,
    y: vp.cy,
    deltaX: 0,
    deltaY: -120,
    modifiers: MOD_META,
  });
  await sleep(400);
  const zoomedDims = await viewportDims(page);
  assertTrue(
    zoomedDims.sw > fitDims.cw + 50,
    `⌘+عجلة قرَّبت: المحتوى تجاوز العرض (scrollWidth ${zoomedDims.sw} > ${fitDims.cw})`,
  );
  assertClose(
    await playheadViewportX(page),
    phX,
    2,
    'الزوم (⌘+عجلة) تمحور حول رأس القراءة',
  );

  // عجلةٌ عكسيةٌ واحدةٌ تعود إلى الملاءمة بالضبط — العاملُ الأُسّيّ
  // متماثل (exp(0.24) × exp(−0.24) = 1) فيُقصّ عند الحدّ 1.
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: vp.cx,
    y: vp.cy,
    deltaX: 0,
    deltaY: 120,
    modifiers: MOD_META,
  });
  await sleep(400);
  const backDims = await viewportDims(page);
  assertTrue(
    backDims.sw - fitDims.cw <= SCROLL_SLACK_PX,
    `⌘+عجلة عكساً تعود إلى الملاءمة (scrollWidth ${backDims.sw} ≤ ${fitDims.cw} + ${SCROLL_SLACK_PX})`,
  );

  // (ج) زرّا الزوم المعلنان: ثلاثُ نقرات ×2 ⇒ ×8 — والتمحورُ ثابت.
  phX = await playheadViewportX(page);
  for (let i = 0; i < 3; i += 1) {
    await page.click('[data-testid="reels-zoom-in"]');
    await sleep(250);
  }
  await sleep(300);
  assertClose(
    await playheadViewportX(page),
    phX,
    2,
    'الزوم بالأزرار (×8) تمحور حول رأس القراءة',
  );

  // (د) الإثباتُ الهندسيّ عند ×8: القطعةُ نفسها، والنسبةُ بين
  //     العرضَين = 8 — «عند زومٍ ×N يساوي العرضُ D × pxPerSec».
  const z8Geom = await itemGeomPx(page, 'reels-item-clip-03');
  const z8Pps = z8Geom.laneW / DURATION;
  const z8Dims = await viewportDims(page);
  assertTrue(
    z8Dims.sw > z8Dims.cw + 50,
    `×8: المحتوى تجاوز العرض (scrollWidth ${z8Dims.sw} > clientWidth ${z8Dims.cw})`,
  );
  assertClose(
    z8Geom.w,
    14 * z8Pps,
    2,
    `×8: عرض clip-03 = 14 × pxPerSec (${(14 * z8Pps).toFixed(2)}px)`,
  );
  assertClose(
    z8Geom.w / fitGeom.w,
    8,
    0.02,
    'العرض عند ×8 = 8 × العرض عند الملاءمة',
  );

  // (هـ) كثافةُ المسطرة تتبع الزوم: 7 تسميات (5ث) ⇒ 65 (0.5ث)،
  //      وأصغرُ تباعدٍ بين تسميتين لا ينزل تحت 48px.
  const z8Labels = await rulerLabels(page);
  assertTrue(
    z8Labels.count === 65,
    `كثافةُ المسطرة عند ×8: ${z8Labels.count} تسمية (خطوة 0.5ث)`,
  );
  assertTrue(
    z8Labels.rtlOrdered,
    'تسمياتُ المسطرة عند ×8 رتيبةٌ تنازليّاً في x (RTL: الزمن يميناً→يساراً)',
  );
  assertTrue(
    z8Labels.minGap >= 48,
    `لا ازدحام عند ×8: أصغر تباعد ${z8Labels.minGap.toFixed(1)}px ≥ 48px`,
  );

  // (و) الاختصاران المعلنان على الزرّين من لوحة المفاتيح: ⌘= يبلُغ
  //      الحدّ الأقصى، و⌘− يعود خطوة.
  await page.keyboard.down('Meta');
  await page.keyboard.press('=');
  await sleep(300);
  const maxDims = await viewportDims(page);
  assertTrue(
    Math.abs(maxDims.sw - fitDims.cw * 16) <= 8,
    `⌘= بلغ الحدّ الأقصى ×16 (scrollWidth ${maxDims.sw} ≈ ${fitDims.cw}×16)`,
  );
  await page.keyboard.press('-');
  await sleep(300);
  const backTo8 = await viewportDims(page);
  assertTrue(
    Math.abs(backTo8.sw - fitDims.cw * 8) <= 8,
    `⌘− عاد خطوةً إلى ×8 (scrollWidth ${backTo8.sw} ≈ ${fitDims.cw}×8)`,
  );
  await page.keyboard.up('Meta');

  // (ز) العجلةُ وحدها تُمرِّر: 240px تقدّماً في الزمن — والصفرُ يبقى
  //      يمينَ المحتوى: تسميةُ الصفر تخرج يميناً خارج المستطلع.
  const dBefore = await scrollDist(page);
  await page.mouse.move(vp.cx, vp.cy);
  await page.mouse.wheel({ deltaY: 240 });
  await sleep(300);
  const dAfter = await scrollDist(page);
  assertClose(
    dAfter - dBefore,
    240,
    3,
    'عجلةٌ وحدها تُمرِّر: تقدّمُ العرض 240px',
  );
  const scrolledLabels = await rulerLabels(page);
  assertTrue(
    scrolledLabels.firstCx > scrolledLabels.vpRight + 100,
    `RTL محفوظٌ بعد التمرير: تسميةُ الصفر خارجُ الشاشة يميناً (مركزُها ${scrolledLabels.firstCx.toFixed(0)} > حافةُ المستطلع ${scrolledLabels.vpRight.toFixed(0)})`,
  );

  // ── 06: اللقطة — مقرَّبٌ، متجاوزٌ للعرض، والتمريرُ ظاهر ──
  await shot(page, 'reels-06-zoomed.png');

  // ── 07 (463): الزجاجُ الأماميّ — القماشةُ فوق الشريط ──
  // إعادةُ قراءةٍ لحالةٍ نظيفة، ثمّ القياسُ بالبكسل لا بالنظر:
  // إطارٌ غيرُ فارغ (بكسلاتٌ غيرُ شفّافةٍ > 0)، وحالةُ "ready" لا
  // "error"، وبصمةٌ تتغيّر بتحريكِ قطعةٍ — معاينةٌ لا تتبدّلُ بتبدّلِ
  // الخطّ الزمنيّ ليست معاينة.
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-item-clip-01"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="reels-preview"][data-state="ready"]', { timeout: 15000 });
  await sleep(400);

  const canvasStats = () =>
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

  const stats0 = await canvasStats();
  assertTrue(
    stats0.count > 0,
    `المعاينةُ ترسمُ إطاراً غيرَ فارغ: ${stats0.count} بكسلاً غيرَ شفّاف > 0`,
  );
  assertTrue(
    stats0.hash !== 0,
    'بصمةُ الإطار محسوبةٌ (djb2 على البكسلات)',
  );

  const previewState = await page.$eval('[data-testid="reels-preview"]', (el) =>
    el.getAttribute('data-state'),
  );
  assertTrue(
    previewState === 'ready',
    `حالةُ المعاينة "ready" لا "error" — قِيل: "${previewState}"`,
  );

  // رأسُ القراءة داخلَ نافذةِ title-02 (7.5) — البصمةُ قبل النقل:
  await page.$eval('[data-testid="reels-scrub"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(el, '7.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(500);
  const before = await canvasStats();

  // نقلُ title-02 ثانيةً (← تقدّماً في الزمن — 463): [7,14] → [8,15] —
  // تخرجُ من نافذةِ رأس القراءة (7.5) فتتغيّرُ مجموعةُ النشاطِ وتبدّلُ
  // الإطارُ. معاينةٌ لا تتبدّلُ بتبدّل الخطّ الزمنيّ ليست معاينة.
  await page.click('[data-testid="reels-item-title-02"]');
  await sleep(200);
  await page.keyboard.press('ArrowLeft');
  await sleep(700);
  const after = await canvasStats();
  assertTrue(
    after.hash !== before.hash,
    `تحريكُ title-02 غيّر بصمةَ الإطار (${before.hash} → ${after.hash})`,
  );

  await shot(page, 'reels-07-preview.png');

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
