#!/usr/bin/env node
// cdp-s12 — لقطات S12 (المشاريع/المحرّر/المراجعات/التصدير/الاستعادة).
//
// **قيد التشغيل:** الواجهة على http://127.0.0.1:19050 مع
// `NEXT_PUBLIC_API_MOCK=true` (Projects/Workflows/Renders/Revisions
// خلف SYNC-δ في mk-api).
//
// **البوابات المُغطّاة (docs/17 §S12):** G-S12-3 قائمة · G-S12-4 إنشاء
// · G-S12-5 محرّر content مُشتقّ من template.fields · G-S12-6 If-Match
// (يُختبر ضمنياً بحفظ ناجح) · G-S12-7 sequence حالات · G-S12-8
// revisions/restore · G-S12-9 external-assets block · G-S12-10 render
// pending · G-S12-11 «النظام» لـactorId=null.
//
// **لا نلتقط G-S12-1/2/12** — الأولى typecheck (لا لقطة)، الثانية
// error-code-coverage (لا لقطة)، الثالثة (المعاينة الحيّة) خارج نطاق
// هذه التذكرة.

import puppeteer from 'puppeteer-core';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:19050';
const OUT = 'demo/studio';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  process.stdout.write(`  ✓ ${name}\n`);
}

async function waitFor(page, selector, opts = {}) {
  return page.waitForSelector(selector, { timeout: 8000, ...opts });
}

async function typeIn(page, selector, text) {
  const el = await waitFor(page, selector);
  await el.click({ clickCount: 3 });
  await el.type(text, { delay: 8 });
}

