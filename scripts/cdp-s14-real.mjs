#!/usr/bin/env node
// cdp-s14-real — لقطة G-S14-3 (workflow-create) على mk-api الحقيقي 19040.
//
// **متطلبات:**
//   - mk-api على 19040 (SYNC-δ · 8b20eaf)
//   - `NEXT_PUBLIC_API_MOCK=false` في apps/studio/.env.local
//   - studio dev على 19050
//   - المستخدم studio-s14@x.com / letmein12345 موجود على tenant «S14 Test Agency»
//
// **الغاية:** إثبات أن UI workflow يعمل ضدّ mk-api حقيقياً — POST /v1/workflows
// يُنشئ سير عمل ويظهر في القائمة، بلا mock بين الطبقتين.
//
// **قراءة مصاحبة:** scripts/README-cdp.md

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
  page.on('console', (m) => {
    if (m.type() === 'error') process.stderr.write(`[console.error] ${m.text()}\n`);
  });

  // login على mk-api الحقيقي
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await typeIn(page, 'input[type="email"]', 'studio-s14@x.com');
  await typeIn(page, 'input[type="password"]', 'letmein12345');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // /workflows
  await page.click('a[href="/workflows"]');
  await sleep(700);
  // إنشاء
  await clickByText(page, 'سير عمل جديد', 'New workflow');
  await sleep(500);
  await typeIn(page, '#wf-name', 'ورشة تحرير (real)');
  await clickInDialogByText(page, 'سير عمل جديد', 'New workflow');
  await sleep(1500);
  await shot(page, 's14-list-populated-real.png'); // G-S14-3 على 19040

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
