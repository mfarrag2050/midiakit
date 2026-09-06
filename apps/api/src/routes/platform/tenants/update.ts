/**
 * PATCH /v1/platform/tenants/:id — تعديل plan أو plan_overrides.
 * owner/admin فقط.
 *
 * plan_overrides validation (البند 3): المفاتيح من قائمة معلَنة، القيم
 * بأنواعها. مفتاح مجهول ⇒ 400 IMMUTABLE_FIELD (لا تجاهل صامت).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  NotFound, PlatformInsufficientRole, ImmutableField, ValidationFailed,
} from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

// المفاتيح المسموحة في plan_overrides (نفس معايير plans)
const KNOWN_OVERRIDE_KEYS = new Set([
  'brand_kits_limit', 'seats_limit', 'videos_per_month_limit',
  'requests_per_minute_limit', 'concurrent_renders_limit',
]);

const bodySchema = z.object({
  plan: z.enum(['trial', 'starter', 'studio', 'agency', 'api']).optional(),
  planOverrides: z.record(z.unknown()).nullable().optional(),
}).strict();

function validateOverrides(ov: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(ov)) {
    if (!KNOWN_OVERRIDE_KEYS.has(k)) {
      throw ImmutableField(`planOverrides.${k}`);
    }
    // القيمة: null (غير محدود) أو integer > 0
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw ValidationFailed(`planOverrides.${k}`);
    }
  }
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const role = req.platformAuth!.platformRole;
    if (role !== 'owner' && role !== 'admin') throw PlatformInsufficientRole();
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    // تحقّق وجود tenant
    const cur = await req.platformDbClient!.query(
      `SELECT id FROM tenants WHERE id = $1`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();

    if (body.planOverrides !== null && body.planOverrides !== undefined) {
      validateOverrides(body.planOverrides);
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.plan !== undefined) { params.push(body.plan); sets.push(`plan = $${params.length}`); }
    if (body.planOverrides !== undefined) {
      // null صريح ⇒ NULL في العمود (يزيل التجاوز)
      if (body.planOverrides === null) sets.push(`plan_overrides = NULL`);
      else {
        params.push(JSON.stringify(body.planOverrides));
        sets.push(`plan_overrides = $${params.length}::jsonb`);
      }
    }
    if (sets.length === 0) throw ValidationFailed();

    params.push(id);
    const upd = await req.platformDbClient!.query<{
      id: string; plan: string; plan_overrides: unknown; updated_at: Date;
    }>(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, plan, plan_overrides, updated_at`,
      params,
    );
    const row = upd.rows[0]!;
    return {
      id: row.id, plan: row.plan, planOverrides: row.plan_overrides,
      updatedAt: row.updated_at.toISOString(),
    };
  });
};
export default route;
