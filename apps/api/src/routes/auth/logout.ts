/**
 * DELETE /v1/auth/logout — يبطل الجلسة الحالية.
 * docs/16 §2.4. يتطلّب Bearer.
 */
import type { FastifyPluginAsync } from 'fastify';
import { revokeSession } from '../../auth/session.js';

import { commitTx } from '../../plugins/tenant-tx.js';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/logout', { preHandler: fastify.authenticated }, async (req, reply) => {
    // tenant-tx يفتح req.dbClient بعد authGuard
    await revokeSession(req.dbClient!, req.auth!.sessionId);
    await commitTx(req);
    reply.status(204).send();
  });
};

export default route;
