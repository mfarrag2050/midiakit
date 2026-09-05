/**
 * POST /v1/assets/:id/detect-faces — إعادة تشغيل الكشف (docs/16 §9.7).
 * الدور: writer فما فوق.
 *
 * **بند مؤجَّل:** كشف الوجوه الفعلي (docs/12 §5). في A11 نُعيد
 * `{faces: []}` بدون تشغيل موديل — النقطة موجودة عقدياً، والاستدعاء
 * لا يُخزّن (§9.8 هو الذي يخزّن).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:id/detect-faces', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const { id } = paramsSchema.parse(req.params);

    const r = await req.dbClient!.query<{ id: string; kind: string }>(
      `SELECT id, kind FROM assets WHERE id = $1`, [id],
    );
    if (r.rowCount === 0) throw NotFound();

    // بند مؤجَّل: موديل الكشف يُوصَل في مرحلة لاحقة. تُعاد قائمة فارغة.
    return { faces: [] };
  });
};

export default route;
