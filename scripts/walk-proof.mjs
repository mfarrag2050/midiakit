#!/usr/bin/env node
// 490 → 551c · مشية حيّة بالمستأجر الذي جهّزه walk-provision.
// node scripts/walk-proof.mjs
// المصادقة من walk-creds.json فقط؛ لا signup ولا SQL ولا تغيير حصّة.
// RENDER_TIMEOUT_MS يحدّ الانتظار. العامل المطفأ يجب أن ينتهي بفشل صريح.

import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const requireRenderer = createRequire(new URL('../apps/renderer/package.json', import.meta.url));
const { Canvas, loadImage } = requireRenderer('skia-canvas');
const WAIT_MS = Number(process.env.RENDER_TIMEOUT_MS || 180_000);
if (!Number.isFinite(WAIT_MS) || WAIT_MS <= 0) throw new Error('INVALID_RENDER_TIMEOUT');
const HEADLINE = 'مراسلنا: افتتاح مساحات خضراء جديدة في المدينة هذا الأسبوع';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let accessToken;
let activeBrowser;
let browserPage;

async function api(path, method = 'GET', body) {
  const { status, ok, data } = await browserPage.evaluate(async ({ url, method, body, token }) => {
    const response = await fetch(url, {
      method, signal: AbortSignal.timeout(10_000), redirect: 'error',
      headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ok: response.ok, data: await response.json() };
  }, { url: `${API}/v1${path}`, method, body, token: accessToken });
  if (!ok) throw new Error(`${method} ${path}: HTTP ${status} code=${data.error?.code || 'UNKNOWN'} field=${data.error?.field || '-'}`);
  return data;
}

async function prepareProject() {
  const credentialsPath = '/Users/mdervis/MediaKit/pf-mediakit-api/apps/api/.local/walk-creds.json';
  const metadata = await stat(credentialsPath);
  if ((metadata.mode & 0o777) !== 0o600) throw new Error('WALK_CREDENTIALS_MODE_MUST_BE_0600');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (!credentials.tenantId || !credentials.apiKey || !credentials.email || !credentials.password) {
    throw new Error('WALK_CREDENTIALS_INCOMPLETE');
  }
  const signedIn = await api('/auth/login', 'POST', {
    email: credentials.email, password: credentials.password,
  });
  if (signedIn.tenant.id !== credentials.tenantId || !signedIn.tenant.name.startsWith('walk-')) {
    throw new Error('WALK_TENANT_IDENTITY_MISMATCH');
  }
  accessToken = signedIn.session.accessToken;
  const brand = await api('/brand-kits', 'POST', { name: 'هوية تجريبية', locale: 'ar' });
  // ألوان مخترعة؛ الخط المضمّن IBM Plex Sans Arabic مرخّص SIL OFL-1.1 (assets/fonts/OFL.txt).
  await api(`/brand-kits/${brand.id}`, 'PATCH', { colors: {
    text: '#F6F2E9', accent: '#C8BA91', urgentBadge: '#326F69',
    urgentBg: '#214C50', urgentBgTint: '#193D43', locationBadge: '#426E79',
    surface: '#18383F', placeholder: ['#37616B', '#18383F'],
  }});
  const templates = await api('/templates?limit=100&filter[scope]=global');
  let template;
  for (const row of templates.data) {
    const full = await api(`/templates/${row.id}`);
    if (full.definition.id === 'breaking') { template = full; break; }
  }
  if (!template) throw new Error('BREAKING_TEMPLATE_NOT_FOUND');
  const project = await api('/projects', 'POST', {
    title: 'مساحات خضراء جديدة', brand_kit_id: brand.id, template_id: template.id,
    content: { headline: 'عنوان أولي للمشروع', source: 'مراسلنا' }, locale: 'ar',
  });
  await writeFile(join(OUT, '_run.json'), JSON.stringify({
    stamp: STAMP, tenant: { id: signedIn.tenant.id, name: signedIn.tenant.name }, projectId: project.id,
    brandId: brand.id, templateId: template.id, template: template.definition.id,
    studio: STUDIO, api: API, timeoutMs: WAIT_MS,
  }, null, 2));
  return { tokens: signedIn.session, projectId: project.id };
}

async function clickButton(page, label) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label && !b.disabled);
    button?.click(); return Boolean(button);
  }, label);
  if (!clicked) throw new Error(`BUTTON_NOT_FOUND: ${label}`);
}

async function measure(file, format) {
  const bytes = await readFile(file);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const stream = probe.streams.find((s) => s.codec_type === 'video');
  const duration = Number(probe.format.duration || 0);
  const frame = format === 'mp4'
    ? execFileSync('ffmpeg', ['-v', 'error', '-ss', String(duration / 2), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { maxBuffer: 20 * 1024 * 1024 })
    : bytes;
  if (format === 'mp4') await writeFile(join(OUT, 'mp4-midpoint.png'), frame);
  const img = await loadImage(frame); const canvas = new Canvas(img.width, img.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
  let black = 0; const colors = new Set();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 16 && pixels[i + 1] < 16 && pixels[i + 2] < 16) black++;
    // عيّنة كل 100 بكسل، كما يصف تقرير 500؛ تعريف الأسود معلن هنا.
    if (i % 400 === 0) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    width: img.width, height: img.height, codec: stream.codec_name, profile: stream.profile,
    pix_fmt: stream.pix_fmt, duration, blackPixels: black, totalPixels: img.width * img.height,
    blackPercent: 100 * black / (img.width * img.height), uniqueColorsSample: colors.size,
    colorSampleStride: 100, blackDefinition: 'R,G,B each <16', probe };
}

