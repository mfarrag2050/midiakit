/**
 * DELETE /v1/brand-kits/:id (docs/16 §5.8).
 * الدور: owner فقط.
 *
 * 409 عند:
 *   - BRAND_KIT_IN_USE: له مشاريع مرتبطة (project.brand_kit_id).
 *   - LAST_BRAND_KIT: هو الوحيد للمستأجر (لا يبقى بلا هوية).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { BrandKitInUse, LastBrandKit, NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner']);
    const { id } = paramsSchema.parse(req.params);

    // 1. تحقّق من الوجود (تحت المستأجر) — يعطينا 404 مبكّراً بدل 409 مضلّل.
    const exists = await req.dbClient!.query<{ id: string }>(
      `SELECT id FROM brand_kits WHERE id = $1`,
      [id],
    );
    if (exists.rowCount === 0) throw NotFound();

    // 2. LAST_BRAND_KIT — إن كان الوحيد للمستأجر.
    const cntR = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM brand_kits`,
    );
    if ((cntR.rows[0]?.n ?? 0) <= 1) throw LastBrandKit();

    // 3. BRAND_KIT_IN_USE — إن كان له مشاريع.
    const inUse = await req.dbClient!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM projects WHERE brand_kit_id = $1`,
      [id],
    );
    if ((inUse.rows[0]?.n ?? 0) > 0) throw BrandKitInUse();

    // 4. DELETE
    await req.dbClient!.query(`DELETE FROM brand_kits WHERE id = $1`, [id]);
    reply.status(204).send();
  });
};

export default route;
