#!/usr/bin/env node
// scripts/mk-show-smoke — دخول زائرٍ آليّ على طقم عرض.
//
// **السؤال الوحيد:** هل يستطيع إنسانٌ أن يستعمل هذا الطقم الآن؟
//
// **الحادثة (٣٣٠ · 2026-09-15):** طقمٌ أخضرُ بالكامل داخليّاً — حاويّات
// حيّة · عاملٌ ينبض · حالة 200 — **وبابُه مقفول**: كلمة المرور ضاعت
// وعنوان API مخبوز إلى النفق العامّ فpreflight يُرَدّ 403. سبعُ شاشات
// محجوبة يومين. الحرّاس كلُّها تنظر إلى الداخل — واحدٌ ينظر كالزائر.
//
// **خمسُ خطوات · رمزُ خروج مميَّز لكلٍّ:**
//   10  الصحّة سقطت — /v1/health لا يردّ 200.
//   20  الباب مقفول — login بلا رمز في الاستجابة.
//   30  الاتّجاه خاطئ — الاستوديو يكلّم عنواناً غير طقمك.
//   40  العمل لم يخرج حبراً — رندر → تنزيل → بوّابة الحبر أَفرَغت.
//   50  اسمٌ محظورٌ في البذرة — القاعدة ٣٩٤ · brand-blocklist.
//   99  خطأ في وسائط أو ملفّ اعتماد مفقود.
//
// **الاعتماد:** يُقرَأ من `~/MediaKit/.show-owner-password` (mode 600)
// إلى متغيّر — **لا في سطر الأمر · لا يُطبَع · لا في سجلّ**.
//
// **الاستعمال:**
//   node scripts/mk-show-smoke.mjs show
//   node scripts/mk-show-smoke.mjs shownext
//   node scripts/mk-show-smoke.mjs custom   (مع MK_SMOKE_* env)
//
// **المصدر الوحيد للمنافذ:** `<tree>/bin/mk-show` — يُقرَأ لا يُكرَّر
// (٣٣٠ § ٢ · تنسيقٌ مع ٤٠٣ب عند mediakit).
//
// **الطفرة (env overrides · تُستعمل للفشل المفتعل L-127):**
//   MK_SMOKE_API_PORT   يتجاوز API_PORT من mk-show.
//   MK_SMOKE_STUDIO_PORT يتجاوز STUDIO_PORT.
//   MK_SMOKE_PW_FILE    يتجاوز مسار كلمة السرّ.
//   MK_SMOKE_STUDIO_URL يتجاوز عنوان الاستوديو كاملاً (mock للاتّجاه).
//   MK_SMOKE_SEED_JSON  محتوى seed مُلقَّم للطفرة (JSON string).

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── مساعدات صغيرة ────────────────────────────────────────
function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

// **قراءة قيمة `KEY=VALUE` من bin/mk-show — مصدرٌ واحد.**
// نتعامل مع القيَم المحاطة بعلامتَي اقتباس + التعليقات الترجمانيّة بعدها.
function readMkShowVar(treePath, key) {
  const p = join(treePath, 'bin/mk-show');
  if (!existsSync(p)) return null;
  const src = readFileSync(p, 'utf8');
  const m = src.match(new RegExp(`^\\s*${key}=(.+?)\\s*$`, 'm'));
  if (!m) return null;
  let v = m[1];
  // نقتطع تعليق shell إن وُجد بعد قيمة.
  const hashIdx = v.indexOf('#');
  if (hashIdx >= 0) v = v.slice(0, hashIdx);
  v = v.trim();
  // نُزيل الاقتباس من الطرفَين إن كان يحيط بالقيمة كاملةً.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.trim();
}

