/**
 * POST /v1/renders/:id/cancel (docs/16 §8.8). admin+ أو requested_by.
 * status ∈ {succeeded, failed, canceled} ⇒ 409 RENDER_ALREADY_TERMINAL.
 * queued ⇒ نُزيل الـjob و نضع status='canceled'.
 * running ⇒ نضع cancel_requested_at و status='cancelling' — العامل يقرأ ويوقف.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { removeRenderJob } from '../../queues/index.js';
import { NotFound, RenderAlreadyTerminal, InsufficientRole } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/cancel', { preHandler: fastify.authenticated }, async (req, reply) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{ status: string; requested_by: string | null }>(
      `SELECT status, requested_by FROM renders WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;

    const role = req.auth!.role;
    const isAdminPlus = role === 'owner' || role === 'admin';
    const isOwner = row.requested_by === req.auth!.userId;
    if (!isAdminPlus && !isOwner) throw InsufficientRole();

    if (TERMINAL.has(row.status)) throw RenderAlreadyTerminal();

    if (row.status === 'queued') {
      try { await removeRenderJob(id); } catch (err) { req.log.warn({ err, id }, 'removeRenderJob failed'); }
      await req.dbClient!.query(
        `UPDATE renders SET status = 'canceled', cancel_requested_at = now(), completed_at = now() WHERE id = $1`, [id],
      );
    } else {
      // running أو cancelling — نُعلَم العامل
      await req.dbClient!.query(
        `UPDATE renders SET status = 'cancelling', cancel_requested_at = now() WHERE id = $1`, [id],
      );
    }

    const r2 = await req.dbClient!.query(
      `SELECT id, status FROM renders WHERE id = $1`, [id],
    );
    reply.status(202).send(r2.rows[0]);
  });
};
export default route;
