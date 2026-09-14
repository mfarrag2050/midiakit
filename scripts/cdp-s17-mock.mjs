#!/usr/bin/env node
// cdp-s17-mock — لقطات على mock stack:
//   G-S17-4 renders cancel ⇒ حالة تتغيّر (202 لا 204)
//   G-S17-5 revisions list مع «النظام» عند actorId=null
//   G-S17-6 restore ⇒ المورد يعود
//   G-S17-8 AI: apiKeyRef لا apiKey
//   G-S17-10 502 معروضاً «المزوّد لم يستجب»
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

  // login (mock)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await typeIn(page, 'input[type="email"]', 'demo@x.com');
  await typeIn(page, 'input[type="password"]', 'letmein12345');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // ═══════════ G-S17-4 cancel: أنشئ مشروع + render ثم ألغِه ═══════════
  await page.click('a[href="/projects"]');
  await sleep(500);
  await clickByText(page, 'مشروع جديد', 'New project');
  await sleep(500);
  await typeIn(page, '#prj-title', 'S17 · مشروع لاختبار إلغاء التصدير');
  await sleep(200);
  await clickInDialogByText(page, 'مشروع جديد', 'New project');
  await sleep(900);
  // فتح المشروع + تصدير
  await page.click('a[href^="/projects/prj_"]');
  await sleep(700);
  await clickByText(page, 'تصدير الآن', 'Render now');
  await sleep(500);

  // انتقل إلى صفحة التصديرات
  await page.click('a[href="/renders"]');
  await sleep(1200);
  // اضغط إلغاء على أوّل صفّ غير-نهائي (queued/running)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('table button')];
    for (const b of btns) {
      const s = (b.textContent ?? '').trim();
      if (s === 'إلغاء' || s === 'Cancel') { b.click(); return; }
    }
  });
  await sleep(1000);
  await shot(page, 's17-cancel-202.png');

  // ═══════════ G-S17-5+6 revisions مع «النظام» (mock يبعث actorId=null في cascade) ═══════════
  // نعود إلى مشروع فيه revisions (المشروع الذي أنشأناه — sha له insert)
  await page.click('a[href="/projects"]');
  await sleep(500);
  await page.click('a[href^="/projects/prj_"]');
  await sleep(600);
  await clickByText(page, 'سجل المراجعات', 'Revisions');
  await sleep(1000);
  await shot(page, 's17-revisions-list.png');
  // فتح استعادة
  await clickInDialogByText(page, 'استعادة', 'Restore');
  await sleep(500);
  await typeIn(page, '#restore-reason', 'سبب طويل يوثِّق الاستعادة (١٠+ أحرف).');
  await sleep(200);
  await shot(page, 's17-restore-dialog.png');
  // أغلق
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(300);

  // ═══════════ G-S17-8 AI integrations — apiKeyRef ═══════════
  await page.click('a[href="/ai-settings"]');
  await sleep(500);
  await shot(page, 's17-ai-empty.png');
  await clickByText(page, 'إضافة تكامل', 'Add integration');
  await sleep(400);
  await selectValue(page, '#ai-provider', 'openai');
  // اكتب مفتاح في حقل password
  const keyInput = await page.$('#ai-key');
  if (keyInput) await keyInput.type('sk-mock-test-1234567890abcdef', { delay: 4 });
  await sleep(200);
  await shot(page, 's17-ai-add-dialog.png');
  await clickInDialogByText(page, 'إضافة', 'Add');
  await sleep(1000);
  await shot(page, 's17-ai-list-keyref.png');

  // ═══════════ G-S17-10 provider 502 ═══════════
  await clickByText(page, 'استدعاء قدرة', 'Invoke capability');
  await sleep(400);
  await typeIn(page, '#inv-input', 'trigger-provider-error');
  await sleep(200);
  await clickInDialogByText(page, 'استدعاء', 'Invoke');
  await sleep(1200);
  await shot(page, 's17-ai-provider-502.png');

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
