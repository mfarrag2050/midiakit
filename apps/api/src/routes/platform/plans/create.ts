/**
 * POST /v1/platform/plans (A28). platform owner.
 *
 * إنشاء باقة جديدة. key فريد. Identity (key + names) تدخل definition_hash
 * الجديد — الحارس check-plan-sync يقارنها بعد ذلك (بعد A28 = هوية فقط).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { toPublicPlan, type DbPlanRow } from './shared.js';

const bodySchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'key: lowercase, digits, _ or -'),
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  priceUsdCents: z.number().int().min(0),
  brandKitsLimit: z.number().int().positive().nullable(),
  seatsLimit: z.number().int().positive().nullable(),
  videosPerMonthLimit: z.number().int().positive().nullable(),
  requestsPerMinuteLimit: z.number().int().positive(),
  concurrentRendersLimit: z.number().int().positive(),
});

function identityHash(key: string, name_ar: string, name_en: string): string {
  const canonical = { key, name_ar, name_en };
  const sorted = Object.keys(canonical).sort().reduce<Record<string, string>>((a, k) => {
    a[k] = canonical[k as keyof typeof canonical]; return a;
  }, {});
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    requirePlatformRoleIn(req, ['owner']);
    const body = bodySchema.parse(req.body);
    const hash = identityHash(body.key, body.nameAr, body.nameEn);
    const source = `A28-runtime-${new Date().toISOString().slice(0, 10)}`;

    const r = await req.platformDbClient!.query<DbPlanRow>(
      `INSERT INTO plans(key, name_ar, name_en, price_usd_cents,
                          brand_kits_limit, seats_limit, videos_per_month_limit,
                          requests_per_minute_limit, concurrent_renders_limit,
                          source_ref, definition_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING key, name_ar, name_en, price_usd_cents,
                 brand_kits_limit, seats_limit, videos_per_month_limit,
                 requests_per_minute_limit, concurrent_renders_limit,
                 created_at, updated_at`,
      [body.key, body.nameAr, body.nameEn, body.priceUsdCents,
       body.brandKitsLimit, body.seatsLimit, body.videosPerMonthLimit,
       body.requestsPerMinuteLimit, body.concurrentRendersLimit,
       source, hash],
    );
    reply.status(201).send(toPublicPlan(r.rows[0]!));
  });
};
export default route;
