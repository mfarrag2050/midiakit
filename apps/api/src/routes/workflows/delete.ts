/**
 * DELETE /v1/workflows/:id (docs/16 §11.5). admin+.
 * WORKFLOW_IN_USE (409) · CANNOT_DELETE_DEFAULT (409).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound, WorkflowInUse, CannotDeleteDefault } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);

    const cur = await req.dbClient!.query<{ is_default: boolean }>(
      `SELECT is_default FROM workflows WHERE id = $1`, [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    if (cur.rows[0]!.is_default) throw CannotDeleteDefault();

    const use = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM projects WHERE workflow_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if ((use.rows[0]?.n ?? 0) > 0) throw WorkflowInUse();

    await req.dbClient!.query(`DELETE FROM workflows WHERE id = $1`, [id]);
    reply.status(204).send();
  });
};
export default route;
