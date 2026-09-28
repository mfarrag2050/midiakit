#!/usr/bin/env node
/**
 * 531 — brand-add · إضافة هويّة إلى حسابٍ عبر الـAPI (HTTP فقط · لا DB).
 *
 * الاستعمال:
 *   DEMO_EMAIL='...' DEMO_PASSWORD='...' \
 *     node scripts/brand-add.mjs [--base-url http://127.0.0.1:19040] [--brand manara-agency]
 *
 * السلوك:
 *   1. دخول
 *   2. GET /v1/brand-kits — إن وُجدت هويّة بالاسم المطابق ⇒ ⏭ + exit 0 (idempotent)
 *   3. وإلّا: POST /v1/brand-kits ثمّ PATCH بالـconfig الكامل من brands/<id>.json
 *      (يستبعد المفاتيح المحظورة: id · createdAt · updatedAt · tenantId · version ·
 *      assets.version · fonts.primary.licenseAck · attribution.logoAcks.*.licenseAck)
 *   4. تحقّق بعد الإنشاء: GET الهويّة → قارن colors.urgentBg + fonts.primary.family
 *
 * حرّاس المسار الإنتاجيّ:
 *   - أيّ base-url يشير إلى 19062/19063/19064/1908x/19070/mkdemo يتطلّب
 *     DEMO_OWNER=1 + DEMO_HOST_ACK=1 (بيئة المالك بعد promote).
 *
 * ══════════════════════════════════════════════════════════════
 * ممنوع تشغيله على العرض من غير المالك — كما في demo-path.
 * ══════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i] ?? 'true';
    args.set(key, val);
  }
}

const BASE_URL = args.get('base-url') ?? process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:19040';
const BRAND_ID = args.get('brand') ?? 'manara-agency';
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OWNER_MODE = process.env.DEMO_OWNER === '1' && process.env.DEMO_HOST_ACK === '1';

if (!EMAIL || !PASSWORD) {
  console.error('✗ DEMO_EMAIL و DEMO_PASSWORD مطلوبان (env). لا تمرّرهما في argv.');
  process.exit(1);
}

const FORBIDDEN_HOST_PATTERNS = [/:19062/, /:19063/, /:19064/, /:1908\d/, /mkdemo\.primeflow\.co/, /:19070/, /:19071/];
if (!OWNER_MODE) {
  for (const p of FORBIDDEN_HOST_PATTERNS) {
    if (p.test(BASE_URL)) {
      console.error(`✗ base-url ${BASE_URL.replace(/[a-z0-9]/gi, '*')} يشير إلى بيئة عرض/إنتاج — استعمل dev.`);
      console.error('  للتشغيل على العرض: DEMO_OWNER=1 DEMO_HOST_ACK=1 (بيئة المالك فقط).');
      process.exit(1);
    }
  }
}

// ── قراءة ملف الهويّة المرجعيّ ─────────────────────────────
const brandPath = join(ROOT, 'brands', `${BRAND_ID}.json`);
let brandSrc;
try {
  brandSrc = JSON.parse(readFileSync(brandPath, 'utf-8'));
} catch (err) {
  console.error(`✗ لا يمكن قراءة ${brandPath}: ${err.message}`);
  process.exit(1);
}

const targetName = brandSrc.name || BRAND_ID;
// نمطُ المطابقة يقبل الاسم العربيّ أو اللاتينيّ.
const NAME_PATTERN = /manara|منارة|مَنارة/i;

// المفاتيح المحظورة في PATCH (BLOCKED_PATHS في update.ts:35).
const BLOCKED_TOP = new Set(['id', 'createdAt', 'updatedAt', 'tenantId', 'version']);
// المفاتيح المسموحة top-level (ALLOWED_TOP_LEVEL في update.ts:54).
const ALLOWED_TOP = new Set([
  'name', 'direction', 'locale',
  'fonts', 'colors', 'logo', 'typography',
  'badges', 'gradient', 'shadows', 'margins', 'motion',
  'outputs', 'audio', 'attribution', 'assets', 'placement',
  'transcription', 'tts',
]);

// نُنظّف الحقول الفرعيّة المحظورة داخل نسخة PATCH.
function stripBlockedFonts(obj) {
  if (obj?.primary?.licenseAck !== undefined) {
    const { licenseAck: _lic, ...rest } = obj.primary;
    obj = { ...obj, primary: rest };
  }
  return obj;
}
function stripBlockedAssets(obj) {
  if (obj?.version !== undefined) {
    const { version: _v, ...rest } = obj;
    obj = rest;
  }
  return obj;
}
function stripBlockedAttribution(obj) {
  if (!obj?.logoAcks || typeof obj.logoAcks !== 'object') return obj;
  const cleaned = {};
  for (const [k, v] of Object.entries(obj.logoAcks)) {
    if (v && typeof v === 'object') {
      const { licenseAck: _lic, ...rest } = v;
      cleaned[k] = rest;
    } else cleaned[k] = v;
  }
  return { ...obj, logoAcks: cleaned };
}

function buildPatch(src) {
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (BLOCKED_TOP.has(k)) continue;
    if (!ALLOWED_TOP.has(k)) continue; // يتخطّى id/version تلقائيّاً
    if (k === 'fonts') out[k] = stripBlockedFonts(v);
    else if (k === 'assets') out[k] = stripBlockedAssets(v);
    else if (k === 'attribution') out[k] = stripBlockedAttribution(v);
    else out[k] = v;
  }
  // اسم الهويّة داخل الحساب: نُطبّق `manara` القصير (المطابق لبحث demo-path).
  out.name = 'منارة';
  return out;
}

// ── HTTP ────────────────────────────────────────────────
async function api(method, path, { token, body, expectStatus } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(BASE_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* raw */ }
  if (expectStatus != null && r.status !== expectStatus) {
    const preview = text.slice(0, 300);
    throw new Error(`${method} ${path} → ${r.status} · body: ${preview}`);
  }
  return { status: r.status, data, text };
}

