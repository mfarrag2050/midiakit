#!/usr/bin/env node
// walk-560 · لقطاتُ سطر ETA على /dev/render-eta + قياسٌ حيٌّ من API
//
// § الصورة — نلتقط الحالات الأربع (queued مع ETA · running · succeeded ·
//   خالٍ من ETA) من صفحةِ المعرِض بلا رَندرٍ حقيقيّ (المكوّنُ يقبلُ
//   `estimatedStartAtOverride`).
// § القياسُ الحيّ — POST /v1/renders مرّتين متتاليتين على API dev
//   (19040) عبر مستخدمٍ اختباريٍّ نُنشئه إن غاب. نطبعُ N₁ · N₂ · الفرقَ.

import puppeteer from 'puppeteer-core';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME =
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const STUDIO = process.env.STUDIO ?? 'http://127.0.0.1:19050';
const API = process.env.API ?? 'http://127.0.0.1:19040';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = process.env.OUT ?? `/Users/mdervis/MediaKit/pf-mediakit-studio/out/mkst-560-${STAMP}`;

if (!existsSync(CHROME)) {
  console.error(`no chrome: ${CHROME}`);
  process.exit(2);
}

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 });

const logs = [];
page.on('pageerror', (e) => logs.push({ t: 'pageerror', msg: e.message.slice(0, 200) }));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') logs.push({ t, msg: m.text().slice(0, 200) });
});

console.log(`[walk-560] STUDIO=${STUDIO} · OUT=${OUT}`);
const url = `${STUDIO}/dev/render-eta`;
const resp = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
if (!resp || resp.status() !== 200) {
  console.error(`page load failed: ${resp?.status()}`);
  await browser.close();
  process.exit(3);
}
// شوت ١ · مبكّر — الأربعُ صيغ لا تزال محفوظةً (١ · ٢ · ٥-١٠ · ١١+).
await new Promise((r) => setTimeout(r, 400));
const shot1 = `${OUT}/01-eta-gallery-plurals.png`;
await page.screenshot({ path: shot1, fullPage: true });
console.log(`[walk-560] shot: ${shot1}`);

// شوت ٢ · بعد أربع ثوانٍ — للتحقّق من العدّ التنازليّ الحيّ.
await new Promise((r) => setTimeout(r, 4_000));
const shot2 = `${OUT}/02-eta-gallery-ticked.png`;
await page.screenshot({ path: shot2, fullPage: true });
console.log(`[walk-560] shot: ${shot2}`);

// § القياسُ الحيّ — نحاولُ POST مرّتين. إن غاب المستخدمُ الاختباريّ
// نُبلّغ الفشلَ صراحةً ولا نخترعُ رقماً.
async function tryLiveEta() {
  // نستعملُ walk-creds.json الذي جهّزَه walk-provision (mkst/551c) —
  // الطريقُ ذاتُه المستعمَل في walk-proof.mjs. مستأجرٌ منعزلٌ باسمٍ يبدأ
  // بـ `walk-`. لا signup هنا · لا كتابةَ SQL · لا تغييرَ حصّة.
  const CREDS = '/Users/mdervis/MediaKit/pf-mediakit-api/apps/api/.local/walk-creds.json';
  let creds;
  try {
    const st = await stat(CREDS);
    if ((st.mode & 0o777) !== 0o600) return { ok: false, reason: 'walk-creds mode != 0600' };
    creds = JSON.parse(await readFile(CREDS, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `no walk-creds: ${e.message}` };
  }
  const login = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (!login.ok) return { ok: false, reason: `login ${login.status}` };
  const loginJson = await login.json();
  const token = loginJson?.session?.accessToken;
  if (!token) return { ok: false, reason: 'no accessToken in login response' };
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  // نجدُ أو نصنعُ مشروعاً بأدنى شروط الرَندر.
  const projectsResp = await fetch(`${API}/v1/projects?limit=5`, { headers: h });
  if (!projectsResp.ok) return { ok: false, reason: `projects list ${projectsResp.status}` };
  const projJson = await projectsResp.json();
  let project = projJson?.data?.find((p) => p.title?.startsWith('walk-560'));
  if (!project) {
    // نأخذ أوّلَ brand-kit + template متاحَين. walk-provision أعدّهما.
    const bks = await (await fetch(`${API}/v1/brand-kits?limit=1`, { headers: h })).json();
    const bk = bks?.data?.[0];
    const tpls = await (await fetch(`${API}/v1/templates?limit=100&filter[scope]=global`, { headers: h })).json();
    const tpl = tpls?.data?.find((t) => t.id) ?? null;
    if (!bk || !tpl) return { ok: false, reason: `missing bk/tpl: bk=${!!bk} tpl=${!!tpl}` };
    const create = await fetch(`${API}/v1/projects`, {
      method: 'POST', headers: h,
      body: JSON.stringify({
        title: `walk-560-${Date.now()}`,
        brand_kit_id: bk.id, template_id: tpl.id,
        content: { headline: 'عنوان اختبار لقياس ETA', source: 'مراسلنا' },
        locale: 'ar',
      }),
    });
    if (!create.ok) return { ok: false, reason: `project create ${create.status} ${await create.text()}` };
    project = await create.json();
  }

  async function createOnce(tag) {
    const r = await fetch(`${API}/v1/renders`, {
      method: 'POST',
      headers: { ...h, 'idempotency-key': `walk-560-${tag}-${Date.now()}` },
      body: JSON.stringify({ project_id: project.id, size: 'x', format: 'png' }),
    });
    const bodyText = await r.text();
    let body = null;
    try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText.slice(0, 200) }; }
    const nowMs = Date.now();
    // نطبعُ رقمَين: N_client (كيفَ ستقرؤُه الواجهةُ من timestamps المحليّة)
    // وN_server (eta_seconds الخامّ من الخادم — دقيقٌ بلا rounding محلّيّ).
    const nClient = body?.estimatedStartAt
      ? Math.max(0, Math.round((new Date(body.estimatedStartAt).getTime() - nowMs) / 1000))
      : null;
    return {
      status: r.status,
      body,
      receivedAtMs: nowMs,
      nClient,
      nServer: body?.eta_seconds ?? null,
      saturated: body?.saturated ?? null,
    };
  }
  // نُنشئ ثلاثة رَندرات متتالية — كي نُبرزَ فرقَ ETA حتّى لو كان العاملُ
  // سريعاً. كلُّ رَندرٍ يحفظُ eta_seconds الخامَ من الخادم للمُقارنة.
  const r1 = await createOnce('n1');
  const r2 = await createOnce('n2');
  const r3 = await createOnce('n3');
  return {
    ok: true,
    projectId: project.id,
    r1, r2, r3,
    dt12Ms: r2.receivedAtMs - r1.receivedAtMs,
    dt23Ms: r3.receivedAtMs - r2.receivedAtMs,
    etaDelta12Ms: new Date(r2.body?.estimatedStartAt || 0).getTime() - new Date(r1.body?.estimatedStartAt || 0).getTime(),
    etaDelta13Ms: new Date(r3.body?.estimatedStartAt || 0).getTime() - new Date(r1.body?.estimatedStartAt || 0).getTime(),
  };
}

const live = await tryLiveEta();

await browser.close();

const summary = {
  stamp: STAMP,
  studio: STUDIO,
  api: API,
  shots: [shot1, shot2],
  logs,
  live,
};
await writeFile(`${OUT}/_summary.json`, JSON.stringify(summary, null, 2));
console.log(`[walk-560] done · ${OUT}/_summary.json`);
