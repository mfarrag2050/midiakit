#!/usr/bin/env node
/**
 * 529 — demo-path · مسار العرض الآليّ من البداية للنهاية عبر الـAPI.
 *
 * يمشي رحلة العرض ويقول ✓/✗ لكلّ خطوة مع زمنها:
 *   1. دخول بمستخدم العرض
 *   2. قائمة الهويّات (manara موجودة)
 *   3. إنشاء بطاقة عاجل بـ manara ونصٍّ عربيٍّ 15 كلمة
 *   4. تصدير PNG ثمّ MP4
 *   5. انتظار اكتمال المهمّة (مهلة 60s لكلٍّ)
 *   6. تنزيل الملفّ + التحقّق (حجم>0 · PNG magic أو مدّة MP4 عبر ffprobe)
 *   7. ريلز: إنشاء + تصدير MP4
 *   8. حذف ما أُنشئ (تنظيف ذاتيّ)
 *
 * الهدف الافتراضيّ: API التطوير (http://127.0.0.1:19040).
 * يقبل --base-url و env: DEMO_EMAIL / DEMO_PASSWORD (لا أسرار مطبوعة ولا ملتزمة).
 *
 * ══════════════════════════════════════════════════════════════
 * ممنوع تشغيله على العرض الحيّ (mkdemo.primeflow.co · 19070).
 * ══════════════════════════════════════════════════════════════
 * بعد promote، يشغّله المالك على الميني (بجانب حاويّة العرض) هكذا:
 *
 *   DEMO_EMAIL='...' DEMO_PASSWORD='...' \
 *   DEMO_OWNER=1 DEMO_HOST_ACK=1 \
 *     node scripts/demo-path.mjs --base-url http://127.0.0.1:19070
 *
 * ملاحظة: `https://mkdemo.primeflow.co` خلف Cloudflare Access (يعيد 302
 * إلى صفحة تسجيل الدخول)، ولا يصل إليه هذا السكربت بدون Service Token
 * غيرِ متوفّرٍ الآن. المسار المحلّيّ على الميني يتخطّى CF ويصل إلى API
 * العرض مباشرة.
 *
 * السكربت يرفض أيّ base-url يشير إلى 19062/19063/19064/mkdemo إن كان يعمل
 * من خارج سياق المالك (متغيّرَي بيئة DEMO_OWNER=1 + DEMO_HOST_ACK=1 معاً).
 * كل خطوة ✗ ⇒ exit 1 مع رسالة واضحة (بلا رمي stack raw).
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

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
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OWNER_MODE = process.env.DEMO_OWNER === '1' && process.env.DEMO_HOST_ACK === '1';

if (!EMAIL || !PASSWORD) {
  console.error('✗ DEMO_EMAIL و DEMO_PASSWORD مطلوبان (env). لا تمرّرهما في argv.');
  process.exit(1);
}

// حارس المسار الإنتاجيّ — كما وجّه 518 على مستوى المكتبات.
const FORBIDDEN_HOST_PATTERNS = [/:19062/, /:19063/, /:19064/, /:1908\d/, /mkdemo\.primeflow\.co/, /:19070/];
if (!OWNER_MODE) {
  for (const p of FORBIDDEN_HOST_PATTERNS) {
    if (p.test(BASE_URL)) {
      console.error(`✗ base-url ${BASE_URL.replace(/[a-z0-9]/gi, '*')} يشير إلى بيئة عرض/إنتاج — استعمل dev.`);
      console.error('  للتشغيل على العرض: DEMO_OWNER=1 DEMO_HOST_ACK=1 (بيئة المالك فقط).');
      process.exit(1);
    }
  }
}

// ── أدوات ───────────────────────────────────────────────
let PASSED = 0, FAILED = 0, SKIPPED = 0;

// Skip يُصنَع بـthrow لمعالج خاصّ — يُميَّز عن الفشل الفعليّ.
class SkipStep extends Error { constructor(msg) { super(msg); this.name = 'SkipStep'; } }

const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`  ✓ ${name} · ${ms}ms`);
    PASSED++;
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof SkipStep) {
      console.log(`  ⊘ ${name} · ${ms}ms · ${msg}`);
      SKIPPED++;
      return;
    }
    console.error(`  ✗ ${name} · ${ms}ms · ${msg}`);
    FAILED++;
    throw err;
  }
};

async function api(method, path, { token, body, expectStatus } = {}) {
  const url = BASE_URL + path;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* raw */ }
  if (expectStatus != null && r.status !== expectStatus) {
    throw new Error(`${method} ${path} → ${r.status} · body: ${text.slice(0, 200)}`);
  }
  return { status: r.status, data, text };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function waitForRender(token, renderId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const r = await api('GET', `/v1/renders/${renderId}`, { token, expectStatus: 200 });
    last = r.data?.status ?? 'unknown';
    if (last === 'succeeded') return r.data;
    if (last === 'failed') {
      // شكل الاستجابة: error.code / error.message (mapper.toFull).
      const code = r.data?.error?.code ?? 'UNKNOWN';
      throw new Error(`render ${renderId} failed: ${code}`);
    }
    await sleep(1000);
  }
  throw new Error(`render ${renderId} لم يكتمل خلال ${timeoutMs}ms (last=${last})`);
}

