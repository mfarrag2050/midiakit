#!/usr/bin/env node
// cdp-s17-real — لقطات على mk-api الحقيقي 19040:
//   G-S17-3 renders-queue
//   G-S17-7 billing + usage
//
// **الفرضية:** mk-api + studio يعملان، seed أُنجز عبر curl إلى
// /tmp/s17-tok.txt.

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

async function main() {
  await mkdir(OUT, { recursive: true });
  const TOK = (await readFile('/tmp/s17-tok.txt', 'utf8')).trim();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    window.localStorage.setItem('pfmk.studio.session.access', tok);
    window.localStorage.setItem('pfmk.studio.session.refresh', tok);
  }, TOK);

  // G-S17-3 — renders queue against real 19040
  await page.goto(`${BASE}/renders`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await shot(page, 's17-renders-queue-real.png');

  // G-S17-7 — billing + usage
  await page.goto(`${BASE}/billing`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  await shot(page, 's17-billing-real.png');

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
