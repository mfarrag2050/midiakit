#!/usr/bin/env node
// walk-480 · لوحة التحرير + المعاينة الحيّة على desk 1440×900
// المصدر: studio محلّي على 19050 (feat/studio) · api شونكست 19086
// (شونكست ستوديو 19087 يعطي 500 — builtin-fonts.ts مفقود عندهم)

import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const STUDIO = 'http://127.0.0.1:19050';
const API = 'http://127.0.0.1:19086';
const OUT = '/Users/mdervis/MediaKit/Claude outputs/walk-480';
const PWFILE = `${process.env.HOME}/MediaKit/.show-owner-password`;
const OWNER_EMAIL = 'owner@qindeel.example';

// 405/394 — لا اسم مؤسّسة حقيقيّة حتى في نصّ اختبار
const TEST_HEADLINE =
  'محلّل Nexoria Insights يتوقّع نموّاً 3.5% في #الأسهم_العربية خلال الربع القادم';

const desk = { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false };

async function main() {
  await mkdir(OUT, { recursive: true });
  const password = (await readFile(PWFILE, 'utf8')).trim();

  const loginRes = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': STUDIO },
    body: JSON.stringify({ email: OWNER_EMAIL, password }),
  });
  if (!loginRes.ok) throw new Error(`login فشل: ${loginRes.status} · ${await loginRes.text()}`);
  const loginJson = await loginRes.json();
  const tokens = {
    accessToken: loginJson.session?.accessToken || loginJson.accessToken,
    refreshToken: loginJson.session?.refreshToken || loginJson.refreshToken,
  };
  process.stdout.write(`[walk-480] login ok · token len=${tokens.accessToken?.length ?? 0}\n`);

  // اختر مشروعاً موجوداً (لا نُنشئ شيئاً على DB الحيّ)
  const listRes = await fetch(`${API}/v1/projects`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  const list = await listRes.json();
  const items = list?.data || list?.items || list;
  if (!Array.isArray(items) || items.length === 0)
    throw new Error(`لا مشاريع للاختيار منها: ${JSON.stringify(list).slice(0, 200)}`);
  const project = items[0];
  process.stdout.write(
    `[walk-480] project id=${project.id} title=${JSON.stringify(project.title ?? project.name)}\n`,
  );

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // shownext api يقبل Origin=19087 فقط · headless بلا CORS enforcement
    // للمشي فقط — لا نلمس إعدادات الخادم.
    args: ['--no-sandbox', '--disable-web-security', '--user-data-dir=/tmp/pptr-480'],
  });
  const page = await browser.newPage();
  await page.setViewport(desk);

  const netlog = [];
  const consolelog = [];
  page.on('response', async (res) => {
    try {
      const url = new URL(res.url());
      netlog.push({
        method: res.request().method(),
        host: url.host,
        path: url.pathname + (url.search ? '?…' : ''),
        status: res.status(),
      });
    } catch {}
  });
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      consolelog.push({ type: m.type(), text: m.text().slice(0, 200) });
  });
  page.on('pageerror', (e) => consolelog.push({ type: 'pageerror', text: e.message.slice(0, 200) }));

  // seed tokens
  await page.goto(`${STUDIO}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await page.evaluate(
    ({ a, r }) => {
      localStorage.setItem('pfmk.studio.session.access', a);
      localStorage.setItem('pfmk.studio.session.refresh', r);
    },
    { a: tokens.accessToken, r: tokens.refreshToken },
  );

  const projectHref = `${STUDIO}/projects/${project.id}`;

  // 03-editor: افتح المشروع + اكتب عنواناً عربيّاً طويلاً
  await page.goto(projectHref, { waitUntil: 'networkidle2', timeout: 25_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const titleSel = [
    'textarea[name="title"]',
    'input[name="title"]',
    'textarea[data-field="title"]',
    '[contenteditable="true"]',
    'textarea',
  ].join(', ');
  const filled = await page.evaluate(
    async ({ sel, text }) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, reason: 'no-title-field' };
      if ('value' in el) {
        el.focus();
        el.value = '';
      } else {
        el.textContent = '';
      }
      return { ok: true, tag: el.tagName, name: el.getAttribute('name') };
    },
    { sel: titleSel, text: TEST_HEADLINE },
  );
  process.stdout.write(`[walk-480] title-fill=${JSON.stringify(filled)}\n`);
  if (filled.ok) {
    await page.focus(titleSel);
    await page.keyboard.type(TEST_HEADLINE, { delay: 12 });
    await new Promise((r) => setTimeout(r, 1800));
  }

  await page.screenshot({ path: join(OUT, '03-editor-desk.png'), fullPage: false });
  process.stdout.write(`  ✓ 03-editor-desk.png\n`);

  // 04-preview: نفس المشروع، محاولة زرّ توليد/معاينة
  await page.goto(projectHref, { waitUntil: 'networkidle2', timeout: 25_000 });
  await new Promise((r) => setTimeout(r, 1500));
  const btnInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const match = btns.find((el) =>
      /معاينة|صدّر|صدر|توليد|preview|generate|render/i.test(el.textContent || ''),
    );
    if (match) {
      match.click();
      return { clicked: true, label: (match.textContent || '').trim().slice(0, 60) };
    }
    return { clicked: false, buttonTexts: btns.slice(0, 20).map((b) => (b.textContent || '').trim().slice(0, 40)) };
  });
  process.stdout.write(`[walk-480] preview-btn=${JSON.stringify(btnInfo)}\n`);
  await new Promise((r) => setTimeout(r, 8000));

  await page.screenshot({ path: join(OUT, '04-preview-desk.png'), fullPage: false });
  process.stdout.write(`  ✓ 04-preview-desk.png\n`);

  // كذلك fullPage لكي نرى ما تحت الطيّ
  await page.screenshot({ path: join(OUT, '04-preview-desk-full.png'), fullPage: true });

  await browser.close();

  await writeFile(
    join(OUT, '_network-log.json'),
    JSON.stringify({ project: { id: project.id, title: project.title }, requests: netlog, console: consolelog }, null, 2),
    'utf8',
  );
  process.stdout.write(`[log] ${OUT}/_network-log.json\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e.message}\n`);
  process.exit(1);
});
