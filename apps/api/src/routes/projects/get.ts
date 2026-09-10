/**
 * GET /v1/projects/:id — مشروع كامل مع content (docs/16 §7.2).
 * الدور: viewer فما فوق — نفس منطق list.ts (assignee/created_by للـviewer).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toFull, type DbProjectRow } from './shared/mapper.js';
import { NotFound } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:id', { preHandler: fastify.authenticated }, async (req) => {
    const { id } = paramsSchema.parse(req.params);

    const r = await req.dbClient!.query<DbProjectRow>(
      `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (r.rowCount === 0) throw NotFound();
    const row = r.rows[0]!;

    // RBAC: غير-admin يرى فقط ما أنشأه أو ما أُسند إليه
    const isAdminPlus = req.auth!.role === 'owner' || req.auth!.role === 'admin';
    if (!isAdminPlus) {
      const uid = req.auth!.userId;
      if (row.created_by !== uid && row.assignee_id !== uid) throw NotFound();
    }
    return toFull(row);
  });
};

export default route;
