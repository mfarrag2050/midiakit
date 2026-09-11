/**
 * DELETE /v1/ai/integrations/:provider (docs/16 §15.3). owner|admin.
 * 204. مستأجر آخر ⇒ 404 (RLS يمنع القراءة أصلاً).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ provider: z.string().min(1).max(50) });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:provider', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { provider } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query(
      `DELETE FROM ai_integrations WHERE provider = $1`, [provider]);
    if ((r.rowCount ?? 0) === 0) throw NotFound();
    reply.status(204).send();
  });
};
export default route;
