#!/usr/bin/env node
// 490 · سكربتُ مشيِ الإثبات — درَجُ العرض بترتيبِ `920 §١`
//
// من `/login` إلى «المعاينةُ الحيّة» على `/projects/[id]`. ما بعد ذلك
// (تصدير · طوابير · تنزيل) يحتاجُ عاملاً حيّاً — لا يُقاس بمشيٍ صرف.
//
// متغيّرُ عنوانٍ واحدٌ: `STUDIO_HOST` — المضيفُ والمنفذُ لِواجهةِ الستوديو.
//   محلّي:  STUDIO_HOST=http://127.0.0.1:19050 API_HOST=http://127.0.0.1:19086 node …
//   شوروم: STUDIO_HOST=https://mkdemo.primeflow.co  node …
//         (API مُخدَّم على نفس الأصل عبر proxy فلا حاجةَ إلى API_HOST)
//
// كلماتُ سرِّ المالك من `~/MediaKit/.show-owner-password`. البريد افتراضاً
// `owner@qindeel.example` (من seed-showroom). كلاهما env-override.
//
// الاستخدام:
//   STUDIO_HOST=http://127.0.0.1:19050 API_HOST=http://127.0.0.1:19086 \
//       node scripts/walk-proof.mjs

import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const STUDIO = process.env.STUDIO_HOST || 'http://127.0.0.1:19050';
const API = process.env.API_HOST || STUDIO;
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@qindeel.example';
const PWFILE = process.env.OWNER_PWFILE || `${process.env.HOME}/MediaKit/.show-owner-password`;

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT =
  process.env.OUT || `/Users/mdervis/MediaKit/Claude outputs/walk-proof-${STAMP}`;

const DESK = { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false };

// ─────────────────────────────  الفحوصُ الآليّة  ─────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ARABIC_INDIC_RE = /[٠-٩]/;
const LATIN_DIGITS_RE = /\b\d+\b/;
const PROGRAMMER_LEAK = /إثبات بوابة المرحلة|gate proof phase|phase 2 gate|dev\/|DEBUG|__NEXT_DATA__/i;
// رموزُ الأخطاءِ الخامةُ تحملُ underscore دائماً (INVALID_CREDENTIALS ·
// PLAN_LIMIT_REACHED · …). حرصاً على تجنّبِ مطابقةِ اسمِ العلامةِ التجاريّة
// (MEDIA KIT) نُشترطُ underscore داخلَ الرمز.
const ERROR_CODE_LEAK = /\b[A-Z]{2,}(?:_[A-Z]{2,})+\b/;

/** يستخرجُ كلَّ النصِّ المرئيّ من الصفحة. */
async function pageText(page) {
  return await page.evaluate(() => document.body?.innerText || '');
}

/** يستخرجُ كلَّ `href` من روابط الصفحة. */
async function pageHrefs(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') || ''),
  );
}

async function autoChecks(page, name) {
  const text = await pageText(page);
  const hrefs = await pageHrefs(page);
  const checks = [];

  // ١) لا UUID خامٍ يُقرَأ في متنٍ ظاهر — الصفحاتُ يجب أن تعرضَ أسماء.
  const uuidMatch = text.match(UUID_RE);
  checks.push({
    id: 'no-raw-uuid',
    ok: !uuidMatch,
    detail: uuidMatch ? `وجدتُ: ${uuidMatch[0]}` : 'لا UUID في المتن',
  });

  // ٢) لا نصٌّ بلغةِ مبرمجٍ («إثبات بوابة المرحلة 2» · «dev/» · «DEBUG»).
  const leakMatch = text.match(PROGRAMMER_LEAK);
  checks.push({
    id: 'no-programmer-speak',
    ok: !leakMatch,
    detail: leakMatch ? `وجدتُ: ${leakMatch[0]}` : 'لا نصَّ مبرمجٍ',
  });

  // ٣) لا رابطَ يشيرُ إلى `/dev/*` من داخل التنقّل.
  const devLink = hrefs.find((h) => /(^|[^A-Za-z])\/dev\//.test(h));
  checks.push({
    id: 'no-dev-link',
    ok: !devLink,
    detail: devLink ? `href=${devLink}` : `لا href على /dev/* (فحصتُ ${hrefs.length} رابطاً)`,
  });

  // ٤) رموزُ أخطاءٍ خامةٍ (UPPER_SNAKE) لا تظهرُ في نصٍّ ظاهر.
  const codeMatch = text.match(ERROR_CODE_LEAK);
  checks.push({
    id: 'no-error-code-leak',
    ok: !codeMatch,
    detail: codeMatch ? `وجدتُ: ${codeMatch[0]}` : 'لا رمزَ خطأٍ خام',
  });

  return checks;
}

/** فحصٌ خاصٌّ بلوحةِ المشاريع: أسماءُ الهويّة والقالب تظهر (لا UUIDs). */
async function projectsTableChecks(page) {
  const info = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr, [role="row"]'));
    const cells = rows
      .slice(0, 5)
      .flatMap((r) => Array.from(r.querySelectorAll('td, [role="cell"]')).map((c) => c.textContent?.trim() || ''))
      .filter(Boolean);
    return { rowCount: rows.length, sampleCells: cells.slice(0, 30) };
  });
  const anyUUID = info.sampleCells.some((c) => /[0-9a-f]{8}-[0-9a-f]{4}/i.test(c));
  return [
    {
      id: 'projects-table-has-rows',
      ok: info.rowCount > 0,
      detail: `صفوف=${info.rowCount}`,
    },
    {
      id: 'projects-table-no-uuid-cells',
      ok: !anyUUID,
      detail: anyUUID ? 'خليّةٌ بها UUID' : `فحصتُ ${info.sampleCells.length} خليّة`,
    },
  ];
}

