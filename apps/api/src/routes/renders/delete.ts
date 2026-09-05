/**
 * DELETE /v1/renders/:id (docs/16 §8.7). admin+.
 * RENDER_RUNNING (409) — لا حذف قيد التنفيذ. استعمل §8.8.
 * يحذف output من التخزين إن كان موجوداً.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getStorage } from '../../storage/index.js';
import { NotFound, RenderRunning } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{ status: string; output_storage_key: string | null }>(
      `SELECT status, output_storage_key FROM renders WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;
    if (row.status === 'running' || row.status === 'cancelling') throw RenderRunning();

    await req.dbClient!.query(`DELETE FROM renders WHERE id = $1`, [id]);
    if (row.output_storage_key) {
      try { await getStorage().deleteObject(row.output_storage_key); }
      catch (err) { req.log.warn({ err, key: row.output_storage_key }, 'render delete: storage clean failed'); }
    }
    reply.status(204).send();
  });
};
export default route;
