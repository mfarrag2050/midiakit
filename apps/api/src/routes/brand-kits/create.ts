/**
 * POST /v1/brand-kits (docs/16 §5.3).
 * الدور: admin+ (تعديل الهوية قرار مؤسسي).
 *
 * المدخل: name (إلزامي) + direction (rtl افتراضاً) + locale (ar افتراضاً).
 * الباقي يُملأ من DEFAULT_BRAND (packages/shared).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbBrandKitRow } from '../../shared/brand-kit-mapper.js';

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  direction: z.enum(['rtl', 'ltr']).default('rtl'),
  locale: z.enum(['ar', 'mixed', 'en']).default('ar'),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);

    const parsed = bodySchema.parse(req.body);
    const id = randomUUID();

    // config = DEFAULT_BRAND بتخصيص direction/locale، بلا id/name (أعمدة DB).
    const { id: _defaultId, name: _defaultName, ...defaultRest } = DEFAULT_BRAND;
    const config = {
      ...defaultRest,
      direction: parsed.direction,
      locale: parsed.locale,
    };

    const r = await req.dbClient!.query<DbBrandKitRow>(
      `INSERT INTO brand_kits(id, tenant_id, name, config)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, name, config, created_at, updated_at`,
      [id, req.auth!.tenantId, parsed.name, config],
    );
    reply.status(201).send(toFull(r.rows[0]!));
  });
};

export default route;
