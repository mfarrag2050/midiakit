/**
 * PATCH /v1/platform/plans/:key (A28). platform owner.
 *
 * تحرير باقة قائمة — يحدّث الحدود والسعر (والاسم إن طُلب — يُعيد حساب hash).
 * key نفسه غير قابل للتعديل (لا يُقبل في body — الاسم مسموح).
 *
 * **إسقاط ذاكرة plan-limits-cache فوراً** (قرار المالك 2026-09-07 §3):
 * التغيير يظهر مباشرة في getEffectiveLimits لا بعد دقيقة (TTL يبقى fallback
 * عند تعدّد العمليات — موثَّق في A23).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { NotFound } from '../../../errors.js';
import { clearPlanLimitsCache } from '../../../plugins/plan-limits-cache.js';
import { toPublicPlan, type DbPlanRow } from './shared.js';

const paramsSchema = z.object({ key: z.string().min(1).max(50) });
const bodySchema = z.object({
  nameAr: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  priceUsdCents: z.number().int().min(0).optional(),
  brandKitsLimit: z.number().int().positive().nullable().optional(),
  seatsLimit: z.number().int().positive().nullable().optional(),
  videosPerMonthLimit: z.number().int().positive().nullable().optional(),
  requestsPerMinuteLimit: z.number().int().positive().optional(),
  concurrentRendersLimit: z.number().int().positive().optional(),
});

function identityHash(key: string, name_ar: string, name_en: string): string {
  const canonical = { key, name_ar, name_en };
  const sorted = Object.keys(canonical).sort().reduce<Record<string, string>>((a, k) => {
    a[k] = canonical[k as keyof typeof canonical]; return a;
  }, {});
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:key', { preHandler: fastify.platformAuthenticated }, async (req) => {
    requirePlatformRoleIn(req, ['owner']);
    const { key } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const cur = await req.platformDbClient!.query<{ name_ar: string; name_en: string }>(
      `SELECT name_ar, name_en FROM plans WHERE key = $1`, [key]);
    if (cur.rowCount === 0) throw NotFound();
    const curRow = cur.rows[0]!;

    const nextNameAr = body.nameAr ?? curRow.name_ar;
    const nextNameEn = body.nameEn ?? curRow.name_en;
    const identityChanged = body.nameAr !== undefined || body.nameEn !== undefined;
    const nextHash = identityChanged ? identityHash(key, nextNameAr, nextNameEn) : null;

    // بناء SET clause ديناميكياً (fields present فقط)
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => {
      params.push(val); sets.push(`${col} = $${params.length}`);
    };
    if (body.nameAr !== undefined) set('name_ar', body.nameAr);
    if (body.nameEn !== undefined) set('name_en', body.nameEn);
    if (body.priceUsdCents !== undefined) set('price_usd_cents', body.priceUsdCents);
    if (body.brandKitsLimit !== undefined) set('brand_kits_limit', body.brandKitsLimit);
    if (body.seatsLimit !== undefined) set('seats_limit', body.seatsLimit);
    if (body.videosPerMonthLimit !== undefined) set('videos_per_month_limit', body.videosPerMonthLimit);
    if (body.requestsPerMinuteLimit !== undefined) set('requests_per_minute_limit', body.requestsPerMinuteLimit);
    if (body.concurrentRendersLimit !== undefined) set('concurrent_renders_limit', body.concurrentRendersLimit);
    if (nextHash) set('definition_hash', nextHash);
    sets.push(`updated_at = now()`);

    params.push(key);
    const upd = await req.platformDbClient!.query<DbPlanRow>(
      `UPDATE plans SET ${sets.join(', ')} WHERE key = $${params.length}
       RETURNING key, name_ar, name_en, price_usd_cents,
                 brand_kits_limit, seats_limit, videos_per_month_limit,
                 requests_per_minute_limit, concurrent_renders_limit,
                 created_at, updated_at`, params);

    // إسقاط ذاكرة الحدود — الأثر فوري في getEffectiveLimits.
    // كل المستأجرين المتأثّرين (أيّ tenant على هذه الباقة) — نُسقط الكلّ
    // (لا نعرف tenantIds مسبقاً بلا استعلام إضافي، وclearAll أرخص).
    clearPlanLimitsCache();

    return toPublicPlan(upd.rows[0]!);
  });
};
export default route;
