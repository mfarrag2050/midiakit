/**
 * POST /v1/assets/:id/refresh-url — publicUrl جديد (docs/16 §9.5).
 * الدور: viewer فما فوق (كل من يملك حق القراءة).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface DbRow { storage_key: string }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/refresh-url', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<DbRow>(
      `SELECT storage_key FROM assets WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();

    const dl = await getStorage().presignDownload(r.rows[0]!.storage_key, config.S3_PRESIGN_TTL_SECONDS);
    return { publicUrl: dl.publicUrl, expiresAt: dl.expiresAt.toISOString() };
  });
};

export default route;
