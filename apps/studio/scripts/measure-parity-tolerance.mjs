#!/usr/bin/env node
// 230-PARITY-TOLERANCE — قياس التطابق على المسار الحيّ بعد فتح الحارس
// (109 على mk). ثلاث مقارنات:
//   [REAL]  preview canvas (browser)  vs.  server render (worker → S3)
//   [LIFE·أخضر]  preview vs. preview            → baseline (0 توقّعاً)
//   [LIFE·أحمر]  preview vs. preview-shifted-1px  → مرجع perceptual
//
// النتيجة تسمح بتصنيف اختلاف [REAL]:
//   بنيويّ (سطر يقع مختلفاً · حجم مختلف · عنصر مفقود) ⇒ لا تسامح
//   حسّيّ (تنعيم حواف · sub-pixel · تلميح خط)          ⇒ عتبة صغيرة
//
// شروط التشغيل:
//   1) mkapi حيّ على 127.0.0.1:19040 (فرع feat/api عليه 109)
//   2) api-worker يعمل — بدأ من apps/renderer (feat/api):
//      DATABASE_URL_APP=... REDIS_URL=... node --import tsx apps/renderer/src/api-worker.ts
//   3) studio dev على 127.0.0.1:19055 مع NEXT_PUBLIC_API_MOCK=false
//   4) Chrome for Testing — يُشغّل بـ --disable-web-security لأنّ mkapi
//      يحدّ CORS_ORIGIN على 19050 بينما studio هنا على 19055.

import puppeteer from 'puppeteer-core';
import { Canvas, loadImage } from 'skia-canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

const CHROME = process.env.CHROME_BIN ??
  '/Users/mdervis/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const STUDIO = process.env.STUDIO_BASE ?? 'http://127.0.0.1:19055';
const API = process.env.API_BASE ?? 'http://127.0.0.1:19040';
const OUT = resolve(REPO_ROOT, 'out', '230-parity');
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
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ── (١) الطرف (ب): server render via mkapi + worker ──
const ts = Date.now();
const email = `p230r-${ts}@test.example`;
const password = 'letmein12345';
const su = await api('/v1/auth/signup', { method: 'POST', body: { email, password, tenantName: `P230R-${ts}` } });
if (![200, 201].includes(su.status)) { console.error('signup fail', su.status, su.text.slice(0, 200)); process.exit(1); }
const token = su.json.session.accessToken;
const authH = { authorization: `Bearer ${token}` };
const bk = await api('/v1/brand-kits', { method: 'POST', headers: authH, body: { name: 'P230R kit' } });
const bkId = bk.json.id;
const tp = await api('/v1/templates', { headers: authH });
const breakingTemplate = tp.json.data.find((t) => /عاجل|breaking/i.test(t.name)) ?? tp.json.data[0];
const tplId = breakingTemplate.id;
const pr = await api('/v1/projects', {
  method: 'POST', headers: authH,
  body: { title: 'P230R', brand_kit_id: bkId, template_id: tplId,
    content: { headline: HEADLINE, source: SOURCE, locale: 'ar' } },
});
const projId = pr.json.id;
const rn = await api('/v1/renders', {
  method: 'POST', headers: { ...authH, 'idempotency-key': `p230r-${ts}` },
  body: { project_id: projId, size: 'x', format: 'png' },
});
const rndId = rn.json.id;
let serverBuf = null;
for (let i = 1; i <= 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const g = await api(`/v1/renders/${rndId}`, { headers: authH });
  const s = g.json.status;
  console.log(`[server] poll ${i}: ${s}${g.json.error ? ' · ' + g.json.error.code : ''}`);
  if (s === 'succeeded') {
    const o = await api(`/v1/renders/${rndId}/output`, { headers: authH });
    const b = await fetch(o.json.output_url || o.json.url);
    serverBuf = Buffer.from(await b.arrayBuffer());
    writeFileSync(`${OUT}/side-B-server.png`, serverBuf);
    break;
  }
  if (s === 'failed' || s === 'canceled') {
    console.error(`[server] terminal ${s}: ${JSON.stringify(g.json.error)}`);
    process.exit(2);
  }
}
if (!serverBuf) { console.error('[server] timeout'); process.exit(3); }

// ── (٢) الطرف (أ): browser preview via studio+real-api ──
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1440, height: 1500 },
  args: ['--disable-web-security', '--user-data-dir=/tmp/mk-230-puppeteer'] });
const page = await browser.newPage();
await page.goto(`${STUDIO}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(({ access, refresh, user, tenant }) => {
  localStorage.setItem('pfmk.studio.session.access', access);
  localStorage.setItem('pfmk.studio.session.refresh', refresh);
  localStorage.setItem('pfmk.studio.session.user', JSON.stringify(user));
  localStorage.setItem('pfmk.studio.session.tenant', JSON.stringify(tenant));
}, { access: token, refresh: su.json.session.refreshToken, user: su.json.user, tenant: su.json.tenant });
await page.goto(`${STUDIO}/breaking`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate((bkId, headline, source) => {
  const sel = document.querySelector('select#composer-kit');
  if (sel) { sel.value = bkId; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  const setVal = (el, v) => {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  setVal(document.getElementById('composer-headline'), headline);
  setVal(document.getElementById('composer-source'), source);
}, bkId, HEADLINE, SOURCE);
await new Promise((r) => setTimeout(r, 2500));
const dataUrl = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? c.toDataURL('image/png') : null;
});
if (!dataUrl) { console.error('[browser] no canvas'); await browser.close(); process.exit(4); }
const previewBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(`${OUT}/side-A-preview.png`, previewBuf);
await browser.close();

// ── (٣) compare ──
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
    const delta = Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]);
    const y = Math.floor((i/4)/W);
    if (delta > DIFF_THRESHOLD) {
      diff++;
      idata.data[i]=255; idata.data[i+3]=220;
      if (y<H/3) zones.top++; else if (y<2*H/3) zones.middle++; else zones.bottom++;
    } else {
      idata.data[i]=da[i]; idata.data[i+1]=da[i+1]; idata.data[i+2]=da[i+2]; idata.data[i+3]=80;
    }
  }
  ctxd.putImageData(idata, 0, 0);
  writeFileSync(`${OUT}/diff-${tag}.png`, await cd.toBuffer('png'));
  return { widthA: ia.width, heightA: ia.height, widthB: ib.width, heightB: ib.height,
    comparedAt: {w:W, h:H}, diffCount: diff, total: W*H, diffPct: diff/(W*H), zones };
}

const real = await compare(previewBuf, serverBuf, 'real');
console.log('\n=== REAL preview vs server ===\n', JSON.stringify(real, null, 2));

const selfMatch = await compare(previewBuf, previewBuf, 'self');
console.log('\n=== LIFE self vs self ===\n', JSON.stringify(selfMatch, null, 2));

const previewImg = await loadImage(previewBuf);
const nudged = new Canvas(previewImg.width, previewImg.height);
const nctx = nudged.getContext('2d');
nctx.drawImage(previewImg, 1, 0, previewImg.width - 1, previewImg.height);
nctx.drawImage(previewImg, 0, 0, 1, previewImg.height);
const nudgedBuf = await nudged.toBuffer('png');
const shifted = await compare(previewBuf, nudgedBuf, 'self-nudged');
console.log('\n=== LIFE self vs 1px shift ===\n', JSON.stringify(shifted, null, 2));
