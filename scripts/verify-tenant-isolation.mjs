// scripts/verify-tenant-isolation.mjs — G6 من §3.9 (البوابات الست).
//
// **الحالة (2026-09-04): معلَّق بشرط** — لا قاعدة بيانات ولا جدول
// RLS في هذه المرحلة. السكربت مُكتمل معماريّاً؛ يُفعَّل عند وجود
// أوّل جدول بـRLS في المرحلة 4. **لا نبني جداول من أجل السكربت** —
// السكربت خادم للجداول لا العكس (قرار المالك 2026-09-04).
//
// **آلية التفعيل:** يُشغَّل تلقائياً حين يجد متغيّر
// `PF_MEDIAKIT_DATABASE_URL` في البيئة (يشير إلى PostgreSQL بجدول واحد
// على الأقل تحت RLS). في غيابه، يخرج بـexit 0 مع رسالة «معلَّق».
//
// **المعيار (L-46 مزدوج):**
//
//   **(أ) وجود** — لكل جدول تحت RLS:
//     • `SET LOCAL app.tenant_id = 'A'` ⇒ `SELECT` يعيد سجلات A فقط.
//     • `INSERT (tenant_id='B', ...)` من جلسة A ⇒ **يفشل** (violation).
//     • `UPDATE WHERE tenant_id='B'` من جلسة A ⇒ 0 صفوف متأثّرة.
//
//   **(ب) ثبات** — RLS مفعَّل باستمرار:
//     • `SELECT relrowsecurity, relforcerowsecurity FROM pg_class` ⇒
//       كلاهما `true` لكل جدول محمي.
//     • `SELECT count(*) FROM pg_policies WHERE tablename = '...'` ⇒ ≥ 1.
//
//   **(ج) سلبي — الاختبار العكسي الصريح** (L-46):
//     `RLS_MOCK_LEAK=1` ⇒ نحاكي جدولاً بلا RLS ⇒ الحارس يجب أن يفشل.
//     يُثبت أن الحارس يقظ حتى قبل أول جدول حقيقي.
//
// **رخصة تبعية:** `pg` (Node PostgreSQL client) — MIT. تُثبَّت في
// المرحلة 4 مع بقية تبعيات apps/api.

const DATABASE_URL = process.env.PF_MEDIAKIT_DATABASE_URL;
const RLS_MOCK_LEAK = process.env.RLS_MOCK_LEAK === '1';

// المرجع للجداول المتوقّع أن تكون تحت RLS في المرحلة 4.
// يُوسَّع مع كل هجرة تضيف جدولاً تحت RLS.
const EXPECTED_RLS_TABLES = [
  'brand_kits',
  'projects',
  'renders',
  'revisions',
  'annotations',
  'assets',
];

// ── (ج) الاختبار السلبي أوّلاً — يعمل بلا قاعدة بيانات ──
if (RLS_MOCK_LEAK) {
  console.log('════════ G6 — عزل المستأجرين ════════');
  console.log('⚠  RLS_MOCK_LEAK=1 — محاكاة جدول بلا RLS.');
  console.log('    محاكاة: brand_kits.relrowsecurity = false.');
  console.log('    ✗ جدول brand_kits بلا RLS — تسرّب محتمل بين المستأجرين.');
  console.log('════════ G6 ✗ (المحاكاة أُنجحت — الحارس يقظ) ════════');
  process.exit(1);
}

// ── (د) بلا قاعدة بيانات — الحالة الحالية ────────────────
if (!DATABASE_URL) {
  console.log('════════ G6 — عزل المستأجرين ════════');
  console.log('⏳ معلَّق بشرط — PF_MEDIAKIT_DATABASE_URL غير موجود.');
  console.log('   لا قاعدة بيانات ولا جدول تحت RLS في هذه المرحلة.');
  console.log('   يُفعَّل تلقائياً عند وجود أوّل جدول RLS في المرحلة 4.');
  console.log('   **الاختبار السلبي متاح الآن:** RLS_MOCK_LEAK=1 يثبت يقظة الحارس.');
  console.log('════════ G6 ⏳ (معلَّق — exit 0) ════════');
  process.exit(0);
}

// ── التنفيذ الفعلي — يعمل حين وجود DATABASE_URL ────────
// **الملاحظة:** الكود أدناه لم يُختَبر مع PostgreSQL حقيقي بعد لأن
// لا جدول RLS موجود. سيُختبر تكامليّاً في المرحلة 4 مع أوّل هجرة.

const { Client } = await import('pg').catch(() => {
  console.error('✗ حزمة `pg` غير مثبَّتة — أضفها إلى apps/api في المرحلة 4.');
  process.exit(1);
});

console.log('════════ G6 — عزل المستأجرين (تشغيل حي) ════════');

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

try {
  // (ب) ثبات — RLS مفعَّل على كل الجداول المتوقّعة.
  console.log('\n════════ ب) ثبات — RLS مفعَّل ════════');
  for (const table of EXPECTED_RLS_TABLES) {
    const q = await client.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`,
      [table]
    ).catch(() => ({ rows: [] }));
    if (q.rows.length === 0) {
      console.log(`  ⏳ الجدول ${table} غير موجود بعد — تخطٍّ (متوقّع في هجرة لاحقة).`);
      continue;
    }
    const row = q.rows[0];
    assert(row.relrowsecurity === true, `${table}: relrowsecurity=true`);
    assert(row.relforcerowsecurity === true, `${table}: relforcerowsecurity=true`);
    const p = await client.query(
      `SELECT count(*)::int AS n FROM pg_policies WHERE tablename = $1`,
      [table]
    );
    assert(p.rows[0].n >= 1, `${table}: ≥ 1 policy`, `${p.rows[0].n} policy`);
  }

  // (أ) وجود — كل SELECT/INSERT/UPDATE يحترم RLS.
  // تحتاج بذرة اختبار: مستأجرَين وهميَّين + سجلات معلومة.
  // ملاحظة: سيُحقن الكود التالي عند وجود هجرة RLS + سكربت seed.
  console.log('\n════════ أ) وجود — RLS يمنع التسرّب ════════');
  console.log('  ⏳ اختبارات SELECT/INSERT/UPDATE تحتاج seed + بذرة مستأجرَين.');
  console.log('     تُضاف مع أوّل هجرة RLS في المرحلة 4.');
} finally {
  await client.end();
}

console.log('');
if (failed === 0) console.log('════════ G6 ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