async function exportFile(page, shot, projectId, format) {
  await page.click('[data-testid="size-reel"]');
  await page.click(`[data-testid="format-${format}"]`);
  await shot(`06-${format}-selected`, await autoChecks(page));
  const responsePromise = page.waitForResponse((r) => r.url() === `${API}/v1/renders` && r.request().method() === 'POST', { timeout: 15_000 });
  await clickButton(page, 'تصدير الآن');
  const response = await responsePromise; const created = await response.json();
  if (response.status() !== 202) throw new Error(`export-${format}: HTTP ${response.status()} code=${created.error?.code || 'UNKNOWN'}`);
  await writeFile(join(OUT, `${format}-render.json`), JSON.stringify({ projectId, format, ...created }, null, 2));
  await pause(1200); await shot(`07-${format}-waiting`, await autoChecks(page));
  const deadline = Date.now() + WAIT_MS;
  let row;
  while (Date.now() < deadline) {
    row = await api(`/renders/${created.id}`);
    if (row.project_id !== projectId || row.format !== format) throw new Error('RENDER_IDENTITY_MISMATCH');
    if (row.status === 'succeeded') break;
    if (['failed', 'cancelled'].includes(row.status)) {
      await shot(`08-${format}-failed`, await autoChecks(page));
      throw new Error(`export-${format}: id=${row.id} status=${row.status} code=${row.error?.code || '-'} support=${row.error?.supportCode || '-'}`);
    }
    await pause(Math.min(1000, Math.max(0, deadline - Date.now())));
  }
  if (row?.status !== 'succeeded') {
    await shot(`08-${format}-timeout`, await autoChecks(page));
    throw new Error(`export-${format}: RENDER_TIMEOUT — لا عامل أكمل المهمة خلال المهلة ${WAIT_MS}ms؛ id=${created.id} status=${row?.status || 'unknown'}`);
  }
  await pause(1200); await shot(`08-${format}-succeeded`, await autoChecks(page));
  const output = await api(`/renders/${created.id}/output`);
  const target = new URL(output.url);
  if (target.origin !== 'http://127.0.0.1:19043') throw new Error('OUTPUT_ORIGIN_IS_NOT_DEV_MINIO_19043');
  const download = await fetch(output.url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  await writeFile(join(OUT, `${format}-download.json`), JSON.stringify({
    origin: target.origin, pathname: target.pathname, status: download.status,
    contentType: download.headers.get('content-type'), contentLength: download.headers.get('content-length'),
  }, null, 2));
  if (!download.ok) throw new Error(`download-${format}: HTTP ${download.status}`);
  const file = join(OUT, `export.${format}`);
  await writeFile(file, Buffer.from(await download.arrayBuffer()));
  const metrics = await measure(file, format);
  await writeFile(join(OUT, `${format}-metrics.json`), JSON.stringify({ renderId: created.id, ...metrics }, null, 2));
  await shot(`09-${format}-downloaded`, await autoChecks(page));
  process.stdout.write(`export-${format}: succeeded id=${created.id} file=${file} sha256=${metrics.sha256}\n`);
}


const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const STUDIO = process.env.STUDIO_HOST || 'http://127.0.0.1:19051';
const API = process.env.API_HOST || 'http://127.0.0.1:19040';
if (STUDIO !== 'http://127.0.0.1:19051' || API !== 'http://127.0.0.1:19040') {
  throw new Error('WALK_551_REQUIRES_STUDIO_19051_API_19040');
}
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT =
  new URL(`../out/walk-551c-${STAMP}/`, import.meta.url).pathname;

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
  process.stdout.write(`STUDIO=${STUDIO} · API=${API} · OUT=${OUT}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: join(OUT, 'browser-profile'),
  });
  activeBrowser = browser;
  const page = await browser.newPage();
  browserPage = page;
  await page.setViewport(DESK);
  await page.goto(`${STUDIO}/login`, { waitUntil: 'networkidle2', timeout: 20_000 });
  const { tokens, projectId } = await prepareProject();
  await login(browser, tokens);
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
    const titleSel = 'textarea[data-testid^="field-headline"], textarea[data-field="title"], textarea';
    await page.waitForSelector(titleSel, { timeout: 10_000 });
    await page.focus(titleSel);
    await page.$eval(titleSel, (el) => el.select());
    await page.keyboard.type(HEADLINE, { delay: 10 });
    const savedResponse = page.waitForResponse((r) => r.url() === `${API}/v1/projects/${projectId}` && r.request().method() === 'PATCH', { timeout: 15_000 });
    await clickButton(page, 'حفظ');
    const saved = await savedResponse;
    if (!saved.ok()) throw new Error(`save: HTTP ${saved.status()}`);
    const stored = await api(`/projects/${projectId}`);
    if (stored.content.headline !== HEADLINE) throw new Error('HEADLINE_NOT_SAVED');
    await pause(2000);
    await shot('05-preview', await autoChecks(page, '05-preview'));
    await exportFile(page, shot, projectId, 'png');
    await exportFile(page, shot, projectId, 'mp4');
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

main().catch(async (e) => {
  process.stderr.write(`FATAL: ${e.message}\n`);
  await writeFile(join(OUT, '_failure.txt'), `${e.stack}\n`).catch(() => {});
  await activeBrowser?.close();
  process.exitCode = 1;
});
