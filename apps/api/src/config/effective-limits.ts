/**
 * effective-limits — دالة قراءة الحدّ الفعلي لمستأجر (plan + overrides).
 *
 * دلالة `plan_overrides` (A26): مفتاح موجود ⇒ يعلو على قيمة plans.
 * غائب ⇒ يُقرأ من plans. **لا دمج جزئي غامض** (كل قيمة إمّا override
 * أو من الباقة). null في override = «غير محدود» (نفس معنى plans).
 *
 * ملاحظة: هذه الطبقة **للقراءة وحدها** في A26. الفرض في A21 و A23.
 */
import type { PoolClient } from 'pg';

export interface EffectiveLimits {
  brandKitsLimit: number | null;
  seatsLimit: number | null;
  videosPerMonthLimit: number | null;
  requestsPerMinuteLimit: number;
  concurrentRendersLimit: number;
}

interface DbLimitsRow {
  plan_brand_kits: number | null;
  plan_seats: number | null;
  plan_videos: number | null;
  plan_rpm: number;
  plan_concurrent: number;
  overrides: Record<string, unknown> | null;
}

/**
 * getEffectiveLimits — يجلب plans join tenant، ثم يطبّق plan_overrides.
 *
 * السلوك:
 *   - overrides = null ⇒ كل القيم من plans
 *   - overrides = {brand_kits_limit: 10} ⇒ brand_kits=10، الباقي من plans
 *   - override بـnull ⇒ «غير محدود» (يعلو على plans حتى لو plans رقم)
 */
export async function getEffectiveLimits(
  client: PoolClient,
  tenantId: string,
): Promise<EffectiveLimits> {
  const r = await client.query<DbLimitsRow>(
    `SELECT
       p.brand_kits_limit         AS plan_brand_kits,
       p.seats_limit              AS plan_seats,
       p.videos_per_month_limit   AS plan_videos,
       p.requests_per_minute_limit AS plan_rpm,
       p.concurrent_renders_limit  AS plan_concurrent,
       t.plan_overrides           AS overrides
     FROM tenants t
     JOIN plans p ON p.key = t.plan
     WHERE t.id = $1`,
    [tenantId],
  );
  if (r.rowCount === 0) throw new Error(`tenant ${tenantId} not found`);
  const row = r.rows[0]!;
  const ov = row.overrides ?? {};

  const pick = <T extends number | null>(overrideKey: string, planValue: T): T => {
    if (overrideKey in ov) return ov[overrideKey] as T;
    return planValue;
  };

  return {
    brandKitsLimit:         pick('brand_kits_limit', row.plan_brand_kits),
    seatsLimit:             pick('seats_limit', row.plan_seats),
    videosPerMonthLimit:    pick('videos_per_month_limit', row.plan_videos),
    requestsPerMinuteLimit: pick('requests_per_minute_limit', row.plan_rpm),
    concurrentRendersLimit: pick('concurrent_renders_limit', row.plan_concurrent),
  };
}
