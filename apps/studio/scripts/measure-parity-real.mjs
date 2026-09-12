#!/usr/bin/env node
// 180-PARITY-REAL — قياس التطابق على API حقيقيّ (لا mock)
// المدخل الواحد: نفس العنوان + نفس القالب (breaking) + قماش x
// الطرف (أ): بكسلات canvas المعاينة في المتصفّح (studio يشير إلى real api)
// الطرف (ب): بايتات الملفّ الحقيقيّ من renderer worker → S3 presigned
// المخرج: %diff أو «لم أستطع القياس» + العائق المحدَّد

import puppeteer from 'puppeteer-core';
import { Canvas, loadImage } from 'skia-canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

// شرط التشغيل — لتكرار قياس 180 من الصفر:
//   1) mkapi حيّ:      NEXT_PUBLIC_API_URL على 127.0.0.1:19040
//   2) postgres+redis+minio (Colima) — راجع docker ps
//   3) api-worker:    node --import tsx apps/renderer/src/api-worker.ts
//                     مع DATABASE_URL_APP + REDIS_URL محدَّدَين
//   4) studio dev:    NEXT_PUBLIC_API_MOCK=false NEXT_PUBLIC_API_URL=...
//                     على 127.0.0.1:19052

const CHROME =
  process.env.CHROME_BIN ??
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const STUDIO = process.env.STUDIO_BASE ?? 'http://127.0.0.1:19052';
const API = process.env.API_BASE ?? 'http://127.0.0.1:19040';
const OUT = resolve(REPO_ROOT, 'out', 'parity-real');
mkdirSync(OUT, { recursive: true });

const DIFF_THRESHOLD = 30;
const HEADLINE = 'انفجار في محطّة الوقود يودي بحياة ثلاثة أشخاص.';
const SOURCE = 'وكالات';

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ─── (١) signup + brand-kit + project on REAL api ───
const ts = Date.now();
const email = `p180r-${ts}@test.example`;
const password = 'letmein12345';

console.log(`[real] signup email=${email}`);
const su = await api('/v1/auth/signup', { method: 'POST', body: { email, password, tenantName: `P180R-${ts}` } });
if (su.status !== 200 && su.status !== 201) { console.error('signup failed', su.status, su.text.slice(0, 200)); process.exit(1); }
const token = su.json.session.accessToken;
const authH = { authorization: `Bearer ${token}` };
console.log(`[real] token=${token.slice(0, 24)}…`);

const bk = await api('/v1/brand-kits', { method: 'POST', headers: authH, body: { name: 'P180R kit' } });
if (bk.status !== 201 && bk.status !== 200) { console.error('bk failed', bk.status, bk.text); process.exit(1); }
const bkId = bk.json.id;
console.log(`[real] brand-kit=${bkId}`);

const tp = await api('/v1/templates', { headers: authH });
const breaking = tp.json.data.find((t) => /عاجل|breaking/i.test(t.name));
const tplId = breaking?.id ?? tp.json.data[0].id;
console.log(`[real] template=${tplId} (${breaking?.name ?? tp.json.data[0].name})`);

const pr = await api('/v1/projects', {
  method: 'POST',
  headers: authH,
  body: { title: 'P180R project', brand_kit_id: bkId, template_id: tplId,
    content: { headline: HEADLINE, source: SOURCE, locale: 'ar' } },
});
if (pr.status !== 201 && pr.status !== 200) { console.error('project failed', pr.status, pr.text.slice(0, 300)); process.exit(1); }
const projId = pr.json.id;
console.log(`[real] project=${projId}`);

const rn = await api('/v1/renders', {
  method: 'POST',
  headers: { ...authH, 'idempotency-key': `p180r-${ts}` },
  body: { project_id: projId, size: 'x', format: 'png' },
});
if (rn.status !== 202) { console.error('render enqueue failed', rn.status, rn.text.slice(0, 300)); process.exit(1); }
const rndId = rn.json.id;
console.log(`[real] render enqueued=${rndId}`);

let serverExportBuf = null;
let serverBlocker = null;
for (let i = 1; i <= 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const g = await api(`/v1/renders/${rndId}`, { headers: authH });
  const s = g.json.status;
  console.log(`[real] poll ${i}: ${s}${g.json.error ? ' · ' + g.json.error.code + ' · ' + g.json.error.message : ''}`);
  if (s === 'succeeded') {
    const o = await api(`/v1/renders/${rndId}/output`, { headers: authH });
    const url = o.json.output_url || o.json.url;
    console.log(`[real] output_url: ${url?.slice(0, 100)}…`);
    const b = await fetch(url);
    serverExportBuf = Buffer.from(await b.arrayBuffer());
    writeFileSync(`${OUT}/side-B-server-render.png`, serverExportBuf);
    console.log(`[real] downloaded ${serverExportBuf.length} bytes → side-B-server-render.png`);
    break;
  }
  if (s === 'failed' || s === 'canceled') {
    serverBlocker = { status: s, error: g.json.error ?? null };
    break;
  }
}
if (!serverExportBuf && !serverBlocker) serverBlocker = { status: 'timeout', error: null };

