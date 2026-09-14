#!/usr/bin/env node
// cdp-s13-mock — لقطة G-S13-6 (أرقام عربية-هندية) على mock.
//
// **السبب:** mk-api على 8b20eaf يخزّن config.typography.bidi.numerals='latin'
// دائماً حتى لو أُرسل 'arabic' في POST /v1/brand-kits (انحراف مُعلَن —
// راجع PHASES-studio §S13). لا نُصلحه من طرف studio.
//
// **الفرضية:** studio على 19050 بـNEXT_PUBLIC_API_MOCK=true.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = 'demo/studio';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  process.stdout.write(`  ✓ ${name}\n`);
}
async function typeIn(page, sel, text) {
  const el = await page.waitForSelector(sel, { timeout: 8000 });
  await el.click({ clickCount: 3 });
  await el.type(text, { delay: 6 });
}
async function selectValue(page, selector, value) {
  await page.$eval(selector, (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function clickByText(page, ...texts) {
  await page.evaluate((needles) => {
    const btns = [...document.querySelectorAll('body > * button, body > * a')];
    for (const b of btns) {
      if (b.closest('dialog')) continue;
      const s = (b.textContent ?? '').trim();
      if (needles.some((n) => s === n || s.includes(n))) { b.click(); return true; }
    }
    return false;
  }, texts);
}
async function clickInDialogByText(page, ...texts) {
  await page.evaluate((needles) => {
    const btns = [...document.querySelectorAll('dialog button')];
    for (const b of btns) {
      const s = (b.textContent ?? '').trim();
      if (needles.some((n) => s === n || s.includes(n))) { b.click(); return true; }
    }
    return false;
  }, texts);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));

  // login (mock password=letmein12345)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await typeIn(page, 'input[type="email"]', 'demo@x.com');
  await typeIn(page, 'input[type="password"]', 'letmein12345');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // بدّل DigitStyle إلى «لاتيني» قبل الدخول للمشروع — لإثبات أن
  // اختيار الموظف لا يمسّ المعاينة.
  await page.evaluate(() => {
    window.localStorage.setItem('pfmk.studio.digit-style', 'latin');
  });

  // إنشاء مشروع بهوية bk_mock_arabic + قالب بسيط
  await page.click('a[href="/projects"]');
  await sleep(500);
  await clickByText(page, 'مشروع جديد', 'New project');
  await sleep(500);
  await typeIn(page, '#prj-title', 'S13 · إثبات أرقام عربية-هندية');
  await selectValue(page, '#prj-brand', 'bk_mock_arabic');
  await selectValue(page, '#prj-tpl', 'tpl_mock_g0'); // بسيط
  await sleep(200);
  await clickInDialogByText(page, 'مشروع جديد', 'New project');
  await sleep(1200);

  // فتح المحرّر
  await page.click('a[href^="/projects/prj_"]');
  await page.waitForSelector('[data-testid="live-preview"] canvas', { timeout: 10000 });
  await sleep(500);

  // كتابة نصّ يحوي 2026 — يجب أن يُرسم كـ٢٠٢٦
  await typeIn(page, '#fld-headline', 'خبر عاجل بتاريخ 2026 لإثبات العزل');
  await sleep(1000);
  await shot(page, 's13-preview-arabic-numerals-mock.png');

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
