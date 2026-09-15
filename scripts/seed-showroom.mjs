#!/usr/bin/env node
/**
 * seed-showroom — بذرة بيئة العرض (Showroom).
 *
 * قاعدة حاكمة (تذكرة 402ب §٢ · خيار أ — كلمة المرور تعيش في ملفّ):
 *   • حساب واحد: mk@primeflow.co (SHOWROOM_OWNER_EMAIL).
 *   • مصدرُ الكلمة الوحيد: ~/MediaKit/.show-owner-password (600).
 *     يُقرَأ إن وُجد · يُولَّد ويُكتَب فيه إن غاب.
 *   • **التخطّي الصامتُ ممنوع:** حسابٌ موجودٌ وكلمةٌ لا تطابق ⇒
 *     خروجٌ بحالةٍ ≠ 0 مع تعليماتٍ لتشغيل reset-showroom-owner-password.
 *   • قائمة السماح تبدأ بهذا البريد وحده — الشريك يُضاف يدوياً لاحقاً.
 *
 * السلوك:
 *   • idempotent — إن وُجد الحساب وطابقت الكلمة ⇒ تخطّي آمن (بعد فحص login).
 *   • signup عبر HTTP → نفس مسار المستخدم الحقيقيّ (لا تجاوز).
 *   • verify عبر POST /v1/auth/login → دليل التطابق قبل تخطّي.
 *   • brand_kit + مشاريع عيّنة عبر SQL بمستخدم migration_user (RLS ملتزَم).
 *
 * البيئة (من .env.show عبر bin/mk-show):
 *   SHOWROOM_OWNER_EMAIL       (default: mk@primeflow.co)
 *   DATABASE_URL_PLATFORM      (control_plane_user — للبحث cross-tenant)
 *   DATABASE_URL               (migration_user — للـSQL المباشر)
 *   PORT                       (منفذ API — للـsignup + login-verify)
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
// _AMEND-390d §٣: البذرة لا تؤلّف هويّةً من رأسها. تبدأ من الافتراض
// الذي يستعمله المنتج (DEFAULT_BRAND · شكل BrandKit كامل)، ثمّ تُبدّل
// منه ما يحتاجه العرض (ألوان مَرافئ وشعارها من MARAFI_BRAND).
// tsx loader يعالج .ts imports من .mjs — pattern مُثبَت في 5 scripts أخرى.
import { DEFAULT_BRAND, MARAFI_BRAND } from '@pf-mediakit/shared';

// pg تُحلّ من apps/api/node_modules — السكربت في scripts/ لا يملك pg.
// createRequire من مسار apps/api/package.json → يفتح شجرة node_modules الصحيحة.
const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromApi = createRequire(resolve(__dirname, '../apps/api/package.json'));
const pg = requireFromApi('pg');

const API_PORT = Number(process.env.PORT || 19070);
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const OWNER_EMAIL = process.env.SHOWROOM_OWNER_EMAIL || 'mk@primeflow.co';
// اتصالان:
//   • control_plane_user (SELECT فقط cross-tenant) — لاستعلام users قبل معرفة tenant_id.
//   • migration_user (DML كامل + RLS ملتزَم) — لإدراج brand_kit + projects بعد SET app.tenant_id.
const DB_URL_PLATFORM = process.env.DATABASE_URL_PLATFORM;
const DB_URL_MIGRATION = process.env.DATABASE_URL;
const TENANT_NAME = 'وكالة العرض التجريبيّة';

if (!DB_URL_PLATFORM || !DB_URL_MIGRATION) {
  console.error('✗ DATABASE_URL_PLATFORM أو DATABASE_URL غير معرَّف. شغّل عبر bin/mk-show.');
  process.exit(1);
}

// كلمة المرور: من ملفّ ~/MediaKit/.show-owner-password (600).
// إن غاب: تُولَّد وتُكتَب. (402ب §٢ · خيار أ)
const PW_FILE = join(homedir(), 'MediaKit', '.show-owner-password');
let ownerPassword;
let passwordWasGenerated = false;
if (existsSync(PW_FILE)) {
  const mode = (statSync(PW_FILE).mode & 0o777).toString(8);
  if (mode !== '600') {
    console.error(`✗ ${PW_FILE} صلاحيّاته ${mode} (المتوقَّع 600). أصلح بـchmod 600 ثمّ أعِد.`);
    process.exit(1);
  }
  ownerPassword = readFileSync(PW_FILE, 'utf-8').replace(/\r?\n$/, '');
  if (ownerPassword.length < 24) {
    console.error(`✗ طولُ الكلمة في ${PW_FILE} = ${ownerPassword.length} (المتوقَّع ≥24).`);
    process.exit(1);
  }
} else {
  ownerPassword = randomBytes(24).toString('base64url');
  writeFileSync(PW_FILE, ownerPassword, { mode: 0o600 });
  passwordWasGenerated = true;
  console.log(`[seed] كلمةُ المالك مولَّدةٌ ومحفوظةٌ في ${PW_FILE} (600). لا تُطبع.`);
}

// ═══════════════════════════════════════════════════════════════════════════
async function waitForApi() {
  const url = `${API_BASE}/v1/health`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`API لم يستجب على ${url} خلال 60 ثانية`);
}

async function signupIfNew(plane) {
  // نتحقّق أوّلاً من users بـcontrol_plane_user — نُغني عن الاعتماد
  // على 409 من signup (الذي رأيتُه يُعيد 201 وهميّ مع IDs غير مُلتزَمة
  // في حالة duplicate email، سلوك مكتشَف في mkapi's route).
  const existing = await lookupExistingOwner(plane);
  if (existing) return { created: false, ...existing };

  const res = await fetch(`${API_BASE}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: ownerPassword,
      tenantName: TENANT_NAME,
      locale: 'ar',
    }),
  });

  if (res.status !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`signup فشل (status ${res.status}): ${text}`);
  }

  // نُثبت الالتزام بقراءة DB — استجابة signup ليست معياراً كافياً.
  const created = await lookupExistingOwner(plane);
  if (!created) {
    throw new Error(
      `signup أعاد 201 لكنّ users لا يحتوي ${OWNER_EMAIL} — الالتزام فشل صامتاً في mkapi.`,
    );
  }
  return { created: true, ...created };
}

async function lookupExistingOwner(client) {
  const { rows } = await client.query(
    'SELECT id AS user_id, tenant_id FROM users WHERE email = $1 LIMIT 1',
    [OWNER_EMAIL],
  );
  return rows[0] || null;
}

async function ensureBrandKit(client, tenantId) {
  const existing = await client.query(
    'SELECT id FROM brand_kits WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  // _AMEND-390d §٣ · التركيب: DEFAULT_BRAND (شكل كامل) ⇐ overlay مَرافئ.
  // spread أوّلاً DEFAULT ثمّ MARAFI ⇒ أيّ مفتاح جديد في DEFAULT مستقبلاً
  // يبقى في البذرة تلقائيّاً · وأيّ مفتاح تُخصّصه مَرافئ يتغلّب.
  // ألوان + fonts + logo دمج مفتاح-بمفتاح · بقيّة الحقول (typography ·
  // direction · locale · capabilities …) تأتي كاملة من MARAFI ثمّ DEFAULT.
  const config = {
    ...DEFAULT_BRAND,
    ...MARAFI_BRAND,
    colors: { ...DEFAULT_BRAND.colors, ...MARAFI_BRAND.colors },
    fonts: { ...DEFAULT_BRAND.fonts, ...MARAFI_BRAND.fonts },
    logo: { ...DEFAULT_BRAND.logo, ...MARAFI_BRAND.logo },
  };

  const { rows } = await client.query(
    `INSERT INTO brand_kits (tenant_id, name, config)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [tenantId, 'هويّة العرض الافتراضيّة', JSON.stringify(config)],
  );
  return rows[0].id;
}

// _AMEND-390 §أ · اقرأ ملفّ القالب واستخرج fields[].key حرفيّاً — لا تخمين.
// المفاتيح التي يعرفها القالب هي مصدر الحقيقة الوحيد. الاستوديو يقرأها
// عبر extractFields · العامل/renderFrame يقرأها عبر layer.field. البذرة
// **يجب** أن تكتب بنفسها لا بمفاتيح مؤلّفة.
function readTemplateFields(sourceRef) {
  const rel = sourceRef.replace('@pf-mediakit/templates/', 'packages/templates/src/templates/');
  const full = resolve(__dirname, '..', rel);
  const tpl = JSON.parse(readFileSync(full, 'utf-8'));
  return (tpl.fields ?? []).map((f) => f.key);
}

async function pickTemplateBySourceRef(client, sourceRef) {
  const { rows } = await client.query(
    `SELECT id FROM templates WHERE scope = 'global' AND source_ref = $1 LIMIT 1`,
    [sourceRef],
  );
  if (!rows[0]) throw new Error(`لا قالب scope=global لـ${sourceRef} — migrations أو seed_templates ناقص.`);
  return rows[0].id;
}

async function ensureSampleProjects(client, tenantId, brandKitId, userId) {
  const { rows: existing } = await client.query(
    'SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  if (existing[0]) return 0;

  // ثلاثة مشاريع عيّنة — كلّ اسم/جهة/مصدر مُختلَق بالكامل.
  // قاعدة (_AMEND-SHOWROOM-PORTS §4): لا اسم مؤسّسة حقيقيّة، ولا مادّة
  // تحريريّة لا نملك حقّ عرضها. الأسماء أدناه لا وجود لها في الواقع.
  //
  // _AMEND-390 §أ · pool = مفاتيح احتماليّة. content النهائيّ يُرشَّح إلى
  // ما يصرّح به القالب فقط (readTemplateFields). كل مشروع يحمل template_ref
  // خاصّاً به · نصّه يُعبّأ في المفاتيح المُصرّح بها فقط.
  const projects = [
    {
      name: 'حملة الافتتاح — بطاقة إعلان',
      template_ref: '@pf-mediakit/templates/card-bottom.json',
      pool: {
        headline: 'انطلاق برنامج «صباحيّات المدينة» — مواعيد يوميّة',
        source: 'الوكالة',
        sourceHandle: '@morning_show',
        sourceName: 'وكالة العرض',
      },
    },
    {
      name: 'تقرير موجز — خبر عاجل',
      template_ref: '@pf-mediakit/templates/breaking.json',
      pool: {
        headline: 'هيئة المدينة للخدمات تُعلن نتائج مسحٍ سنويّ',
        source: 'هيئة المدينة',
        sourceHandle: '@city_agency',
        sourceName: 'وكالة المدينة',
      },
    },
    {
      name: 'برومو حلقة — بطاقة مربّعة',
      template_ref: '@pf-mediakit/templates/card-centered.json',
      pool: {
        headline: 'حلقة الليلة: حوار في شؤون المدينة',
        source: 'مراسلنا',
        sourceHandle: '@episode',
        sourceName: 'استوديو العرض',
      },
    },
    {
      name: 'ملاحظة تحريريّة — بطاقة بسيطة',
      template_ref: '@pf-mediakit/templates/plain.json',
      pool: {
        headline: 'قراءة موجزة في مصطلحات التغطية الميدانيّة',
      },
    },
  ];

  for (const p of projects) {
    const templateId = await pickTemplateBySourceRef(client, p.template_ref);
    const declaredKeys = readTemplateFields(p.template_ref);
    const content = Object.fromEntries(
      declaredKeys.filter((k) => k in p.pool).map((k) => [k, p.pool[k]]),
    );
    await client.query(
      `INSERT INTO projects
         (tenant_id, brand_kit_id, template_id, name, content, created_by, state, locale)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', 'ar')`,
      [tenantId, brandKitId, templateId, p.name, JSON.stringify(content), userId],
    );
  }
  return projects.length;
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`[seed] أنتظر API على ${API_BASE} …`);
  await waitForApi();

  const plane = new pg.Client({ connectionString: DB_URL_PLATFORM });
  await plane.connect();

  console.log(`[seed] أفحص وجود الحساب ${OWNER_EMAIL} …`);
  const result = await signupIfNew(plane);
  const tenantId = result.tenant_id;
  const userId = result.user_id;

  if (result.created) {
    console.log(`[seed] ✓ الحساب أُنشئ. tenant=${tenantId.slice(0, 8)}… user=${userId.slice(0, 8)}…`);
  } else {
    // 402ب §٢: لا تخطّي صامت. تحقّق أنّ كلمةَ الملفّ تطابق ما في DB
    // عبر مسار الدخول الفعليّ — أعلى برهانِ تطابقٍ ممكن.
    const verifyRes = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: ownerPassword }),
    });
    if (verifyRes.status === 200) {
      console.log(`[seed] ⏭  الحساب موجود · الكلمة في ${PW_FILE} تطابق (login=200). تخطّي آمن. tenant=${tenantId.slice(0, 8)}…`);
    } else {
      console.error(`
✗ الحسابُ ${OWNER_EMAIL} موجودٌ في القاعدة، لكنّ الكلمة في ${PW_FILE} لا تطابق:
   POST /v1/auth/login رجع ${verifyRes.status} (المتوقَّع 200).
   ${passwordWasGenerated
     ? 'الكلمةُ وُلِّدت الآن وحُفظت — لكنّ القاعدة تحمل تجزئةً أقدم. لا يمكنني ضمانُ الدخول.'
     : 'الملفُّ كان موجوداً — كلمتُه لا تطابق. ربّما غُيّرت من الاستوديو ولم تُحدَّث الملفُّ.'}
   الإصلاح:
     cd /Users/mdervis/MediaKit/pf-mediakit
     node --import tsx scripts/reset-showroom-owner-password.mjs
   (يعيد ضبطَ كلمة القاعدة إلى ما في ${PW_FILE}.)
`);
      await plane.end();
      process.exit(2);
    }
  }
  await plane.end();

  // migration_user + SET app.tenant_id → يمرّ عبر tenant_isolation policy.
  const mig = new pg.Client({ connectionString: DB_URL_MIGRATION });
  await mig.connect();
  await mig.query(`SET app.tenant_id = '${tenantId}'`);

  const brandKitId = await ensureBrandKit(mig, tenantId);
  console.log(`[seed] brand_kit=${brandKitId.slice(0, 8)}…`);

  // _AMEND-390 §أ · لكل مشروع template_ref خاصّ · لا template افتراضيّ موحّد.
  const added = await ensureSampleProjects(mig, tenantId, brandKitId, userId);
  if (added > 0) console.log(`[seed] ✓ أضفتُ ${added} مشاريع تجريبيّة.`);
  else console.log(`[seed] ⏭  مشاريع تجريبيّة موجودة مسبقاً.`);

  await mig.end();

  // 402ب §٢: لا طباعةَ للكلمة — الملفُّ ${PW_FILE} هو مصدرُ الحقيقة.
  console.log('[seed] ✓ اكتمل.');
}

main().catch((err) => {
  console.error(`✗ seed فشل: ${err.message}`);
  process.exit(1);
});
