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
import pg from 'pg';

const API_PORT = Number(process.env.PORT || 19060);
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const OWNER_EMAIL = process.env.SHOWROOM_OWNER_EMAIL || 'mk@primeflow.co';
const DB_URL = process.env.DATABASE_URL;
const TENANT_NAME = 'وكالة العرض التجريبيّة';

if (!DB_URL) {
  console.error('✗ DATABASE_URL غير معرَّف. شغّل عبر bin/mk-show.');
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

async function trySignup() {
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

  if (res.status === 201) {
    const body = await res.json();
    return { created: true, tenantId: body.tenant.id, userId: body.user.id };
  }

  // 409 (email taken) → البذرة موجودة → نستعلم عن tenant_id من DB
  if (res.status === 409) {
    return { created: false };
  }

  const text = await res.text().catch(() => '');
  throw new Error(`signup فشل (status ${res.status}): ${text}`);
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
    `INSERT INTO brand_kits (tenant_id, name, config, assets_version)
     VALUES ($1, $2, $3::jsonb, 1)
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

  // ثلاثة مشاريع عيّنة — عناوين مُختلَقة، بلا اسم مؤسّسة حقيقيّة.
  const projects = [
    {
      name: 'حملة الافتتاح — بطاقة إعلان',
      content: {
        title: 'انطلاق برنامج «الصباح الجديد» — مواعيد يوميّة',
        source: 'الوكالة',
        tokens: [{ text: 'الصباح', bold: true }, { text: 'الجديد' }],
      },
    },
    {
      name: 'تقرير موجز — خبر عاجل',
      content: {
        title: 'وزارة الصحّة تُعلن نتائج المسح الوطنيّ',
        source: 'مصدر طبي',
        tokens: [{ text: 'نتائج' }, { text: 'المسح', accent: true }],
      },
    },
    {
      name: 'برومو حلقة — بطاقة مربّعة',
      content: {
        title: 'حلقة الليلة: حوار مع الخبراء',
        source: 'مراسلنا',
        tokens: [{ text: 'حوار' }, { text: 'الخبراء', bold: true }],
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

  console.log(`[seed] أطلب signup للحساب ${OWNER_EMAIL} …`);
  const signup = await trySignup();

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  let tenantId, userId;
  if (signup.created) {
    tenantId = signup.tenantId;
    userId = signup.userId;
    console.log(`[seed] ✓ الحساب أُنشئ. tenant=${tenantId.slice(0, 8)}… user=${userId.slice(0, 8)}…`);
  } else {
    const existing = await lookupExistingOwner(client);
    if (!existing) {
      await client.end();
      throw new Error(
        `signup أعاد 409 لكن users لا يحتوي ${OWNER_EMAIL} — تناقض. تحقّق يدوياً.`,
      );
    }
    tenantId = existing.tenant_id;
    userId = existing.user_id;
    console.log(`[seed] ⏭  الحساب موجود مسبقاً. tenant=${tenantId.slice(0, 8)}…`);
  }

  // RLS على brand_kits/projects يتطلّب app.tenant_id — نضبطه ثمّ ندرج.
  // migration_user لا يبيسه RLS في القراءة العامّة، لكنّ سياسات
  // TENANT_POLICY تفحص current_setting — لذا نضبط.
  await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);

  const brandKitId = await ensureBrandKit(client, tenantId);
  console.log(`[seed] brand_kit=${brandKitId.slice(0, 8)}…`);

  const templateId = await pickDefaultTemplate(client);
  const added = await ensureSampleProjects(client, tenantId, brandKitId, templateId, userId);
  if (added > 0) console.log(`[seed] ✓ أضفتُ ${added} مشاريع تجريبيّة.`);
  else console.log(`[seed] ⏭  مشاريع تجريبيّة موجودة مسبقاً.`);

  await client.end();

  if (passwordWasGenerated && signup.created) {
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
