/**
 * POST /v1/platform/auth/logout — يبطل platform_session الحالية.
 */
import type { FastifyPluginAsync } from 'fastify';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/logout', { preHandler: fastify.platformAuthenticated }, async (req, reply) => {
    await req.platformDbClient!.query(
      `UPDATE platform_sessions SET is_active = false WHERE id = $1`,
      [req.platformAuth!.sessionId],
    );
    reply.status(204).send();
  });
};
export default route;
