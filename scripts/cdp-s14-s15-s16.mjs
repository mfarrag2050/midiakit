#!/usr/bin/env node
// cdp-s14-s15-s16 — لقطات S14 (workflow editor) · S15 (review/approval)
// · S16 (annotations).
//
// **بيئة:** mock stack — الطبقة تحاكي شكل mk-api SYNC-δ حرفياً.
// لقطة G-S14-3 على mk-api الحقيقي 19040 تُلتقط بسكربت مرافق مبسّط
// (cdp-s14-real.mjs).
//
// **قراءة مصاحبة:** scripts/README-cdp.md — القاعدة العامة: click لا goto
// بين مسارات SPA.

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
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
      if (needles.some((n) => s === n || s.includes(n))) {
        b.click();
        return true;
      }
    }
    return false;
  }, texts);
}
async function clickInDialogByText(page, ...texts) {
  await page.evaluate((needles) => {
    const btns = [...document.querySelectorAll('dialog button')];
    for (const b of btns) {
      const s = (b.textContent ?? '').trim();
      if (needles.some((n) => s === n || s.includes(n))) {
        b.click();
        return true;
      }
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

  // login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await typeIn(page, 'input[type="email"]', 'demo@x.com');
  await typeIn(page, 'input[type="password"]', 'letmein12345');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // ═══════════ S14 — /workflows ═══════════
  await page.click('a[href="/workflows"]');
  await sleep(700);
  await shot(page, 's14-list-empty.png');

  // فتح حوار الإنشاء
  await clickByText(page, 'سير عمل جديد', 'New workflow');
  await sleep(500);
  await typeIn(page, '#wf-name', 'ورشة تحرير');
  // preset افتراضي = individual — نتركه
  await shot(page, 's14-create-preset-dialog.png');
  await clickInDialogByText(page, 'سير عمل جديد', 'New workflow');
  await sleep(900);
  await shot(page, 's14-list-populated.png'); // G-S14-3 (mock)

  // فتح المحرّر عبر Link SPA
  await page.click('a[href^="/workflows/wfl_"]');
  await sleep(700);
  await shot(page, 's14-editor-loaded.png');

  // تدفير الخطأ الميداني: نغيّر transitions[1].to إلى قيمة غير موجودة
  // ثم نحفظ. الخادم يعيد WORKFLOW_SCHEMA_VIOLATION مع field=transitions[1].to
  // — الواجهة تُعلِّم الحقل، لا بانراً.
  await typeIn(page, '#tto-1', 'nonexistent-state');
  await sleep(200);
  await clickByText(page, 'حفظ', 'Save');
  await sleep(700);
  // نُمرِّر إلى منطقة الانتقالات كي تكون رسالة الحقل مرئية.
  await page.evaluate(() => {
    const el = document.getElementById('tto-1');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  await shot(page, 's14-schema-violation-inline.png'); // G-S14-4

  // ═══════════ S12 قبل S15/S16 — نُنشئ مشروعاً على workflow الجديد ═══════════
  await page.click('a[href="/projects"]');
  await sleep(600);
  await clickByText(page, 'مشروع جديد', 'New project');
  await sleep(500);
  await typeIn(page, '#prj-title', 'مشروع سير العمل — إثبات S14');
  // brand kit = default (already selected), template = بسيط (default), workflow = default
  // نضيف [role:writer] للعنوان لاختبار 403 لاحقاً على transition تحتاج reviewer
  await sleep(200);
  await clickInDialogByText(page, 'مشروع جديد', 'New project');
  await sleep(1000);

  // فتح المحرّر
  await page.click('a[href^="/projects/prj_"]');
  await sleep(700);
  await shot(page, 's15-editor-transitions-available.png'); // G-S14-5

  // ═══════════ S15 — 400 يفتح حقل السبب inline ═══════════
  // نبحث عن transition «إرجاع للتحرير» (requiresReason:true). لكن من draft
  // لا يوجد transition يستلزم سبباً، فلننفّذ submit أولاً ثم return.

  // أوّلاً submit (draft → review) — دون سبب، ينجح
  await clickByText(page, '→');
  await sleep(900);

  // الآن نحن في review. زرّ «إرجاع للتحرير» موجود ويطلب سبباً.
  // نضغطه بلا سبب → 400 REASON_REQUIRED_FOR_THIS_TRANSITION → يفتح الحقل inline
  await page.evaluate(() => {
    // أوّل زرّ → موجود في قسم سير العمل
    const btns = [...document.querySelectorAll('button')];
    const arrows = btns.filter((b) => (b.textContent ?? '').trim() === '→');
    if (arrows.length > 0) arrows[0].click();
  });
  await sleep(900);
  await shot(page, 's15-400-reason-inline.png'); // G-S14-7

  // الآن ندخل سبباً ونحاول مجدداً
  const reasonAreas = await page.$$('textarea');
  if (reasonAreas.length > 0) {
    await reasonAreas[0].click();
    await reasonAreas[0].type('العنوان يحتاج تدقيقاً — راجعه ثم أعده.', { delay: 3 });
  }
  await sleep(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const arrows = btns.filter((b) => (b.textContent ?? '').trim() === '→');
    if (arrows.length > 0) arrows[0].click();
  });
  await sleep(1000);
  // scroll إلى قسم التاريخ (أسفل الصفحة) قبل الالتقاط
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(300);
  await shot(page, 's15-history-with-actor.png'); // G-S14-8
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);

  // ═══════════ 403 — نغيّر عنوان المشروع لـ[role:writer] عبر PATCH ═══════════
  // ثم نحاول trn_approve (يتطلّب reviewer). Mock يرفض بـ403.
  // نستدعي PATCH من الواجهة بتحرير العنوان.
  // (نمسك الحقل title ونضيف اللاحقة)
  // الأسهل: انتقال إلى قائمة المشاريع، إنشاء مشروع جديد بعنوان يحمل التاق
  await page.click('a[href="/projects"]');
  await sleep(600);
  await clickByText(page, 'مشروع جديد', 'New project');
  await sleep(500);
  await typeIn(page, '#prj-title', 'مشروع دور محدود [role:writer]');
  await sleep(200);
  await clickInDialogByText(page, 'مشروع جديد', 'New project');
  await sleep(1000);
  // فتح المحرّر
  await page.click('a[href^="/projects/prj_"]');
  await sleep(700);

  // submit (writer يقدر) — لا 403
  await clickByText(page, '→');
  await sleep(900);

  // approve (يتطلّب reviewer، actor=writer) — 403 مع field=reviewer
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    // نبحث عن الزرّ الثاني (بعد return الذي يستلزم سبباً — نتخطّاه)
    const arrows = btns.filter((b) => (b.textContent ?? '').trim() === '→');
    if (arrows[1]) arrows[1].click();
  });
  await sleep(1000);
  await shot(page, 's15-403-role-required.png'); // G-S14-6

  // ═══════════ S16 — annotations على طبقة من القالب ═══════════
  await page.click('a[href="/projects"]');
  await sleep(600);
  // ندخل أوّل مشروع (الجديد أعلى القائمة)
  await page.click('a[href^="/projects/prj_"]');
  await sleep(700);
  // scroll إلى panel التعليقات
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(200);
  // كتابة تعليق
  await typeIn(page, '#ann-body', 'كلمة «تدقيقاً» تحتاج تنسيقاً — استعمل bold.');
  await sleep(200);
  await clickByText(page, 'إضافة تعليق', 'Add annotation');
  await sleep(1000);
  await shot(page, 's16-annotation-on-layer.png'); // G-S14-9

  await browser.close();
  process.stdout.write('done\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
