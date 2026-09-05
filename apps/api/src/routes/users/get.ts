/**
 * GET /v1/users/:id — مستخدم واحد (docs/16 §4.2).
 * viewer+ يرى نفسه · admin+ يرى الجميع.
 * غير مصرَّح → 404 (لا 403 — نفس منطق العزل).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

interface DbUserRow {
  id: string;
  email: string;
  role: string;
  created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const isAdminPlus = req.auth!.role === 'owner' || req.auth!.role === 'admin';
    const isSelf = id === req.auth!.userId;

    // من ليس admin+ ولا يطلب نفسه → 404 (نفس منطق العزل: 403 يكشف الوجود)
    if (!isAdminPlus && !isSelf) throw NotFound();

    const r = await req.dbClient!.query<DbUserRow>(
      `SELECT id, email, role, created_at FROM users WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const u = r.rows[0]!;
    return { id: u.id, email: u.email, role: u.role, createdAt: u.created_at.toISOString() };
  });
};

export default route;