async function selectValue(page, selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[pageerror] ${e.message}\n`));

  // --- خطوة 1: تسجيل الدخول (mock: password=letmein12345) ---
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await typeIn(page, 'input[type="email"]', 'demo@x.com');
  await typeIn(page, 'input[type="password"]', 'letmein12345');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // --- خطوة 2: /projects فارغ (قائمة أوّلية) ---
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle2' });
  await sleep(500);
  await shot(page, 's12-list-empty.png');

  // --- خطوة 3: فتح حوار إنشاء ---
  await page.click('button.bg-accent, button.bg-primary, button[class*="bg-accent"]');
  await sleep(400);
  // fallback: نضغط على زر «مشروع جديد» بالنص
  const clickedCreate = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').includes('مشروع جديد') || (x.textContent ?? '').includes('New project'));
    if (b) { b.click(); return true; }
    return false;
  });
  await sleep(600);
  await shot(page, 's12-create-dialog.png');

  // --- خطوة 4: إنشاء مشروع «بطاقة عاجل» بهوية العرض ---
  await typeIn(page, '#prj-title', 'إثبات محرّر S12');
  // brand kit + template selects: نبقي الافتراضي (bk_mock_default + tpl_mock_g0)
  await selectValue(page, '#prj-tpl', 'tpl_mock_g4'); // بطاقة عاجل
  // ضغط زر «مشروع جديد» في الحوار (الأزرق)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('dialog button')];
    const b = btns.find((x) => (x.textContent ?? '').includes('مشروع جديد') || (x.textContent ?? '').includes('New project'));
    if (b) b.click();
  });
  await sleep(1200);
  await shot(page, 's12-list-populated.png');

  // --- خطوة 5: فتح محرّر (نقرة SPA على عنوان المشروع الأول) ---
  //
  // **ملاحظة:** page.goto() تُهيّئ JS chunks من الصفر — الـmock يعيش
  // في متغيّرات وحدة (in-memory) فتُصفَّر معه. لذا ننقل عبر Next Link
  // (SPA) لنبقي MOCK_PROJECTS قائمة.
  await page.click('a[href^="/projects/prj_"]');
  await page.waitForSelector('#fld-title, [data-testid="editor"]', { timeout: 8000 }).catch(() => {});
  await sleep(600);
  await shot(page, 's12-editor-loaded.png');

  // --- خطوة 6: تعبئة الحقل + الحفظ ---
  const titleInput = await page.$('#fld-title');
  if (titleInput) {
    await titleInput.click({ clickCount: 3 });
    await titleInput.type('خبر عاجل: إثبات محرّر S12 يشتغل', { delay: 6 });
  }
  await sleep(300);
  await shot(page, 's12-editor-dirty.png');

  // ضغط زر «حفظ»
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').trim() === 'حفظ' || (x.textContent ?? '').trim() === 'Save');
    if (b) b.click();
  });
  await sleep(1000);
  await shot(page, 's12-editor-saved.png');

  // --- خطوة 7: التصدير في حالة draft (مسموح) — قبل أيّ تحوّل ---
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) =>
      (x.textContent ?? '').includes('تصدير الآن') ||
      (x.textContent ?? '').includes('Render now')
    );
    if (b) b.click();
  });
  await sleep(700);
  await shot(page, 's12-render-queued.png');
  // انتظار polling حتى الحالة النهائية — mock ينتقل ~2.5s بعد أوّل poll.
  await sleep(8000);
  await shot(page, 's12-render-ready.png');

  // --- خطوة 8: التحوّل «إرسال للمراجعة» ---
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').trim() === '→');
    if (b) b.click();
  });
  await sleep(1000);
  await shot(page, 's12-editor-after-transition.png');

  // --- خطوة 9: التحوّل «إرجاع» يطلب سبباً — نُدخِل السبب ---
  const reasonAreas = await page.$$('textarea');
  if (reasonAreas.length > 0) {
    await reasonAreas[0].click();
    await reasonAreas[0].type('يحتاج مراجعة إملائية على العنوان', { delay: 4 });
  }
  await sleep(300);
  await shot(page, 's12-transition-reason.png');

  // --- خطوة 10: فتح سجل المراجعات ---
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) =>
      (x.textContent ?? '').trim() === 'سجل المراجعات' ||
      (x.textContent ?? '').trim() === 'Revisions'
    );
    if (b) b.click();
  });
  await sleep(1200);
  await shot(page, 's12-revisions-list.png');

  // --- خطوة 11: فتح حوار الاستعادة (على أوّل «استعادة») ---
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('dialog button')];
    const b = btns.find((x) =>
      (x.textContent ?? '').trim() === 'استعادة' ||
      (x.textContent ?? '').trim() === 'Restore'
    );
    if (b) b.click();
  });
  await sleep(600);
  await shot(page, 's12-restore-dialog.png');

  // --- خطوة 12: مشروع بهوية خارجية → 422 blocked ---
  // نُنشئ مشروعاً جديداً بـbrand_kit=bk_mock_external. نعود إلى القائمة
  // عبر Link (SPA) لنبقي حالة الـmock سليمة.
  // نُغلق الحوارَين المفتوحَين أوّلاً (restore + revisions) قبل التنقّل.
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.click('a[href="/projects"]');
  await sleep(600);
  // زر «مشروع جديد» في PageHeader فقط (خارج أيّ حوار مغلق).
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('body > * button')];
    const b = btns.find(
      (x) =>
        !x.closest('dialog') &&
        ((x.textContent ?? '').includes('مشروع جديد') ||
          (x.textContent ?? '').includes('New project'))
    );
    if (b) b.click();
  });
  await sleep(600);
  await typeIn(page, '#prj-title', 'مشروع بأصول خارجية (لاختبار الحاجز)');
  await selectValue(page, '#prj-brand', 'bk_mock_external');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('dialog button')];
    const b = btns.find((x) => (x.textContent ?? '').includes('مشروع جديد') || (x.textContent ?? '').includes('New project'));
    if (b) b.click();
  });
  await sleep(1200);
  // ندخل محرّر المشروع الأحدث (أعلى القائمة) عبر أوّل Link.
  await page.click('a[href^="/projects/prj_"]');
  await page.waitForSelector('#fld-title, [data-testid="editor"]', { timeout: 8000 }).catch(() => {});
  await sleep(500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) =>
      (x.textContent ?? '').includes('تصدير الآن') ||
      (x.textContent ?? '').includes('Render now')
    );
    if (b) b.click();
  });
  await sleep(900);
  await shot(page, 's12-external-blocked.png');

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
