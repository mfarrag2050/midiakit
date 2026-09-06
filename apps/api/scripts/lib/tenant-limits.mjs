/**
 * FIX-CASCADE — رفع حدود الباقة لمستأجر اختبار (لا يعطّل الفرض).
 *
 * السياق: A21 يفرض PLAN_LIMIT_REACHED / SEATS_EXHAUSTED /
 * QUOTA_EXCEEDED_RENDERS. trial (الباقة الافتراضية بعد signup) يسمح
 * فقط بـ 1 brand_kit, 1 seat, 1 concurrent render, 5 videos/شهر.
 * البوابات القديمة (verify:brand-kits, users, renders) لا تعرف هذا
 * وتحاول أكثر ⇒ 422 cascade إلى undefined ids.
 *
 * الحلّ (قرار المالك 2026-09-08): كل مستأجر اختبار يُنشأ ثم يُرفع
 * override إلى قيم غير محدودة. **الفرض يبقى قائماً** — نختبر الموارد
 * لا الحدود. verify:a21/a22/a23 لا تستدعي هذا — تختبر الفرض نفسه.
 *
 * الاستعمال:
 *   import { bumpTenantLimits } from './lib/tenant-limits.mjs';
 *   const { session, tenant } = json(sigResponse);
 *   await bumpTenantLimits(migPool, tenant.id);
 */

export async function bumpTenantLimits(migPool, tenantId) {
  const overrides = {
    brand_kits_limit: null,          // غير محدود
    seats_limit: null,
    videos_per_month_limit: null,
    concurrent_renders_limit: 100,   // كافٍ لأيّ اختبار متوازٍ
    requests_per_minute_limit: 100000,
  };
  const c = await migPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const r = await c.query(
      `UPDATE tenants SET plan_overrides = $1::jsonb WHERE id = $2`,
      [JSON.stringify(overrides), tenantId],
    );
    if (r.rowCount !== 1) throw new Error(`bumpTenantLimits: updated ${r.rowCount} rows for ${tenantId}`);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}
