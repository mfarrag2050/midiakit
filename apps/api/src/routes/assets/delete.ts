/**
 * DELETE /v1/assets/:id — حذف أصل (docs/16 §9.6).
 * الدور: admin فما فوق.
 *
 * 409 ASSET_IN_USE_BY_BRAND_KIT إن كان مُشاراً إليه في أي brand_kit.
 * حذف storage أيضاً — تنظيف كامل.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getStorage } from '../../storage/index.js';
import { NotFound, AssetInUseByBrandKit } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface DbRow { storage_key: string }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);

    // 1. جلب المفتاح
    const r = await req.dbClient!.query<DbRow>(
      `SELECT storage_key FROM assets WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const storageKey = r.rows[0]!.storage_key;

    // 2. inUse check — قرار #1: يطابق على assetId في brand_kits.config
    const inUse = await req.dbClient!.query<{ x: number }>(
      `SELECT 1 AS x FROM brand_kits
       WHERE jsonb_path_exists(config, '$.**.assetId ? (@ == $val)',
             jsonb_build_object('val', $1::text))
       LIMIT 1`,
      [id],
    );
    if ((inUse.rowCount ?? 0) > 0) throw AssetInUseByBrandKit();

    // 3. حذف من DB
    await req.dbClient!.query(`DELETE FROM assets WHERE id = $1`, [id]);

    // 4. حذف من storage (خارج DB، بعد نجاح DELETE)
    // إن فشل storage delete، DB أصبح متسقاً — نُسجّل في السجلّ.
    try {
      await getStorage().deleteObject(storageKey);
    } catch (err) {
      req.log.warn({ storageKey, err }, 'assets:delete — storage delete failed after DB delete');
    }

    reply.status(204).send();
  });
};

export default route;
