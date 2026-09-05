/**
 * DELETE /v1/projects/:id/annotations/:aid (docs/16 §12.4).
 * الدور: المؤلّف أو admin+.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound, InsufficientRole } from '../../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid(), aid: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id/annotations/:aid', { preHandler: fastify.authenticated }, async (req, reply) => {
    const { id, aid } = paramsSchema.parse(req.params);

    const cur = await req.dbClient!.query<{ author_id: string | null }>(
      `SELECT author_id FROM annotations WHERE id = $1 AND project_id = $2`, [aid, id],
    );
    if (cur.rowCount === 0) throw NotFound();

    const role = req.auth!.role;
    const isAdminPlus = role === 'owner' || role === 'admin';
    const isAuthor = cur.rows[0]!.author_id === req.auth!.userId;
    if (!isAdminPlus && !isAuthor) throw InsufficientRole();

    await req.dbClient!.query(`DELETE FROM annotations WHERE id = $1`, [aid]);
    reply.status(204).send();
  });
};
export default route;
