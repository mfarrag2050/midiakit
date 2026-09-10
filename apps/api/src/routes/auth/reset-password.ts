/**
 * POST /v1/auth/reset-password — يستهلك رمز الاستعادة ويغيّر كلمة السر.
 * docs/16 §2.6.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { completePasswordReset } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(12),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/reset-password', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    await completePasswordReset(getPool(), {
      email: parsed.email,
      token: parsed.token,
      newPassword: parsed.newPassword,
    });
    reply.status(204).send();
  });
};

export default route;