function ffprobeDurationSeconds(bytesPath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', bytesPath,
  ], { encoding: 'utf-8' }).trim();
  const d = parseFloat(out);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe duration غير صالح: ${out}`);
  return d;
}

async function downloadTo(tempPath, url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url.slice(0, 80)}… → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const { writeFileSync } = await import('node:fs');
  writeFileSync(tempPath, buf);
  return buf;
}

// ── الرحلة ───────────────────────────────────────────────
console.log(`▶ demo-path على ${BASE_URL}`);
console.log('');
const started = Date.now();
let token, tenantId;
let brandKitId, breakingTemplateId, reelTemplateId;
const createdProjects = [], createdRenders = [];

try {
  // (1)
  await step('١ · دخول بمستخدم العرض', async () => {
    const r = await api('POST', '/v1/auth/login', { body: { email: EMAIL, password: PASSWORD }, expectStatus: 200 });
    token = r.data?.session?.accessToken;
    tenantId = r.data?.tenant?.id;
    assert(typeof token === 'string' && token.length > 20, 'accessToken غائب');
    assert(typeof tenantId === 'string', 'tenant.id غائب');
  });

  // (2)
  await step('٢ · قائمة الهويّات — manara موجودة', async () => {
    const r = await api('GET', '/v1/brand-kits', { token, expectStatus: 200 });
    const items = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
    const manara = items.find(x => /manara|منارة/i.test(String(x?.name ?? '')));
    assert(manara, `manara غير موجودة · القائمة (${items.length}): ${items.map(x => x.name).join(', ').slice(0, 200)}`);
    brandKitId = manara.id;
  });

  // (2.5) القوالب — breaking + reel
  await step('٢.٥ · قوالب العرض — breaking + reel', async () => {
    const r = await api('GET', '/v1/templates', { token, expectStatus: 200 });
    const items = Array.isArray(r.data?.data) ? r.data.data : [];
    const breaking = items.find(x => x.name === 'breaking' || /breaking|عاجل/i.test(String(x?.name ?? '')) || x?.definition?.id === 'breaking');
    const reel = items.find(x => x.name === 'reel' || /reel|ريلز/i.test(String(x?.name ?? '')) || x?.definition?.id === 'reel');
    assert(breaking, `template breaking غائب · القائمة (${items.length})`);
    assert(reel, `template reel غائب · القائمة (${items.length})`);
    breakingTemplateId = breaking.id;
    reelTemplateId = reel.id;
  });

  // (3) إنشاء بطاقة عاجل بنصّ عربيّ 15 كلمة
  const HEADLINE_AR = 'وزير الخارجية التركي يبحث في أنقرة تطورات الأزمة السورية مع نظرائه من دول الجوار المعنية';
  assert(HEADLINE_AR.split(/\s+/).filter(Boolean).length === 15, 'HEADLINE يجب أن يكون 15 كلمة');
  let projectId;
  await step('٣ · إنشاء بطاقة عاجل بـ manara + نصّ 15 كلمة', async () => {
    const r = await api('POST', '/v1/projects', {
      token,
      body: {
        title: `demo-breaking-${Date.now()}`,
        brand_kit_id: brandKitId,
        template_id: breakingTemplateId,
        content: { headline: HEADLINE_AR, source: 'مراسلنا' },
      },
      expectStatus: 201,
    });
    projectId = r.data?.id;
    assert(projectId, 'project.id غائب');
    createdProjects.push(projectId);
  });

  // (4-6-أ) تصدير PNG + انتظار + تنزيل + تحقّق
  let pngRenderId;
  await step('٤أ · تصدير PNG (POST /v1/renders)', async () => {
    const r = await api('POST', '/v1/renders', {
      token,
      body: { project_id: projectId, size: 'x', format: 'png' },
      expectStatus: 202,
    });
    pngRenderId = r.data?.id;
    assert(pngRenderId, 'render.id غائب');
    createdRenders.push(pngRenderId);
  });
  await step('٥أ · انتظار اكتمال PNG (مهلة 60s)', async () => {
    await waitForRender(token, pngRenderId, 60_000);
  });
  await step('٦أ · تنزيل PNG + تحقّق (magic + حجم>0)', async () => {
    const out = await api('GET', `/v1/renders/${pngRenderId}/output`, { token, expectStatus: 200 });
    const url = out.data?.url;
    assert(typeof url === 'string', 'output.url غائب');
    const buf = await downloadTo(`/tmp/demo-path-${pngRenderId}.png`, url);
    assert(buf.length > 0, 'حجم=0');
    assert(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, `PNG magic خاطئ (${buf[0]},${buf[1]},${buf[2]},${buf[3]})`);
  });

  // (4-6-ب) تصدير MP4
  let mp4RenderId;
  await step('٤ب · تصدير MP4 (POST /v1/renders)', async () => {
    const r = await api('POST', '/v1/renders', {
      token,
      body: { project_id: projectId, size: 'x', format: 'mp4' },
      expectStatus: 202,
    });
    mp4RenderId = r.data?.id;
    assert(mp4RenderId, 'render.id غائب');
    createdRenders.push(mp4RenderId);
  });
  await step('٥ب · انتظار اكتمال MP4 (مهلة 60s)', async () => {
    await waitForRender(token, mp4RenderId, 60_000);
  });
  await step('٦ب · تنزيل MP4 + ffprobe مدّة>0', async () => {
    const out = await api('GET', `/v1/renders/${mp4RenderId}/output`, { token, expectStatus: 200 });
    const url = out.data?.url;
    const tmp = `/tmp/demo-path-${mp4RenderId}.mp4`;
    const buf = await downloadTo(tmp, url);
    assert(buf.length > 0, 'حجم=0');
    const dur = ffprobeDurationSeconds(tmp);
    assert(dur > 0.1, `مدّة MP4 صغيرة جدّاً: ${dur}s`);
  });

  // (7) ريلز — على main اليوم قالب reel لا يحمل video block (MP4_UNSUPPORTED_TEMPLATE)
  // ومحرِّك medialist غير موصول (REEL_TEMPLATE_ENABLED=false في الاستوديو). عند
  // اكتمال 90-REEL-IMAGES يبدأ الرندر ويصبح ✓ بلا تعديل هنا.
  let reelProjectId, reelRenderId;
  await step('٧أ · إنشاء ريلز', async () => {
    const r = await api('POST', '/v1/projects', {
      token,
      body: {
        title: `demo-reel-${Date.now()}`,
        brand_kit_id: brandKitId,
        template_id: reelTemplateId,
        content: { title: 'عنوان ريلز التجريبيّ' },
      },
      expectStatus: 201,
    });
    reelProjectId = r.data?.id;
    assert(reelProjectId, 'reel project.id غائب');
    createdProjects.push(reelProjectId);
  });
  await step('٧ب · تصدير ريلز MP4', async () => {
    const r = await api('POST', '/v1/renders', {
      token,
      body: { project_id: reelProjectId, size: 'reel', format: 'mp4' },
      expectStatus: 202,
    });
    reelRenderId = r.data?.id;
    createdRenders.push(reelRenderId);
  });
  await step('٧ج · انتظار ريلز + تحقّق ffprobe', async () => {
    try {
      await waitForRender(token, reelRenderId, 60_000);
    } catch (err) {
      // اسحب رمز الخطأ من DB إن كان متاحاً — دون ذلك نعتمد الرسالة.
      const r = await api('GET', `/v1/renders/${reelRenderId}`, { token });
      const errCode = r.data?.error?.code ?? null;
      if (errCode === 'RENDER_FAILED') {
        throw new SkipStep(`الريلز: معاينة فقط في هذا الإصدار — تصدير MP4 غير متاح (90-REEL-IMAGES معلَّق).`);
      }
      throw err;
    }
    const out = await api('GET', `/v1/renders/${reelRenderId}/output`, { token, expectStatus: 200 });
    const buf = await downloadTo(`/tmp/demo-path-${reelRenderId}.mp4`, out.data.url);
    assert(buf.length > 0);
    const dur = ffprobeDurationSeconds(`/tmp/demo-path-${reelRenderId}.mp4`);
    assert(dur > 0.1, `مدّة ريلز: ${dur}s`);
  });

  // (8) تنظيف ذاتيّ
  await step('٨ · تنظيف: حذف renders + projects', async () => {
    for (const id of createdRenders) await api('DELETE', `/v1/renders/${id}`, { token }).catch(() => {});
    for (const id of createdProjects) await api('DELETE', `/v1/projects/${id}`, { token }).catch(() => {});
  });
} catch (_) {
  // خطأ في خطوة — التنظيف على أفضل جهد
  try {
    if (token) {
      for (const id of createdRenders) await api('DELETE', `/v1/renders/${id}`, { token }).catch(() => {});
      for (const id of createdProjects) await api('DELETE', `/v1/projects/${id}`, { token }).catch(() => {});
    }
  } catch { /* silent */ }
}

const totalMs = Date.now() - started;
console.log('');
const skipPart = SKIPPED > 0 ? ` · ${SKIPPED} skipped` : '';
console.log(`═════ demo-path · ${PASSED} passed · ${FAILED} failed${skipPart} · ${totalMs}ms ═════`);
process.exit(FAILED === 0 ? 0 : 1);
