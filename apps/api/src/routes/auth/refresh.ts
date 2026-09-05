/**
 * POST /v1/auth/refresh — تبديل refresh token بـtokens جديدة.
 * docs/16 §2.3.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { refreshSession } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  refreshToken: z.string().min(1),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/refresh', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const tokens = await refreshSession(getPool(), parsed.refreshToken);
    // A8-FIX 2026-09-05: الجسم مفروش بلا غلاف session — docs/16 §2.3
    // (كان مغلَّفاً { session: {...} } سابقاً؛ الاستوديو يقرأ undefined
    // فيفشل تجديد الرمز من طرف إلى طرف. راجع 536d661 على mk-studio).
    reply.status(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  });
};

export default route;
