/**
 * POST /v1/auth/login — بريد + كلمة سر → tokens.
 * docs/16 §2.2.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { login } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const result = await login(getPool(), {
      email: parsed.email,
      password: parsed.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    reply.status(200).send({
      user: { id: result.userId, role: result.role },
      tenant: { id: result.tenantId },
      session: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  });
};

export default route;