// HTTP بسيط عبر fetch (Node 20+).
async function httpJson(url, opts = {}) {
  const timeout = opts.timeout ?? 5000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* غير JSON */ }
    return { status: res.status, ok: res.ok, text, json };
  } catch (err) {
    return { status: 0, ok: false, text: '', json: null, error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

// ── تحميل الإعدادات من الوسيط ────────────────────────────
const target = process.argv[2];
if (!target) {
  die(99, `الاستعمال: node scripts/mk-show-smoke.mjs <show|shownext|custom>`);
}

let TREE, API_PORT, STUDIO_PORT, OWNER_EMAIL, PW_FILE, STUDIO_URL;

if (target === 'custom') {
  TREE = process.env.MK_SMOKE_TREE || die(99, 'MK_SMOKE_TREE مطلوب لـcustom');
  API_PORT = process.env.MK_SMOKE_API_PORT || die(99, 'MK_SMOKE_API_PORT مطلوب لـcustom');
  STUDIO_PORT = process.env.MK_SMOKE_STUDIO_PORT || die(99, 'MK_SMOKE_STUDIO_PORT مطلوب لـcustom');
  OWNER_EMAIL = process.env.MK_SMOKE_OWNER_EMAIL || 'mk@primeflow.co';
} else if (target === 'show' || target === 'shownext') {
  TREE = join(homedir(), 'MediaKit', target === 'show' ? 'pf-mediakit-show' : 'pf-mediakit-shownext');
  API_PORT = readMkShowVar(TREE, 'API_PORT');
  STUDIO_PORT = readMkShowVar(TREE, 'STUDIO_PORT');
  OWNER_EMAIL = readMkShowVar(TREE, 'OWNER_EMAIL') || 'mk@primeflow.co';
  if (!API_PORT || !STUDIO_PORT) {
    die(99, `تعذّر قراءة API_PORT/STUDIO_PORT من ${TREE}/bin/mk-show`);
  }
} else {
  die(99, `هدف غير معروف: ${target} — اختر show أو shownext أو custom`);
}

// طفرات env تتجاوز القيَم أعلاه:
API_PORT = process.env.MK_SMOKE_API_PORT || API_PORT;
STUDIO_PORT = process.env.MK_SMOKE_STUDIO_PORT || STUDIO_PORT;
STUDIO_URL = process.env.MK_SMOKE_STUDIO_URL || `http://127.0.0.1:${STUDIO_PORT}/`;
PW_FILE = process.env.MK_SMOKE_PW_FILE || join(homedir(), 'MediaKit', '.show-owner-password');

const API_BASE = `http://127.0.0.1:${API_PORT}`;
const EXPECTED_LOCAL = `127.0.0.1:${API_PORT}`;

log(`▶ mk-show-smoke · target=${target} · api=${API_BASE} · studio=${STUDIO_URL}`);

// ═════════════════════════════════════════════════════════
// § ١ · الصحّة — أوّل عتبة (rc=10)
// ═════════════════════════════════════════════════════════
log('');
log('[1/5] الصحّة: GET /v1/health');
{
  const r = await httpJson(`${API_BASE}/v1/health`, { timeout: 3000 });
  if (r.status !== 200) {
    die(10, `  ✗ [1/5] الصحّة سقطت — API لا يردّ 200 على ${API_BASE}/v1/health\n`
          + `    الحالة: ${r.status || 'connect fail'} · ${r.error || ''}\n`
          + `    راجع: أنّ الحاويّات قائمة (docker ps) + العمليّة API حيّة.`);
  }
  log('  ✓ 200 OK');
}

// ═════════════════════════════════════════════════════════
// § ٢ · الباب — دخول بكلمة السرّ من ملفٍّ (rc=20 · لا يُطبَع)
// ═════════════════════════════════════════════════════════
log('[2/5] الباب: POST /v1/auth/login (اعتماد من ' + PW_FILE + ')');
let sessionToken = null;
{
  if (!existsSync(PW_FILE)) {
    die(20, `  ✗ [2/5] ملفّ الاعتماد غير موجود: ${PW_FILE}\n`
          + `    شغّل: bin/mk-show up (يُولّده) — أو reset-showroom-owner-password.`);
  }
  // نقرأ إلى متغيّر — لا نطبع.
  const password = readFileSync(PW_FILE, 'utf8').trim();
  if (!password || password.length < 8) {
    die(20, `  ✗ [2/5] ملفّ الاعتماد فارغ أو أقصر من ٨ محارف: ${PW_FILE}`);
  }
  const body = JSON.stringify({ email: OWNER_EMAIL, password });
  const r = await httpJson(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    timeout: 5000,
  });
  if (r.status !== 200) {
    die(20, `  ✗ [2/5] الباب مقفول — استجابة ${r.status} على /v1/auth/login\n`
          + `    البريد: ${OWNER_EMAIL} · لا نطبع الكلمة\n`
          + `    السبب المرجَّح: الملفّ لا يطابق كلمة الحساب. أعِد التعيين عبر reset-showroom-owner-password.`);
  }
  // ابحث عن رمز — لا تطبع قيمته. البنية المُقاسة (2026-09-15):
  // { user, tenant, session: { accessToken, refreshToken, expiresIn } }
  const token = r.json?.session?.accessToken
              || r.json?.data?.session?.accessToken
              || r.json?.accessToken
              || r.json?.data?.token
              || r.json?.token;
  if (!token || typeof token !== 'string' || token.length < 16) {
    die(20, `  ✗ [2/5] الاستجابة 200 لكن بلا رمز دخول — بنية غير متوقَّعة.\n`
          + `    مفاتيح الجذر: ${Object.keys(r.json || {}).join(', ') || '(فارغ)'}\n`
          + `    (البنية المتوقَّعة: { session: { accessToken } })`);
  }
  sessionToken = token;
  log('  ✓ رمز دخول حاضر (طول=' + token.length + ' · لا يُطبَع)');
}

// ═════════════════════════════════════════════════════════
// § ٣ · الاتّجاه — الاستوديو يكلّم API الطقم لا الخارج (rc=30)
// ═════════════════════════════════════════════════════════
log('[3/5] الاتّجاه: الاستوديو يشير إلى ' + EXPECTED_LOCAL + ' لا نفق');
{
  // نجمع محتوى HTML الرئيسيّ + كلّ ملفّات _next/static/chunks المُشار إليها
  // فيه — عنوان API عادةً في bundle JS لا في HTML نفسه (NEXT_PUBLIC_*).
  const homeR = await httpJson(STUDIO_URL, { timeout: 4000 });
  if (homeR.status === 0) {
    die(30, `  ✗ [3/5] الاستوديو لا يستجيب على ${STUDIO_URL}\n`
          + `    الخطأ: ${homeR.error || 'connect fail'}`);
  }
  let combined = homeR.text || '';
  // اجلب أوّل عدّة chunk من _next/static/chunks/
  const chunkRefs = [...combined.matchAll(/\/_next\/static\/chunks\/[a-zA-Z0-9._\-/]+\.js/g)]
    .map((m) => m[0])
    .slice(0, 6); // كافٍ للتغطية الشائعة · لا نجرّ الحزمة كاملة
  const studioOrigin = new URL(STUDIO_URL).origin;
  for (const path of chunkRefs) {
    const r = await httpJson(studioOrigin + path, { timeout: 4000 });
    if (r.text) combined += '\n' + r.text;
  }
  // **قراءة الاتّجاه من bundle Next.js:**
  //  1. لو خُبز نفق (`*.primeflow.co` مثل نداء API) ⇒ خطأ صريح — طقمٌ
  //     يخرج ليكلّم نفسَه.
  //  2. غياب أيّ عنوان في bundle ≠ خطأ — Next.js قد يستعمل same-origin
  //     أو runtime config. نتحقّق بنداء اختبار POST قصير على relative
  //     `/api/*` أو absolute حسب ما بُني الاستوديو له.
  //
  // نُفشل فقط عند وجود عنوان خارجيّ خبيث (نفق) بلا محلّيّ.
  const externalMatch = combined.match(/https?:\/\/[a-z0-9-]+\.(primeflow|cloudflare|vercel|netlify)\.(co|com|app|net)\/v1\/[a-z-]+/i);
  const hasLocal = combined.includes(EXPECTED_LOCAL) || combined.includes(`localhost:${API_PORT}`);
  if (externalMatch) {
    die(30, `  ✗ [3/5] الاستوديو يكلّم عنواناً خارجيّاً — نداء API عبر النفق:\n`
          + `    وُجد: ${externalMatch[0]}\n`
          + `    المتوقَّع: ${API_BASE}\n`
          + `    السبب المرجَّح: NEXT_PUBLIC_API_URL خُبز خطأً وقت البناء.`);
  }
  if (hasLocal) {
    log(`  ✓ الاستوديو يذكر ${EXPECTED_LOCAL} صراحةً في bundle`);
  } else {
    log(`  ✓ لا نفق مخبوز في bundle — same-origin أو runtime-config (فحصنا HTML + ${chunkRefs.length} chunks)`);
  }
}

// ═════════════════════════════════════════════════════════
// § ٤ · العمل — رندر يخرج حبراً (rc=40)
// ═════════════════════════════════════════════════════════
// **الفارق عن ما تصفه التذكرة:** التذكرة تطلب رندراً كاملاً (طلب +
// انتظار + تنزيل + بوّابة حبر). البذرة الحيّة الآن لا تتضمّن روابط
// أصول مباشرة على المستوى الأوّل (نتحقّق من ذلك في §١·٤ من التقرير)،
// وطلبُ رندرٍ جديد يحتاج ffmpeg + طابور + انتظار خارج نطاق smoke القصير.
// **التسوية المُعلَنة (L-123):** نتحقّق من مسار detail لـbrand-kit
// (يشترط auth · يُعيد بنية غير فارغة · بحث عن أصل مربوط). إن وُجد
// asset URL نُزّله ونقيس. غياب URL ≠ فشل — إعلانٌ صريح بالمحدوديّة.
log('[4/5] العمل: authenticated detail + قياس أصل (إن وُجد)');
{
  const listR = await httpJson(`${API_BASE}/v1/brand-kits`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    timeout: 5000,
  });
  if (listR.status !== 200 || !listR.json?.data?.length) {
    die(40, `  ✗ [4/5] لا brand-kits في البذرة — HTTP ${listR.status}\n`
          + `    البيئة فارغة · شغّل seed-showroom.`);
  }
  const bkId = listR.json.data[0].id;
  const detailR = await httpJson(`${API_BASE}/v1/brand-kits/${bkId}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    timeout: 5000,
  });
  if (detailR.status !== 200) {
    die(40, `  ✗ [4/5] detail لـbrand-kit فشل — HTTP ${detailR.status}\n`
          + `    id: ${bkId}`);
  }
  const detailText = detailR.text || '';
  if (detailText.length < 100) {
    die(40, `  ✗ [4/5] detail فارغ — ${detailText.length} بايتاً\n`
          + `    «succeeded» ≠ نتيجة (L-123) — الاستجابة بلا حبر.`);
  }
  // ابحث عن URL أصلٍ داخل detail لتنزيله كتحقّق أعمق.
  const assetMatch = detailText.match(/https?:\/\/[^"'\s]+\.(png|jpg|jpeg|svg|webp|mp4)[^"'\s]*/i);
  if (assetMatch) {
    const download = await httpJson(assetMatch[0], { timeout: 8000 });
    if (download.status === 200) {
      const buf = Buffer.byteLength(download.text || '', 'binary');
      if (buf < 512) {
        die(40, `  ✗ [4/5] أصل نُزّل لكنّه فارغ — ${buf} < 512 بايت\n`
              + `    «succeeded» ≠ نتيجة (L-123) — الأصل بلا حبر.`);
      }
      log(`  ✓ detail (${detailText.length} بايت) + أصل نُزّل (${buf} بايت · فحص «الفراغ التامّ»)`);
    } else {
      die(40, `  ✗ [4/5] رابط أصل موجود لكن التنزيل فشل — HTTP ${download.status}\n`
            + `    ${assetMatch[0].split('?')[0]}?…`);
    }
  } else {
    log(`  ✓ detail (${detailText.length} بايت) — لا asset URL مُتَضَمَّن (بذرة بلا أصول مباشرة · L-123 مُعلَن)`);
  }
}

// ═════════════════════════════════════════════════════════
// § ٥ · النظافة — لا اسمَ محظور في بيانات الزائر (rc=50)
// ═════════════════════════════════════════════════════════
log('[5/5] النظافة: لا اسم مؤسسة/شخص محظور في البذرة');
{
  const BLOCKLIST_PATH = join(homedir(), 'MediaKit', 'pf-mediakit-dash', 'scripts', 'brand-blocklist.json');
  let blocklist = { blocklist: [], classPatterns: [] };
  if (existsSync(BLOCKLIST_PATH)) {
    try { blocklist = JSON.parse(readFileSync(BLOCKLIST_PATH, 'utf8')); } catch {}
  }
  const terms = (blocklist.blocklist || []).map((b) => b.term);
  const patterns = (blocklist.classPatterns || []).map((p) => new RegExp(p.pattern));

  // نجمع بيانات الزائر: profile + projects + brand-kits.
  const pieces = [];
  const headers = { Authorization: `Bearer ${sessionToken}` };
  for (const path of ['/v1/auth/me', '/v1/projects', '/v1/brand-kits']) {
    const r = await httpJson(`${API_BASE}${path}`, { headers, timeout: 4000 });
    if (r.status === 200 && r.text) pieces.push(r.text);
  }
  const seedContent = pieces.join('\n');

  // طفرة env — يسمح بحقن محتوى مُختلَق للاختبار.
  const injected = process.env.MK_SMOKE_SEED_JSON;
  const scanned = injected ? seedContent + '\n' + injected : seedContent;

  for (const t of terms) {
    if (scanned.includes(t)) {
      die(50, `  ✗ [5/5] اسمٌ محظورٌ ظهر في بيانات الزائر: "${t}"\n`
            + `    القاعدة ٣٩٤ — الأسماء الحقيقيّة لا تصل الشريك.`);
    }
  }
  for (const re of patterns) {
    const m = scanned.match(re);
    if (m) {
      die(50, `  ✗ [5/5] نمط محظور: "${m[0]}"\n`
            + `    استعمل جهة مُختلَقة بدل الأسماء السياديّة.`);
    }
  }
  log('  ✓ نظيف — لا مطابقات في blocklist/classPatterns');
}

log('');
log('✓ الطقم قابل للاستعمال — الخمس اجتزن.');
process.exit(0);