// ─── (٢) side A: preview canvas from browser (studio → real api) ───
console.log('\n[browser] launching…');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1400, height: 1500 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

await page.goto(`${STUDIO}/login`, { waitUntil: 'domcontentloaded' });
await page.type('input[type="email"]', email, { delay: 20 });
await page.type('input[type="password"]', password, { delay: 20 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
  page.click('button[type=submit]'),
]);
await new Promise((r) => setTimeout(r, 3000));

// dashboard/breaking
await page.goto(`${STUDIO}/breaking`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3500));

// اختر الهوية أوّلاً — قد لا يُختار افتراضياً في real mode
await page.evaluate((bkId) => {
  const s = document.querySelector('select#composer-kit');
  if (s) { s.value = bkId; s.dispatchEvent(new Event('change', { bubbles: true })); }
}, bkId);
await new Promise((r) => setTimeout(r, 400));

await page.evaluate((h, s) => {
  const setVal = (el, v) => {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  setVal(document.getElementById('composer-headline'), h);
  setVal(document.getElementById('composer-source'), s);
}, HEADLINE, SOURCE);
await new Promise((r) => setTimeout(r, 1500));

await page.screenshot({ path: `${OUT}/browser-full.png`, fullPage: true });

const canvasWH = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { w: c.width, h: c.height } : null;
});
console.log(`[browser] canvas=${JSON.stringify(canvasWH)}`);

let previewBuf = null;
if (canvasWH) {
  const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  previewBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(`${OUT}/side-A-preview.png`, previewBuf);
  console.log(`[browser] preview captured ${previewBuf.length} bytes → side-A-preview.png`);
}

await browser.close();

// ─── (٣) compare ───
async function compare(bufA, bufB, tag) {
  const [ia, ib] = await Promise.all([loadImage(bufA), loadImage(bufB)]);
  const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
  const ca = new Canvas(W, H); ca.getContext('2d').drawImage(ia, 0, 0, W, H);
  const cb = new Canvas(W, H); cb.getContext('2d').drawImage(ib, 0, 0, W, H);
  const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
  const db = cb.getContext('2d').getImageData(0, 0, W, H).data;
  const cd = new Canvas(W, H); const ctxd = cd.getContext('2d');
  const idata = ctxd.createImageData(W, H);
  let diff = 0; const zones = { top: 0, middle: 0, bottom: 0 };
  for (let i = 0; i < da.length; i += 4) {
    const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]);
    const y = Math.floor((i / 4) / W);
    if (delta > DIFF_THRESHOLD) {
      diff++;
      idata.data[i] = 255; idata.data[i+3] = 220;
      if (y < H/3) zones.top++; else if (y < 2*H/3) zones.middle++; else zones.bottom++;
    } else {
      idata.data[i] = da[i]; idata.data[i+1] = da[i+1]; idata.data[i+2] = da[i+2]; idata.data[i+3] = 80;
    }
  }
  ctxd.putImageData(idata, 0, 0);
  writeFileSync(`${OUT}/diff-${tag}.png`, await cd.toBuffer('png'));
  return { widthA: ia.width, heightA: ia.height, widthB: ib.width, heightB: ib.height,
    comparedAt: { w: W, h: H }, diffCount: diff, total: W*H, diffPct: diff/(W*H), zones };
}

console.log('\n============ RESULT ============');
if (previewBuf && serverExportBuf) {
  const r = await compare(previewBuf, serverExportBuf, 'real');
  console.log('[REAL] preview vs server render:', JSON.stringify(r, null, 2));
} else {
  console.log('[REAL] لم أستطع القياس · العائق المحدَّد:');
  console.log('  serverBlocker:', JSON.stringify(serverBlocker, null, 2));
  console.log('  previewBuf:', previewBuf ? 'OK' : 'MISSING');
}

// life test
if (previewBuf) {
  const self = await compare(previewBuf, previewBuf, 'self');
  const img = await loadImage(previewBuf);
  const nudged = new Canvas(img.width, img.height);
  const nctx = nudged.getContext('2d');
  nctx.drawImage(img, 1, 0, img.width - 1, img.height);
  nctx.drawImage(img, 0, 0, 1, img.height);
  const nb = await nudged.toBuffer('png');
  writeFileSync(`${OUT}/side-A-preview-nudged.png`, nb);
  const shifted = await compare(previewBuf, nb, 'self-nudged');
  console.log('\n[LIFE self-match]:', self.diffCount);
  console.log('[LIFE self-nudged]:', shifted.diffCount, '· zones:', JSON.stringify(shifted.zones));
}

console.log('\ndone.');
