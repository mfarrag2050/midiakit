/**
 * PATCH /v1/platform/users/:id (A28). platform owner.
 * تعديل platform_role أو is_active. تغيير password بـPUT/password منفصل مؤجَّل.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { NotFound } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  platformRole: z.enum(['owner', 'admin', 'viewer']).optional(),
  isActive: z.boolean().optional(),
});

interface Row {
  id: string; email: string; platform_role: string; is_active: boolean;
  created_at: Date; updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.platformAuthenticated }, async (req) => {
    requirePlatformRoleIn(req, ['owner']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.platformRole !== undefined) { params.push(body.platformRole); sets.push(`platform_role = $${params.length}`); }
    if (body.isActive !== undefined) { params.push(body.isActive); sets.push(`is_active = $${params.length}`); }
    if (sets.length === 0) sets.push(`updated_at = now()`);
    else sets.push(`updated_at = now()`);
    params.push(id);
    const r = await req.platformDbClient!.query<Row>(
      `UPDATE platform_users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, platform_role, is_active, created_at, updated_at`, params);
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;
    return {
      id: row.id, email: row.email, platformRole: row.platform_role,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
};
export default route;
