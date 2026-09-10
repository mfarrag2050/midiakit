/**
 * plan-limits-cache — ذاكرة مؤقّتة لـrequestsPerMinuteLimit (A23).
 *
 * حدّ الباقة يُخزَّن 60 ثانية. تغيير الباقة أو plan_overrides يظهر أثره
 * خلال دقيقة — رفعاً وخفضاً. عند تعدّد العمليات (cluster): يُستبدل Map
 * بـRedis، ومنطق الاستدعاء لا يتغيّر.
 *
 * TTL في مكان واحد معلَن — لا رقم متكرّر في الكود.
 */
import type { Pool } from 'pg';
import { getEffectiveLimits } from '../config/effective-limits.js';

export const PLAN_LIMITS_CACHE_TTL_MS = 60_000;

interface CachedEntry {
  requestsPerMinute: number;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

/**
 * قراءة حدّ الطلبات/دقيقة لمستأجر — من الذاكرة أوّلاً، ومن DB عند انتهاء TTL.
 * فتح معاملة قصيرة مع `app_set_tenant` لأن `getEffectiveLimits` يقرأ
 * `tenants` (RLS بـapp.tenant_id).
 */
export async function getCachedRequestsPerMinute(pool: Pool, tenantId: string): Promise<number> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.requestsPerMinute;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const limits = await getEffectiveLimits(client, tenantId);
    await client.query('COMMIT');
    cache.set(tenantId, {
      requestsPerMinute: limits.requestsPerMinuteLimit,
      expiresAt: now + PLAN_LIMITS_CACHE_TTL_MS,
    });
    return limits.requestsPerMinuteLimit;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

/** إسقاط الذاكرة — للاختبار أو invalidation يدوي. */
export function clearPlanLimitsCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}
