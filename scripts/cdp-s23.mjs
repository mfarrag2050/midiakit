#!/usr/bin/env node
// cdp-s23 — لقطات مساحة عمل المشروع على mk-api الحقيقي 19040.
//
// **الغطاء:**
//   G-S23-3 workspace شاشة واحدة
//   G-S23-4 أربع لقطات لأربعة مقاسات
//   G-S23-5 تدفّق التشكيل (٦ خطوات) — الخدمة قد تكون غير مبنيّة
//   G-S23-6 لوحة الحركات + «أزل التشكيل»
//   G-S23-7 حفظ التشكيل: reload المشروع ⇒ التشكيل باقٍ
//   G-S23-8 content.locale=latin ⇒ المعاينة LTR
//   G-S23-9 _word_ يعمل من الواجهة

import puppeteer from 'puppeteer-core';
import { mkdir, readFile } from 'node:fs/promises';
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

async function main() {
  await mkdir(OUT, { recursive: true });
  const TOK = (await readFile('/tmp/s23-tok.txt', 'utf8')).trim();
  const PRJ = (await readFile('/tmp/s23-prj.txt', 'utf8')).trim();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));

  // token injection (نتفادى rate-limit على /login)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('pfmk.studio.session.access', t);
    localStorage.setItem('pfmk.studio.session.refresh', t);
  }, TOK);

  // فتح المحرّر
  await page.goto(`${BASE}/projects/${PRJ}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="workspace-toolbar"]', { timeout: 10000 });
  await sleep(2000);

  // G-S23-3: workspace شاشة واحدة
  await shot(page, 's23-workspace-single-screen.png');

  // G-S23-4: أربع لقطات لأربعة مقاسات
  const sizes = ['x', 'instagram', 'reel', 'video'];
  for (const s of sizes) {
    await page.click(`[data-testid="size-${s}"]`);
    await sleep(1000);
    await shot(page, `s23-size-${s}.png`);
  }
  // return to `x` for the remaining captures
  await page.click('[data-testid="size-x"]');
  await sleep(500);

  // G-S23-6: لوحة الحركات + «أزل التشكيل» — قبل الاستدعاء الشبكي
  await shot(page, 's23-tashkeel-kbd.png');

  // G-S23-9: _word_ — نحدّد كلمة ونضغط
  await page.click('#fld-headline');
  await sleep(200);
  await page.$eval('#fld-headline', (el) => {
    // نحدّد أوّل 4 حروف
    el.setSelectionRange(0, 4);
    el.focus();
  });
  await sleep(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').trim() === '_word_');
    if (b) b.click();
  });
  await sleep(400);
  await shot(page, 's23-word-accent.png');

  // G-S23-5: تدفّق التشكيل — نضغط «شكّل»
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').trim() === 'شكّل');
    if (b) b.click();
  });
  await sleep(2500);
  await shot(page, 's23-diacritize-flow.png');

  // G-S23-8: content.locale = latin — المعاينة LTR
  await page.click('[data-testid="content-locale-latin"]');
  await sleep(1500);
  await shot(page, 's23-locale-latin.png');

  // اعد إلى ar لإختبار الحفظ
  await page.click('[data-testid="content-locale-ar"]');
  await sleep(300);

  // G-S23-7: حفظ يبقى — نغيّر الحقل ثم نحفظ ثم reload
  await page.click('#fld-headline');
  await page.$eval('#fld-headline', (el) => el.setSelectionRange(0, 0));
  // نُدرج فتحة يدوياً كتشكيل
  await page.evaluate(() => {
    const el = document.getElementById('fld-headline');
    const before = el.value;
    el.value = 'عَنوان مُشكَّل يدوياً — S23';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').trim() === 'حفظ' || (x.textContent ?? '').trim() === 'Save');
    if (b) b.click();
  });
  await sleep(1500);
  await shot(page, 's23-saved.png');
  // reload
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('#fld-headline', { timeout: 10000 });
  await sleep(2000);
  await shot(page, 's23-reopen-preserved.png');
  // dump the field value to confirm tashkeel preserved
  const val = await page.$eval('#fld-headline', (el) => el.value);
  process.stdout.write(`  · reopened headline value: "${val}"\n`);

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