/** فحصٌ للطوابعِ الزمنيّة: يجب أن تحملَ أرقاماً عربيّة-هنديّة (٠-٩). */
async function timestampChecks(page) {
  const info = await page.evaluate(() => {
    // <time> أو أيّ عنصر يحمل نمطاً زمنيّاً مألوفاً YYYY-MM-DD أو HH:MM.
    const nodes = Array.from(document.querySelectorAll('time, [data-testid*="time"], [data-testid*="date"]'));
    const texts = nodes.map((n) => (n.textContent || '').trim()).filter(Boolean);
    return { count: nodes.length, samples: texts.slice(0, 10) };
  });
  if (info.count === 0) {
    return [
      { id: 'timestamps-present', ok: null, detail: 'لا طوابعَ زمنيّةً بالتحديد — يدويّ' },
    ];
  }
  const withArabic = info.samples.filter((s) => ARABIC_INDIC_RE.test(s));
  const withLatin = info.samples.filter((s) => LATIN_DIGITS_RE.test(s) && !ARABIC_INDIC_RE.test(s));
  return [
    {
      id: 'timestamps-arabic-indic',
      ok: withArabic.length > 0 && withLatin.length === 0,
      detail: `عربيّة=${withArabic.length} · لاتينيّةٌ فقط=${withLatin.length} · عيّنة: ${info.samples.slice(0, 3).join(' | ')}`,
    },
  ];
}

// ─────────────────────────────  المشي  ─────────────────────────────

