/**
 * PATCH /v1/assets/:id/faces — حفظ إحداثيات الوجوه (docs/16 §9.8).
 * الدور: writer فما فوق.
 *
 * كل قيمة نسبة من 0..1 من العرض/الارتفاع (L-02).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getStorage } from '../../storage/index.js';
import { config } from '../../config.js';
import { toAssetResponse, type DbAssetRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const faceSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const bodySchema = z.object({
  faces: z.array(faceSchema),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id/faces', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const { id } = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const upd = await req.dbClient!.query<DbAssetRow>(
      `UPDATE assets SET faces = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(body.faces), id],
    );
    if (upd.rowCount === 0) throw NotFound();
    const row = upd.rows[0]!;

    // نعيد الأصل الكامل + publicUrl جديد
    const dl = await getStorage().presignDownload(row.storage_key, config.S3_PRESIGN_TTL_SECONDS);
    return toAssetResponse(row, dl.publicUrl);
  });
};

export default route;
