/**
 * DELETE /v1/platform/users/:id (A28). platform owner.
 * لا يسمح بحذف آخر owner (بلا owner لن يقدر أحد على إدارة اللوحة).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { ApiError, NotFound } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    requirePlatformRoleIn(req, ['owner']);
    const { id } = paramsSchema.parse(req.params);
    const cur = await req.platformDbClient!.query<{ platform_role: string }>(
      `SELECT platform_role FROM platform_users WHERE id = $1`, [id]);
    if (cur.rowCount === 0) throw NotFound();
    if (cur.rows[0]!.platform_role === 'owner') {
      const owners = await req.platformDbClient!.query<{ n: string }>(
        `SELECT count(*)::bigint::text AS n FROM platform_users WHERE platform_role = 'owner' AND is_active = true`);
      if (Number(owners.rows[0]!.n) <= 1) {
        throw new ApiError('LAST_OWNER', 409);
      }
    }
    await req.platformDbClient!.query(`DELETE FROM platform_users WHERE id = $1`, [id]);
    reply.status(204).send();
  });
};
export default route;
