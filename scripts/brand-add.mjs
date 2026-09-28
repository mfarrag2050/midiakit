#!/usr/bin/env node
/**
 * 531 · 532 — brand-add · إدارة هويّة في حساب عبر الـAPI (HTTP فقط · لا DB).
 *
 * الاستعمال:
 *   DEMO_EMAIL='...' DEMO_PASSWORD='...' \
 *     node scripts/brand-add.mjs [--base-url URL] [--brand manara-agency] \
 *                                [--into-existing] [--target <bkId>] [--restore <file>]
 *
 * الأوضاع:
 *   1. الافتراضيّ (531): إن وُجدت منارة ⇒ ⏭. وإلّا POST جديد + PATCH.
 *      يفشل بـ PLAN_LIMIT_REACHED إن كان الحدّ مبلَغاً.
 *   2. --into-existing (532): إن وُجدت منارة ⇒ ⏭. وإلّا يختار الهويّة القائمة
 *      (إن كانت وحيدة · أو المحدَّدة بـ--target) ويحوّلها بـPATCH بلا زيادة
 *      العدد — يحفظ نسخة كاملة (name + config) قبل التعديل تحت
 *      $HOME/MediaKit/backups/brand-kit-<id>-<UTC-ts>.json (0600).
 *   3. --restore <file>: PATCH name + config من ملفّ النسخة إلى نفس المعرّف
 *      (يُقرأ من الملفّ).
 *
 * حرّاس المسار الإنتاجيّ:
 *   - أيّ base-url على 19062/19063/19064/1908x/19070/19071/mkdemo يتطلّب
 *     DEMO_OWNER=1 + DEMO_HOST_ACK=1 (بيئة المالك بعد promote).
 *
 * ═════════════════════════════════════════════════════════════════
 * ممنوع تشغيله على العرض من غير المالك — كما في demo-path.
 * ═════════════════════════════════════════════════════════════════
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUPS_DIR = join(process.env.HOME ?? '', 'MediaKit', 'backups');

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
const INTO_EXISTING = args.get('into-existing') === 'true';
const TARGET_ID = args.has('target') ? args.get('target') : null;
const RESTORE_FILE = args.has('restore') ? args.get('restore') : null;
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

function buildPatchFromBrandSrc(src) {
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (BLOCKED_TOP.has(k)) continue;
    if (!ALLOWED_TOP.has(k)) continue;
    if (k === 'fonts') out[k] = stripBlockedFonts(v);
    else if (k === 'assets') out[k] = stripBlockedAssets(v);
    else if (k === 'attribution') out[k] = stripBlockedAttribution(v);
    else out[k] = v;
  }
  out.name = 'منارة';
  return out;
}

// من نسخة استرجاع (name + config): نبني PATCH.
function buildPatchFromBackup(backup) {
  const out = { name: backup.name };
  const cfg = backup.config ?? {};
  for (const [k, v] of Object.entries(cfg)) {
    if (BLOCKED_TOP.has(k)) continue;
    if (!ALLOWED_TOP.has(k)) continue;
    if (k === 'fonts') out[k] = stripBlockedFonts(v);
    else if (k === 'assets') out[k] = stripBlockedAssets(v);
    else if (k === 'attribution') out[k] = stripBlockedAttribution(v);
    else out[k] = v;
  }
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
    throw new Error(`${method} ${path} → ${r.status} · body: ${text.slice(0, 300)}`);
  }
  return { status: r.status, data, text };
}

function backupBrandKit(bk) {
  mkdirSync(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(BACKUPS_DIR, `brand-kit-${bk.id}-${stamp}.json`);
  const payload = { id: bk.id, name: bk.name, config: bk.config, savedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

// ── الرحلة ───────────────────────────────────────────────
console.log(`▶ brand-add على ${BASE_URL} · brand=${BRAND_ID}${INTO_EXISTING ? ' · into-existing' : ''}${RESTORE_FILE ? ' · restore' : ''}`);
try {
  // (1) دخول
  const login = await api('POST', '/v1/auth/login', { body: { email: EMAIL, password: PASSWORD }, expectStatus: 200 });
  const token = login.data?.session?.accessToken;
  if (!token) { console.error('✗ accessToken غائب من الاستجابة'); process.exit(1); }

  // ─────────────────────────────────────────────────────────
  // وضع الاسترجاع
  // ─────────────────────────────────────────────────────────
  if (RESTORE_FILE) {
    const abs = resolve(RESTORE_FILE);
    let backup;
    try { backup = JSON.parse(readFileSync(abs, 'utf-8')); }
    catch (err) { console.error(`✗ لا يمكن قراءة ${abs}: ${err.message}`); process.exit(1); }
    if (!backup?.id || !backup?.name || !backup?.config) {
      console.error(`✗ ملفّ النسخة ينقصه id/name/config.`); process.exit(1);
    }
    const restoreBody = buildPatchFromBackup(backup);
    const r = await api('PATCH', `/v1/brand-kits/${backup.id}`, { token, body: restoreBody });
    if (r.status !== 200) {
      console.error(`✗ PATCH restore → ${r.status}: ${r.text.slice(0, 400)}`); process.exit(1);
    }
    const v = await api('GET', `/v1/brand-kits/${backup.id}`, { token, expectStatus: 200 });
    console.log(`✓ استُرجعت الهويّة (${backup.id}) · الاسم الحاليّ: ${v.data?.name}`);
    process.exit(0);
  }

  // (2) قائمة الهويّات
  const listing = await api('GET', '/v1/brand-kits', { token, expectStatus: 200 });
  const items = Array.isArray(listing.data?.data) ? listing.data.data : (Array.isArray(listing.data) ? listing.data : []);
  const existingManara = items.find(x => NAME_PATTERN.test(String(x?.name ?? '')));
  if (existingManara) {
    console.log(`⏭ موجودة (${existingManara.id}) — لا شيء لعمله. لديك ${items.length} هويّة.`);
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────
  // وضع التحويل (into-existing)
  // ─────────────────────────────────────────────────────────
  if (INTO_EXISTING) {
    // اختيار الهدف
    let target;
    if (TARGET_ID) {
      target = items.find(x => x.id === TARGET_ID);
      if (!target) { console.error(`✗ --target ${TARGET_ID} غير موجود في القائمة.`); process.exit(1); }
    } else if (items.length === 1) {
      target = items[0];
    } else if (items.length === 0) {
      console.error('✗ --into-existing يتطلّب هويّة قائمة — لا شيء في الحساب.');
      process.exit(1);
    } else {
      const list = items.map(x => `${x.id} (${x.name})`).join(', ');
      console.error(`✗ ${items.length} هويّات — حدّد --target <id>. القائمة: ${list}`);
      process.exit(1);
    }
    // نسخة كاملة (name + config) — GET قبل أيّ تعديل.
    const full = await api('GET', `/v1/brand-kits/${target.id}`, { token, expectStatus: 200 });
    const backupObj = { id: target.id, name: full.data?.name ?? target.name, config: full.data?.config ?? {} };
    const backupFile = backupBrandKit(backupObj);
    console.log(`  ✓ نسخة محفوظة: ${backupFile}`);
    // PATCH بمحتوى منارة على نفس المعرّف — المشاريع المرتبطة تبقى مرتبطة.
    const patchBody = buildPatchFromBrandSrc(brandSrc);
    const patched = await api('PATCH', `/v1/brand-kits/${target.id}`, { token, body: patchBody });
    if (patched.status !== 200) {
      console.error(`✗ PATCH /v1/brand-kits/${target.id} → ${patched.status}: ${patched.text.slice(0, 400)}`);
      process.exit(1);
    }
    console.log(`  ✓ PATCH /v1/brand-kits/${target.id} → 200`);
    // تحقّق
    const verify = await api('GET', `/v1/brand-kits/${target.id}`, { token, expectStatus: 200 });
    const cfg = verify.data?.config ?? {};
    const gotUrgentBg = cfg.colors?.urgentBg;
    const wantUrgentBg = brandSrc.colors?.urgentBg;
    const gotFontFamily = cfg.fonts?.primary?.family;
    const wantFontFamily = brandSrc.fonts?.primary?.family;
    const gotName = verify.data?.name;
    const okColor = String(gotUrgentBg).toLowerCase() === String(wantUrgentBg).toLowerCase();
    const okFont = gotFontFamily === wantFontFamily;
    const okName = NAME_PATTERN.test(String(gotName));
    console.log(`  ${okName ? '✓' : '✗'} name = ${gotName}`);
    console.log(`  ${okColor ? '✓' : '✗'} colors.urgentBg = ${gotUrgentBg} (متوقّع ${wantUrgentBg})`);
    console.log(`  ${okFont ? '✓' : '✗'} fonts.primary.family = ${gotFontFamily} (متوقّع ${wantFontFamily})`);
    if (!okName || !okColor || !okFont) {
      console.error('✗ التحقّق فشل — الحقول لم تُحفظ كما هي.'); process.exit(1);
    }
    console.log(`✓ حُوِّلت الهويّة (${target.id}) إلى منارة. الاسترجاع: --restore ${backupFile}`);
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────
  // الوضع الافتراضيّ (531) — إنشاء جديدة
  // ─────────────────────────────────────────────────────────
  const created = await api('POST', '/v1/brand-kits', {
    token,
    body: { name: 'منارة', direction: brandSrc.direction ?? 'rtl', locale: brandSrc.locale ?? 'ar' },
  });
  if (created.status === 422 && created.data?.error?.code === 'PLAN_LIMIT_REACHED') {
    console.error('✗ الخطّة رفضت — brand_kits_limit مبلَغ. جرّب --into-existing لتحويل هويّة قائمة بدل الإنشاء.');
    process.exit(1);
  }
  if (created.status !== 201) {
    console.error(`✗ POST /v1/brand-kits → ${created.status}: ${created.text.slice(0, 300)}`);
    process.exit(1);
  }
  const bkId = created.data?.id;
  console.log(`  ✓ POST /v1/brand-kits → 201 · id=${bkId}`);

  const patchBody = buildPatchFromBrandSrc(brandSrc);
  const patched = await api('PATCH', `/v1/brand-kits/${bkId}`, { token, body: patchBody });
  if (patched.status !== 200) {
    console.error(`✗ PATCH /v1/brand-kits/${bkId} → ${patched.status}: ${patched.text.slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`  ✓ PATCH /v1/brand-kits/${bkId} → 200`);

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
    console.error('✗ التحقّق فشل — الحقول لم تُحفظ كما هي.'); process.exit(1);
  }
  console.log(`✓ أُنشئت الهويّة (${bkId}).`);
  process.exit(0);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