async function login(browser, tokens) {
  const page = await browser.newPage();
  await page.setViewport(DESK);
  await page.goto(`${STUDIO}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await page.evaluate(
    ({ a, r }) => {
      localStorage.setItem('pfmk.studio.session.access', a);
      localStorage.setItem('pfmk.studio.session.refresh', r);
    },
    { a: tokens.accessToken, r: tokens.refreshToken },
  );
  await page.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const password = (await readFile(PWFILE, 'utf8')).trim();
  process.stdout.write(`STUDIO=${STUDIO} · API=${API} · OUT=${OUT}\n`);

  // login عبر API — نحقنُ الرموزَ في localStorage لتفاديَ rate-limit.
  const loginRes = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': STUDIO },
    body: JSON.stringify({ email: OWNER_EMAIL, password }),
  });
  if (!loginRes.ok) throw new Error(`login: ${loginRes.status} · ${(await loginRes.text()).slice(0, 200)}`);
  const j = await loginRes.json();
  const tokens = {
    accessToken: j.session?.accessToken || j.accessToken,
    refreshToken: j.session?.refreshToken || j.refreshToken,
  };

  // اختيار مشروعٍ للمشي بلا إنشاء.
  const listRes = await fetch(`${API}/v1/projects`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  const list = await listRes.json();
  const items = list?.data || list?.items || list;
  const projectId = Array.isArray(items) && items[0]?.id;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-web-security', `--user-data-dir=/tmp/pptr-490-${Date.now()}`],
  });
  await login(browser, tokens);

  const page = await browser.newPage();
  await page.setViewport(DESK);
  await page.evaluateOnNewDocument(
    ({ a, r }) => {
      try {
        localStorage.setItem('pfmk.studio.session.access', a);
        localStorage.setItem('pfmk.studio.session.refresh', r);
      } catch {}
    },
    { a: tokens.accessToken, r: tokens.refreshToken },
  );

  const findings = [];

  async function shot(name, checks = []) {
    const file = join(OUT, `${name}-desk.png`);
    await page.screenshot({ path: file, fullPage: false });
    const record = { name, file, checks };
    findings.push(record);
    process.stdout.write(`  ✓ ${name}-desk.png · فحوص=${checks.length}\n`);
  }

  // ─── ١) /login ───
  await page.goto(`${STUDIO}/login`, { waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await shot('01-login', await autoChecks(page, '01-login'));

  // ─── ٢) /projects ───
  await page.goto(`${STUDIO}/projects`, { waitUntil: 'networkidle2', timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 1500));
  const projChecks = [
    ...(await autoChecks(page, '02-projects')),
    ...(await projectsTableChecks(page)),
    ...(await timestampChecks(page)),
  ];
  await shot('02-projects', projChecks);

  // ─── ٣) dialog «مشروع جديد» ───
  const dialogOpened = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((el) => /مشروع جديد|إنشاء مشروع|New project/i.test(el.textContent || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  if (dialogOpened) {
    await new Promise((r) => setTimeout(r, 1200));
    await shot('03-new-project', await autoChecks(page, '03-new-project'));
    // إغلاق الحوار قبل المتابعة.
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  } else {
    process.stdout.write(`  … 03-new-project: زرُّ الإنشاء لم يوجَد — تخطّى\n`);
  }

  // ─── ٤) /projects/[id] ───
  if (projectId) {
    await page.goto(`${STUDIO}/projects/${projectId}`, { waitUntil: 'networkidle2', timeout: 25_000 });
    await new Promise((r) => setTimeout(r, 2000));
    await shot('04-editor', await autoChecks(page, '04-editor'));

    // ─── ٥) المعاينة الحيّة بعد كتابةِ عنوانٍ عربيٍّ حقيقيّ ───
    // نصٌّ مخترعٌ · قاعدة 394 · لا اسمَ مؤسّسةٍ حقيقيّة.
    const HEADLINE = 'محلّل Nexoria Insights يتوقّع نموّاً 3.5% في #الأسهم_العربية';
    const titleSel = 'textarea[data-testid^="field-headline"], textarea[data-field="title"], textarea';
    try {
      await page.waitForSelector(titleSel, { timeout: 3000 });
      await page.focus(titleSel);
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el && 'value' in el) el.value = '';
      }, titleSel);
      await page.keyboard.type(HEADLINE, { delay: 10 });
      await new Promise((r) => setTimeout(r, 2000));
    } catch {}
    await shot('05-preview', await autoChecks(page, '05-preview'));
  } else {
    process.stdout.write(`  … 04-editor · 05-preview: لا مشروعَ متاح — تخطّى\n`);
  }

  await browser.close();

  // ─── تقريرٌ آليّ للفحوص ───
  const summary = {
    stamp: STAMP,
    studio: STUDIO,
    api: API,
    out: OUT,
    shots: findings.map((f) => ({
      name: f.name,
      file: f.file,
      checks: f.checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })),
    })),
  };
  await writeFile(join(OUT, '_checks.json'), JSON.stringify(summary, null, 2), 'utf8');

  // نصٌّ قابلٌ للعينِ
  const lines = [];
  lines.push(`# مشيُ الإثبات · ${STAMP}`);
  lines.push(`STUDIO=${STUDIO} · API=${API}`);
  lines.push('');
  for (const s of findings) {
    lines.push(`## ${s.name}`);
    lines.push(`لقطة: ${s.file}`);
    for (const c of s.checks) {
      const mark = c.ok === true ? '✓' : c.ok === false ? '✗' : '·';
      lines.push(`  ${mark} [${c.id}] ${c.detail}`);
    }
    lines.push('');
  }
  await writeFile(join(OUT, '_checks.md'), lines.join('\n'), 'utf8');

  process.stdout.write(`\n[log] ${join(OUT, '_checks.md')}\n`);
  process.stdout.write(`[log] ${join(OUT, '_checks.json')}\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e.message}\n`);
  process.exit(1);
});
