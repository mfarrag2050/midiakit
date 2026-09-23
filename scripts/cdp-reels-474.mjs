#!/usr/bin/env node
// cdp-reels-474 — موضعٌ لا يتصادم (reels/474 §٣–§٤).
//
// **العلّة (§١):** addItem تُلحقُ المؤثّرَ ولا تُلحقُ الموضع، وكلُّ نصٍّ
// بلا anchor يهبطُ إلى المنتصف — فالتراكبُ هو الحالةُ الافتراضيّة.
// **المعالجة (§٣):** زرُّ «أضِفْ قطعةً» يبحثُ أوّلَ موضعٍ لا يُصدرُ
// تحذيراً جديداً (top ← bottom ← center ← 0.3 ← 0.7) عبرَ خطّةٍ
// بالـctx نفسِه — الفحصُ في طبقةِ الواجهةِ لا في addItem.
//
// **الغطاء:**
//   reels-15-no-collision.png   نصّان مضافان في اللحظةِ نفسِها،
//                                مقروءان منفصلين، ولا شريطَ تصادم.
//
// **المحقَّقات (من الـDOM/القماشة):**
//   - خطّةُ أساسٍ سليمةٌ قبلَ الإضافة (لا تصادمَ قائماً).
//   - قطعتان متداخلتان زمنيّاً في مسارَين نصَّين عبرَ زرِّ الإضافة
//     ← collisions فارغةٌ ولا شريطَ تنبيه — الإضافةُ بحثَت فلم تُصادم.
//   - الصندوقانِ منفصلانِ رأسيّاً (yGap > 0) — «مقروءان منفصلين»
//     بالهندسةِ لا بالانطباع.
//   - الحالةُ الحمراءُ الشاهدةُ (addItem الخام) محكومةٌ في vitest
//     (timeline-add-place.test.ts) — هذا الغطاءُ للحيّ.
//
// **الخرج:** claude/reports/474-shots/ · والخادمُ قائمٌ على 127.0.0.1:19050.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/474-shots';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

const hasTestId = async (page, testId) =>
  (await page.$(`[data-testid="${testId}"]`)) !== null;

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

  // (473) الصفحة خلف AppShell — توكنٌّ محليٌّ وجوديٌّ يكفي.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pfmk.studio.session.access', 'cdp-local-token');
    localStorage.setItem('pfmk.studio.session.refresh', 'cdp-local-token');
  });
  await page.goto(`${BASE}/reels`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="reels-preview"][data-state="ready"]', {
    timeout: 15000,
  });
  await sleep(600);

  // خطّةُ الأساس: لا تصادمَ قائماً قبلَ أيِّ إضافة.
  const base = await readLayout(page);
  assertTrue(
    (base.collisions ?? []).length === 0,
    'خطّةُ الأساس سليمة: لا تصادمَ قائماً',
  );

  // ── قطعتان متداخلتان زمنيّاً عبرَ مسارَين نصَّين، في اللحظةِ نفسِها ──
  await page.click('[data-testid="reels-add-track"]');
  await sleep(150);
  await page.click('[data-testid="reels-add-track-text"]');
  await sleep(400);
  await page.click('[data-testid="reels-add-item"]');
  await sleep(600);
  assertTrue(
    await hasTestId(page, 'reels-item-title-04'),
    'قطعةٌ أولى في مسارِ نصٍّ جديد (title-04)',
  );

  await page.click('[data-testid="reels-add-track"]');
  await sleep(150);
  await page.click('[data-testid="reels-add-track-text"]');
  await sleep(400);
  await page.click('[data-testid="reels-add-item"]');
  await sleep(600);
  assertTrue(
    await hasTestId(page, 'reels-item-title-05'),
    'قطعةٌ ثانيةٌ في مسارِ نصٍّ ثانٍ (title-05) — متداخلةٌ زمنيّاً مع الأولى',
  );

  // البوّابة الحيّة: لا تصادمَ بعدَ الإضافات — ولا شريطَ تنبيه.
  const after = await readLayout(page);
  assertTrue(
    (after.collisions ?? []).length === 0,
    `الخضراءُ الحيّة: تصادماتُ الخطّة ${(after.collisions ?? []).length} (متوقَّع 0)`,
  );
  assertTrue(
    !(await hasTestId(page, 'reels-collision-bar')),
    'ولا شريطَ تنبيهٍ على القماشة',
  );

  // «مقروءان منفصلين» بالهندسة: (474b) الفُرجةُ الدنيا بينَ كلِّ زوجَين
  // حيٍّ متداخلٍ زمنيّاً ≥ نصفِ ارتفاعِ سطرِ الصندوقِ الأكبر — التلاصقُ
  // ليس سلامة (فُرجةُ 36px بجوارِ سطرِ 76px قُرِئتْ كتلةً واحدة).
  const MIN_GAP_LINE_RATIO = 0.5;
  const live = (after.boxes ?? []).filter(
    (b) => b.start <= 4.5 && b.end > 4.5,
  );
  let worstGap = Infinity;
  let worstThreshold = Infinity;
  let worstPair = '';
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const p = live[i];
      const q = live[j];
      if (Math.min(p.end, q.end) - Math.max(p.start, q.start) <= 0) continue;
      const gap = Math.max(p.top, q.top) - Math.min(p.bottom, q.bottom);
      const lineH = Math.max(
        (p.bottom - p.top) / Math.max(1, p.lines),
        (q.bottom - q.top) / Math.max(1, q.lines),
      );
      const th = MIN_GAP_LINE_RATIO * lineH;
      if (gap < worstGap) {
        worstGap = gap;
        worstThreshold = th;
        worstPair = `${p.itemId} × ${q.itemId}`;
      }
    }
  }
  process.stdout.write(
    `  «الفُرجةُ الدنيا»: ${worstPair} — gap ${worstGap.toFixed(0)}px ≥ عتبة ${worstThreshold.toFixed(0)}px؟\n`,
  );
  process.stdout.write(
    `  «الأحياءُ في 4.5s»: ${live.map((b) => `${b.itemId}[${b.top.toFixed(0)},${b.bottom.toFixed(0)}]`).join(' · ')}\n`,
  );
  assertTrue(
    worstGap >= worstThreshold,
    `كلُّ زوجَين حيَّين متداخلَين مفروقانِ بفُرجةٍ ≥ نصفِ سطر (${worstGap.toFixed(0)} ≥ ${worstThreshold.toFixed(0)})`,
  );

  // لقطةُ الغطاء: النصّانِ في القماشةِ منفصلَين، ولا شريطَ تصادم.
  await page.screenshot({ path: join(OUT, 'reels-15-no-collision.png') });
  process.stdout.write('  ✓ reels-15-no-collision.png\n');

  await browser.close();
  if (failures > 0) {
    process.stderr.write(`FAILED: ${failures} محقَّق رسب\n`);
    process.exit(1);
  }
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`${e}\n`);
  process.exit(1);
});