// ── الرحلة ───────────────────────────────────────────────
console.log(`▶ brand-add على ${BASE_URL} · brand=${BRAND_ID}`);
try {
  // (1) دخول
  const login = await api('POST', '/v1/auth/login', { body: { email: EMAIL, password: PASSWORD }, expectStatus: 200 });
  const token = login.data?.session?.accessToken;
  if (!token) { console.error('✗ accessToken غائب من الاستجابة'); process.exit(1); }

  // (2) idempotent — إن كانت موجودة
  const listing = await api('GET', '/v1/brand-kits', { token, expectStatus: 200 });
  const items = Array.isArray(listing.data?.data) ? listing.data.data : (Array.isArray(listing.data) ? listing.data : []);
  const existing = items.find(x => NAME_PATTERN.test(String(x?.name ?? '')));
  if (existing) {
    console.log(`⏭ موجودة (${existing.id}) — لا شيء لعمله. لديك ${items.length} هويّة.`);
    process.exit(0);
  }

  // (3) إنشاء
  const created = await api('POST', '/v1/brand-kits', {
    token,
    body: { name: 'منارة', direction: brandSrc.direction ?? 'rtl', locale: brandSrc.locale ?? 'ar' },
  });
  if (created.status === 422 && created.data?.error?.code === 'PLAN_LIMIT_REACHED') {
    console.error('✗ الخطّة رفضت — brand_kits_limit مبلَغ. ارفع الحصّة على مستوى الحساب قبل إعادة المحاولة.');
    process.exit(1);
  }
  if (created.status !== 201) {
    console.error(`✗ POST /v1/brand-kits → ${created.status}: ${created.text.slice(0, 300)}`);
    process.exit(1);
  }
  const bkId = created.data?.id;
  console.log(`  ✓ POST /v1/brand-kits → 201 · id=${bkId}`);

  // (4) PATCH بالـconfig الكامل (بعد تصفية المحظور)
  const patchBody = buildPatch(brandSrc);
  const patched = await api('PATCH', `/v1/brand-kits/${bkId}`, { token, body: patchBody });
  if (patched.status !== 200) {
    console.error(`✗ PATCH /v1/brand-kits/${bkId} → ${patched.status}: ${patched.text.slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`  ✓ PATCH /v1/brand-kits/${bkId} → 200`);

  // (5) تحقّق: GET وقارن الحقلَين المستهدَفَين
  const verify = await api('GET', `/v1/brand-kits/${bkId}`, { token, expectStatus: 200 });
  const cfg = verify.data?.config ?? {};
  const gotUrgentBg = cfg.colors?.urgentBg;
  const wantUrgentBg = brandSrc.colors?.urgentBg;
  const gotFontFamily = cfg.fonts?.primary?.family;
  const wantFontFamily = brandSrc.fonts?.primary?.family;

  const okColor = String(gotUrgentBg).toLowerCase() === String(wantUrgentBg).toLowerCase();
  const okFont = gotFontFamily === wantFontFamily;
  console.log(`  ${okColor ? '✓' : '✗'} colors.urgentBg = ${gotUrgentBg} (متوقّع ${wantUrgentBg})`);
  console.log(`  ${okFont ? '✓' : '✗'} fonts.primary.family = ${gotFontFamily} (متوقّع ${wantFontFamily})`);
  if (!okColor || !okFont) {
    console.error('✗ التحقّق فشل — الحقول لم تُحفظ كما هي.');
    process.exit(1);
  }
  console.log(`✓ أُنشئت الهويّة (${bkId}).`);
  process.exit(0);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
