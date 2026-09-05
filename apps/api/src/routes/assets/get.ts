/**
 * GET /v1/assets/:id — أصل واحد + publicUrl جديد (docs/16 §9.4).
 * الدور: viewer فما فوق.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';
import { toAssetResponse, type DbAssetRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const r = await req.dbClient!.query<DbAssetRow>(
      `SELECT * FROM assets WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;

    // publicUrl جديد لكل قراءة — روابط موقَّتة تنتهي
    const dl = await getStorage().presignDownload(row.storage_key, config.S3_PRESIGN_TTL_SECONDS);
    return toAssetResponse(row, dl.publicUrl);
  });
};

export default route;
