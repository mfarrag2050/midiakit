/**
 * GET /v1/brand-kits/:id — كائن BrandKit كامل (docs/16 §5.2).
 * الدور: viewer+.
 *
 * **قاعدة عزل حرجة (docs/16 §1.3):** معرّف من مستأجر آخر → 404،
 * لا 403. 403 يكشف الوجود. RLS يعطينا هذا مجاناً — WHERE id=... من
 * جلسة مستأجر آخر يعود 0 صفوف → 404.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toFull, type DbBrandKitRow } from '../../shared/brand-kit-mapper.js';
import { ApiError } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);

    const r = await req.dbClient!.query<DbBrandKitRow>(
      `SELECT id, tenant_id, name, config, created_at, updated_at
       FROM brand_kits WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) {
      // 404 لا 403 — RLS يمنع القراءة، لا نميّز «غير موجود» عن «غير مستأجرك».
      throw new ApiError('NOT_FOUND', 404);
    }
    return toFull(r.rows[0]!);
  });
};

export default route;
