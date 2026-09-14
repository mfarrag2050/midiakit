#!/usr/bin/env node
/**
 * seed-showroom — بذرة بيئة العرض (Showroom).
 *
 * قاعدة حاكمة (تذكرة _AMEND-SHOWROOM-IDENTITY):
 *   • حساب واحد فقط: mk@primeflow.co (SHOWROOM_OWNER_EMAIL).
 *   • كلمة المرور: تُولَّد عشوائياً في bin/mk-show, تُمرَّر بيئةً،
 *     تُطبع مرّةً واحدة في stdout، ولا تُلتزم لأيّ ملفّ.
 *   • قائمة السماح تبدأ بهذا البريد وحده — الشريك يُضاف يدوياً لاحقاً.
 *
 * السلوك:
 *   • idempotent — إن كان الحساب موجوداً يتخطّى بلا خطأ.
 *   • signup عبر HTTP → يستعمل نفس مسار المستخدم الحقيقيّ (لا تجاوز).
 *   • brand_kit + 3 مشاريع (عمق ب: هيكل + محتوى تجريبيّ) عبر SQL مباشر
 *     بمستخدم migration_user (المتاح في migrations).
 *   • لا يستعمل بيانات عميل حقيقيّ — كلّ العناوين مُختلَقة.
 *
 * البيئة (كلّها من .env.show عبر bin/mk-show):
 *   SHOWROOM_OWNER_EMAIL       (default: mk@primeflow.co)
 *   SHOWROOM_OWNER_PASSWORD    (إن غاب → يُولَّد ويُطبع في stdout مرّةً)
 *   DATABASE_URL               (migration_user — للـSQL المباشر)
 *   PORT                       (منفذ API — للـsignup)
 */

import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

// كلمة المرور: من البيئة إن وُجدت، وإلّا مولَّدة (تُطبع مرّةً).
let ownerPassword = process.env.SHOWROOM_OWNER_PASSWORD;
let passwordWasGenerated = false;
if (!ownerPassword) {
  // 24 بايت base64url ≈ 32 حرفاً بلا =/+ — أقوى بكثير من min(12).
  ownerPassword = randomBytes(24).toString('base64url');
  passwordWasGenerated = true;
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

  // config افتراضيّ بحدّه الأدنى — العميل يعدّله من الاستوديو.
  // القيم شبيهة بـpackages/templates/src/brand-kit-defaults (إن وُجد).
  const config = {
    colors: { primary: '#0A2540', accent: '#F5A623', bg: '#FFFFFF', fg: '#111111' },
    fonts: { arabic: 'Almarai', latin: 'Inter' },
    margins: { top: 96, bottom: 96, start: 80, end: 80 },
    numerals: 'arabic',
  };

  const { rows } = await client.query(
    `INSERT INTO brand_kits (tenant_id, name, config)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [tenantId, 'هويّة العرض الافتراضيّة', JSON.stringify(config)],
  );
  return rows[0].id;
}

async function pickDefaultTemplate(client) {
  const { rows } = await client.query(
    `SELECT id FROM templates WHERE scope = 'global' ORDER BY name LIMIT 1`,
  );
  if (!rows[0]) throw new Error('لا قوالب عامّة — تأكّد أنّ migrations اكتملت.');
  return rows[0].id;
}

async function ensureSampleProjects(client, tenantId, brandKitId, templateId, userId) {
  const { rows: existing } = await client.query(
    'SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  if (existing[0]) return 0;

  // ثلاثة مشاريع عيّنة — كلّ اسم/جهة/مصدر مُختلَق بالكامل.
  // قاعدة (_AMEND-SHOWROOM-PORTS §4): لا اسم مؤسّسة حقيقيّة، ولا مادّة
  // تحريريّة لا نملك حقّ عرضها. الأسماء أدناه لا وجود لها في الواقع.
  const projects = [
    {
      name: 'حملة الافتتاح — بطاقة إعلان',
      content: {
        title: 'انطلاق برنامج «صباحيّات المدينة» — مواعيد يوميّة',
        source: 'الوكالة',
        tokens: [{ text: 'صباحيّات', bold: true }, { text: 'المدينة' }],
      },
    },
    {
      name: 'تقرير موجز — خبر عاجل',
      content: {
        title: 'هيئة المدينة للخدمات تُعلن نتائج مسحٍ سنويّ',
        source: 'هيئة المدينة',
        tokens: [{ text: 'نتائج' }, { text: 'المسح', accent: true }],
      },
    },
    {
      name: 'برومو حلقة — بطاقة مربّعة',
      content: {
        title: 'حلقة الليلة: حوار في شؤون المدينة',
        source: 'مراسلنا',
        tokens: [{ text: 'حوار' }, { text: 'المدينة', bold: true }],
      },
    },
  ];

  for (const p of projects) {
    await client.query(
      `INSERT INTO projects
         (tenant_id, brand_kit_id, template_id, name, content, created_by, state, locale)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', 'ar')`,
      [tenantId, brandKitId, templateId, p.name, JSON.stringify(p.content), userId],
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
    console.log(`[seed] ⏭  الحساب موجود مسبقاً. tenant=${tenantId.slice(0, 8)}…`);
  }
  await plane.end();

  // migration_user + SET app.tenant_id → يمرّ عبر tenant_isolation policy.
  const mig = new pg.Client({ connectionString: DB_URL_MIGRATION });
  await mig.connect();
  await mig.query(`SET app.tenant_id = '${tenantId}'`);

  const brandKitId = await ensureBrandKit(mig, tenantId);
  console.log(`[seed] brand_kit=${brandKitId.slice(0, 8)}…`);

  const templateId = await pickDefaultTemplate(mig);
  const added = await ensureSampleProjects(mig, tenantId, brandKitId, templateId, userId);
  if (added > 0) console.log(`[seed] ✓ أضفتُ ${added} مشاريع تجريبيّة.`);
  else console.log(`[seed] ⏭  مشاريع تجريبيّة موجودة مسبقاً.`);

  await mig.end();

  if (passwordWasGenerated && result.created) {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  ⚠  كلمة مرور المالك (تُطبع مرّةً واحدة — انسخها الآن):');
    console.log('');
    console.log(`     البريد: ${OWNER_EMAIL}`);
    console.log(`     الكلمة: ${ownerPassword}`);
    console.log('');
    console.log('  انسخها إلى مدير كلمات، ثمّ غيّرها من الاستوديو.');
    console.log('  لن تُطبع مرّةً أخرى — الكلمة ليست في أيّ ملفّ.');
    console.log('════════════════════════════════════════════════════════════');
  }

  console.log('[seed] ✓ اكتمل.');
}

main().catch((err) => {
  console.error(`✗ seed فشل: ${err.message}`);
  process.exit(1);
});
