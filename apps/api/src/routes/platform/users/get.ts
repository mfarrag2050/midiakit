/**
 * GET /v1/platform/users/:id (A28). platform user.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface Row {
  id: string; email: string; platform_role: string; is_active: boolean;
  created_at: Date; updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.platformDbClient!.query<Row>(
      `SELECT id, email, platform_role, is_active, created_at, updated_at
       FROM platform_users WHERE id = $1`, [id]);
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
