#!/usr/bin/env node
// cdp-s13 — لقطات المعاينة الحيّة على mk-api الحقيقي 19040.
//
// **G-S13-4:** معاينة حيّة ببيانات حقيقية من 19040.
// **G-S13-5:** تغيير العنوان ⇒ المعاينة تتغيّر.
// **G-S13-6:** brand.bidi.numerals='arabic' ⇒ المعاينة تعرض ١٢٣،
//              بصرف النظر عن DigitStyle في لوحة الموظف.
// **G-S13-7:** قياس المدّة عبر data-testid="preview-ms".
//
// **الفرضية:** studio على 19050، mk-api على 19040 · SYNC-δ مفتوحة،
// المشروع + الهوية سُبقا يدوياً (curl seed) — انظر PHASES-studio §S13.

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

async function readPreviewMs(page) {
  return await page.$eval('[data-testid="preview-ms"]', (el) => el.textContent);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const PRJ = (await readFile('/tmp/s13-prj-latin.txt', 'utf8')).trim();
  if (!PRJ) throw new Error('missing /tmp/s13-prj-latin.txt — seed first');

  const TOK = (await readFile('/tmp/s13-tok.txt', 'utf8')).trim();
  const TOK_ARAB = (await readFile('/tmp/s13-tok-arab.txt', 'utf8')).trim();
  const PRJ_ARAB = (await readFile('/tmp/s13-prj-arab.txt', 'utf8')).trim();
  if (!TOK) throw new Error('missing /tmp/s13-tok.txt — seed first');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));
  page.on('console', (m) => {
    if ((m.text() ?? '').includes('[preview]')) {
      process.stdout.write(`  · ${m.text()}\n`);
    }
  });

  // Bypass login by injecting session tokens into localStorage before
  // navigating. Rate-limit avoidance: login endpoint has 429 lockout
  // and we've been hitting it during setup.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    window.localStorage.setItem('pfmk.studio.session.access', tok);
    window.localStorage.setItem('pfmk.studio.session.refresh', tok);
  }, TOK);

  // navigate to project editor (SPA via Link)
  await page.click('a[href="/projects"]');
  await sleep(600);
  await page.click(`a[href="/projects/${PRJ}"]`);
  await page.waitForSelector('[data-testid="live-preview"] canvas', { timeout: 10000 });
  await sleep(2000); // font load + first draw

  await shot(page, 's13-preview-loaded.png');
  const ms1 = await readPreviewMs(page);
  process.stdout.write(`  · initial preview: ${ms1}\n`);

  // G-S13-5: تغيير العنوان — نُدخل نصّاً جديداً في حقل headline
  await typeIn(page, '#fld-headline', 'خبر عاجل: تحديث المعاينة الحيّة 2026');
  await sleep(600); // wait debounce + draw
  await shot(page, 's13-preview-after-typing.png');
  const ms2 = await readPreviewMs(page);
  process.stdout.write(`  · after typing: ${ms2}\n`);

  // G-S13-7: قياس الأداء عبر إعادة الرسم المتكرّرة
  const times = [];
  for (let i = 0; i < 5; i++) {
    await typeIn(page, '#fld-headline', `عيّنة أداء ${i} · 2026 مقاسة`);
    await sleep(400);
    const label = await readPreviewMs(page);
    const num = parseFloat((label ?? '').match(/([\d.]+)ms/)?.[1] ?? '0');
    times.push(num);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  process.stdout.write(`  · perf sample (n=5): ${times.map((x) => x.toFixed(1)).join(',')} → avg ${avg.toFixed(1)}ms\n`);

  // G-S13-6: أرقام عربية-هندية. مستأجر ثانٍ بـtoken مختلف، وهوية
  // typography.bidi.numerals='arabic'. المعاينة يجب أن تعرض ١٢٣ لا 123،
  // بصرف النظر عن حالة DigitStyle في اللوحة (تُبدَّل لاحقاً بيدنا).
  await page.evaluate((tok) => {
    window.localStorage.setItem('pfmk.studio.session.access', tok);
    window.localStorage.setItem('pfmk.studio.session.refresh', tok);
    // بدّل DigitStyle إلى «لاتيني» عمداً لإثبات العزل:
    // الأرقام في المعاينة تبقى عربية-هندية رغم أن الموظف اختار latin.
    window.localStorage.setItem('pfmk.studio.digit-style', 'latin');
  }, TOK_ARAB);
  await page.goto(`${BASE}/projects/${PRJ_ARAB}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="live-preview"] canvas', { timeout: 10000 });
  await sleep(2000);
  await shot(page, 's13-preview-arabic-numerals.png');
  const msArab = await readPreviewMs(page);
  process.stdout.write(`  · arabic-numerals preview: ${msArab}\n`);

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
