#!/usr/bin/env node
// walk-390 · v2 · مشيٌ بصريّ + قياسُ شبكةٍ وconsole على ٥ شاشات
// قبلَ الباب. عائقُ الاعتماد موثَّق في `_AMEND-370-YOU-ARE-BLOCKED-…`،
// فالشاشاتُ خلفَ الباب مؤجَّلةٌ لا ملغاة.
//
// الأداة: puppeteer-core + Chrome for Testing المثبَّت أصلاً.
// Playwright غيرُ مثبَّت — الأداةُ الحاضرةُ تفي بروح الطلب.
//
// **لا يعبث بشيء:** لا `.env` · لا إعادةَ تشغيل · لا إنشاءَ حساب.
// حتّى `03-login-error` يطرقُ الـAPI بكلمةِ سرٍّ **مخترَعة** لقياسِ
// شكلِ الرسالةِ الفعليّةِ فقط.

import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const STUDIO = process.env.STUDIO ?? 'http://127.0.0.1:19071';
const OUT = process.env.OUT ?? '/Users/mdervis/MediaKit/Claude outputs/walk-2026-09-15';

const VIEWS = {
  '390': { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
};

// اعتمادُ اختبارٍ مخترَع — لا يوافقُ حساباً حقيقيّاً (نُرجّح 401).
const FAKE_EMAIL = 'notauser+probe@example.invalid';
const FAKE_PASSWORD = 'wrong-fake-password-abc12345';

/** يجمعُ كلَّ الطلبات وأخطاء الـconsole المرتبطة بشاشةٍ واحدة. */
function makeCollector() {
  return { requests: [], console: [] };
}

async function attachCollector(page, coll) {
  page.on('response', async (res) => {
    try {
      const req = res.request();
      const url = new URL(res.url());
      coll.requests.push({
        method: req.method(),
        host: url.host,
        path: url.pathname + (url.search ? '?…' : ''), // نقطعُ ما بعدَ ? (قد يحوي مفاتيح موقَّعة)
        status: res.status(),
        type: req.resourceType(),
      });
    } catch (e) {
      /* ignore parse errs */
    }
  });
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') {
      // نطمِس أطولَ من ٢٠٠ حرفٍ من نصّ الـconsole منعاً لتسرّبِ رابطٍ موقَّع
      coll.console.push({ type: t, text: m.text().slice(0, 200) });
    }
  });
  page.on('pageerror', (e) => {
    coll.console.push({ type: 'pageerror', text: e.message.slice(0, 200) });
  });
  page.on('requestfailed', (req) => {
    try {
      const url = new URL(req.url());
      coll.requests.push({
        method: req.method(),
        host: url.host,
        path: url.pathname + (url.search ? '?…' : ''),
        status: 'FAILED',
        type: req.resourceType(),
        failure: (req.failure()?.errorText || '').slice(0, 120),
      });
    } catch (e) {
      /* ignore */
    }
  });
}

async function shot(page, name, viewName) {
  const file = join(OUT, `${name}-${viewName}.png`);
  await page.screenshot({ path: file, fullPage: false });
  process.stdout.write(`  ✓ ${name}-${viewName}.png\n`);
  return file;
}

async function loadPage(page, path) {
  await page.goto(`${STUDIO}${path}`, {
    waitUntil: 'networkidle2',
    timeout: 20_000,
  });
  await new Promise((r) => setTimeout(r, 700)); // client-side redirects
}

async function walk(page, viewName, name, path, prep) {
  await page.setViewport(VIEWS[viewName]);
  const coll = makeCollector();
  await attachCollector(page, coll);
  try {
    await loadPage(page, path);
    if (prep) await prep(page);
    await shot(page, name, viewName);
  } catch (err) {
    process.stderr.write(`  ✗ ${name}-${viewName}: ${err.message}\n`);
    coll.console.push({ type: 'walk-error', text: err.message.slice(0, 200) });
  }
  page.removeAllListeners('response');
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('requestfailed');
  return { name, view: viewName, ...coll };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const all = [];
  for (const v of ['390', 'desk']) {
    const page = await browser.newPage();

    all.push(await walk(page, v, '01-door', '/'));
    all.push(await walk(page, v, '02-auth', '/login'));

    // 03-login-error: نموذجُ الدخول بكلمةٍ مخترَعة — نقيسُ شكلَ الرسالة.
    all.push(
      await walk(page, v, '03-login-error', '/login', async (p) => {
        // نبحثُ عن حقلَي email/password بأيّ محدِّدٍ متاح
        const emailSel = 'input[type="email"], input[name="email"]';
        const pwSel = 'input[type="password"], input[name="password"]';
        await p.waitForSelector(emailSel, { timeout: 5000 });
        await p.type(emailSel, FAKE_EMAIL);
        await p.type(pwSel, FAKE_PASSWORD);
        // زرُّ الإرسال — بحسب النموذج نستهدف submit
        const btnSel = 'button[type="submit"]';
        await p.click(btnSel);
        // ننتظرُ حتّى تظهرَ رسالةُ خطأ أو ينقضي وقت
        await new Promise((r) => setTimeout(r, 3000));
      })
    );

    all.push(await walk(page, v, '04-signup', '/signup'));
    all.push(await walk(page, v, '05-forgot', '/forgot-password'));

    await page.close();
  }

  await browser.close();

  await writeFile(
    join(OUT, '_network-log.json'),
    JSON.stringify(all, null, 2),
    'utf8'
  );
  process.stdout.write(`\n[log] ${join(OUT, '_network-log.json')}\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e.message}\n`);
  process.exit(1);
});
