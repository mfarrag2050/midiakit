#!/usr/bin/env node
// cdp-reels-475 — الوسمُ الصادقُ قبلَ الدمج (reels/475 §٢–§٤).
//
// **العلّة:** الصفحةُ مدخلٌ رئيسيٌّ في القائمةِ، ومَن يفتحُها يجدُ سطحاً
// لا يحفظُ ولا يُصدّر. صفحةٌ تكذبُ على فاتحِها تُفقدُنا ثقةً لا تُشترى
// مرّةً ثانية.
//
// **الغطاء:**
//   reels-16-honest-notice.png   الوسمُ ظاهرٌ مع رأسِ الصفحة.
//
// **المحقَّقات:**
//   - الوسمُ **مُصيَّرٌ مرئيّاً**: عنصرٌ حقيقيٌّ في الـDOM، نصُّهُ من
//     القاموس (ar)، غيرُ محجوبٍ (offsetParent ≠ null، مرئيٌّ في
//     viewport الصفحة)، وقربَ العنوانِ (تحتَه مباشرةً).
//   - الحالةُ التي تُرسِب: الوسمُ غيرُ مُصيَّرٍ (اختبارٌ سلبيّ: حجبُ
//     العنصرِ عبرَ style ⇒ الفحصُ يرسب) — يُثبتُ أنّ الفحصَ يفحصُ
//     الرؤيةَ لا الوجود.
//   - الحرّاسُ نظافٌ بالمفتاحِ في القواميسِ الثلاثة (خارجَ هذا السكربت).

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = process.argv[2] ?? 'claude/reports/475-shots';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let failures = 0;
function assertTrue(ok, label) {
  process.stdout.write(`  ${ok ? '✓' : '✗'} ${label}\n`);
  if (!ok) failures += 1;
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

  // (473) توكنٌّ محليٌّ وجوديٌّ لدخول AppShell.
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

  // الوسمُ مُصيَّرٌ: موجودٌ، غيرُ محجوبٍ، نصُّهُ من القاموس العربيّ.
  const notice = await page
    .$eval('[data-testid="reels-preview-notice"]', (el) => ({
      text: el.textContent.trim(),
      visible: el.offsetParent !== null && el.getClientRects().length > 0,
    }))
    .catch(() => null);
  process.stdout.write(`  «نصُّ الوسم»: ${notice ? notice.text : '— غائب —'}\n`);
  assertTrue(
    notice !== null &&
      notice.visible &&
      /معاينة/.test(notice.text) &&
      /لا يُحفَظ/.test(notice.text),
    'الوسمُ مُصيَّرٌ مرئيّاً ونصُّهُ من القاموس (معاينةٌ · لا يُحفَظ)',
  );

  // قربَ العنوانِ: الوسمُ تحتَ الـh1 مباشرةً (المسافةُ الرأسيّةُ صغيرة).
  const near = await page.evaluate(() => {
    const h1 = document.querySelector('main h1');
    const el = document.querySelector('[data-testid="reels-preview-notice"]');
    if (!h1 || !el) return null;
    const a = h1.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { gap: b.top - a.bottom, below: b.top >= a.bottom };
  });
  assertTrue(
    near !== null && near.below && near.gap < 40,
    `الوسمُ قربَ العنوانِ (تحتَه بفُرجةِ ${near ? near.gap.toFixed(0) : '—'}px)`,
  );

  // الحالةُ السلبيّةُ (تُرسب): حجبُ الوسمِ يدويّاً ⇒ الفحصُ يرسب.
  // نُثبتُ أنّ الفحصَ يفحصُ الرؤيةَ لا الوجود.
  await page.$eval('[data-testid="reels-preview-notice"]', (el) => {
    el.style.display = 'none';
  });
  const hidden = await page
    .$eval('[data-testid="reels-preview-notice"]', (el) => el.offsetParent === null)
    .catch(() => true);
  await page.$eval('[data-testid="reels-preview-notice"]', (el) => {
    el.style.display = '';
  });
  assertTrue(
    hidden === true,
    'الشاهدُ السلبيّ: حجبُ الوسمِ ⇒ فحصُ الرؤيةِ يرسب (لا الوجودَ فحسب)',
  );

  // لقطةُ الغطاء: الوسمُ مع رأسِ الصفحة.
  await page.screenshot({ path: join(OUT, 'reels-16-honest-notice.png'), fullPage: false });
  process.stdout.write('  ✓ reels-16-honest-notice.png\n');

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
