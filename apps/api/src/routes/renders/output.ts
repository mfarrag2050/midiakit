/**
 * GET /v1/renders/:id/output (docs/16 §8.4). viewer+.
 * OUTPUT_NOT_READY (404) إن status !== 'succeeded'.
 * URL موقَّت بصلاحية 1h (S3_OUTPUT_PRESIGN_TTL_SECONDS).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';
import { NotFound, OutputNotReady } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id/output', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<{ status: string; output_storage_key: string | null }>(
      `SELECT status, output_storage_key FROM renders WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;
    if (row.status !== 'succeeded' || !row.output_storage_key) throw OutputNotReady();

    const dl = await getStorage().presignDownload(
      row.output_storage_key, config.S3_OUTPUT_PRESIGN_TTL_SECONDS,
    );
    return { url: dl.publicUrl, expiresAt: dl.expiresAt.toISOString() };
  });
};
export default route;
