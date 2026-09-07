/**
 * POST /v1/platform/users (A28). platform owner.
 * بذر مستخدمي منصّة بلا SQL — البديل عن INSERT يدوي.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hash as argonHash } from '@node-rs/argon2';
import { requirePlatformRoleIn } from '../shared/role-guard.js';
import { ApiError } from '../../../errors.js';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  platformRole: z.enum(['owner', 'admin', 'viewer']),
});

interface Row {
  id: string; email: string; platform_role: string; is_active: boolean;
  created_at: Date; updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    requirePlatformRoleIn(req, ['owner']);
    const body = bodySchema.parse(req.body);
    const pwHash = await argonHash(body.password, {
      algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1,
    });
    try {
      const r = await req.platformDbClient!.query<Row>(
        `INSERT INTO platform_users(email, password_hash, platform_role, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id, email, platform_role, is_active, created_at, updated_at`,
        [body.email, pwHash, body.platformRole]);
      const row = r.rows[0]!;
      reply.status(201).send({
        id: row.id, email: row.email, platformRole: row.platform_role,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') throw new ApiError('EMAIL_TAKEN', 409, 'email');
      throw err;
    }
  });
};
export default route;
