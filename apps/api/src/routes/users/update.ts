/**
 * PATCH /v1/users/:id — تعديل الدور (docs/16 §4.4).
 * الدور: owner أو admin.
 *
 * قيود:
 *   - role فقط (email ثابت — العقد)
 *   - لا ترقية إلى 'owner' (نقل ملكية بند لاحق، مُعلَن)
 *   - لا خفض آخر owner → 409 LAST_OWNER
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  NotFound, LastOwner, ImmutableField,
} from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

// A10 يقبل 6 أدوار (owner مستثنى — نقل ملكية بند لاحق)
const bodySchema = z.object({
  role: z.enum(['admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']),
}).strict(); // .strict() يمنع مفاتيح إضافية (email لن يمرّ)

interface DbUserRow {
  id: string;
  email: string;
  role: string;
  created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);

    // فحص مفاتيح غير مسموحة صراحةً (email/id/…)
    if (req.body && typeof req.body === 'object') {
      const forbidden = Object.keys(req.body as object).filter(k => k !== 'role');
      if (forbidden.length > 0) throw ImmutableField(forbidden[0]!);
    }

    const parsed = bodySchema.parse(req.body);

    // جلب المستخدم الحالي
    const cur = await req.dbClient!.query<DbUserRow>(
      `SELECT id, email, role, created_at FROM users WHERE id = $1`,
      [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const target = cur.rows[0]!;

    // خفض آخر owner → LAST_OWNER (bodySchema يمنع 'owner' فأيّ role
    // مُقتنَص هو خفض إن كان target owner).
    if (target.role === 'owner') {
      const ownersR = await req.dbClient!.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND is_active = true`,
      );
      if ((ownersR.rows[0]?.n ?? 0) <= 1) throw LastOwner();
    }

    // نقل ملكية (ترقية إلى owner): بند لاحق، غير مسموح في A10.
    // bodySchema.enum يمنع 'owner' ابتداءً — إن جاء نصّاً غير مقنَّن
    // فسيسقط في zod validation قبل الوصول هنا (400 VALIDATION_FAILED).

    const upd = await req.dbClient!.query<DbUserRow>(
      `UPDATE users SET role = $1 WHERE id = $2
       RETURNING id, email, role, created_at`,
      [parsed.role, id],
    );
    const u = upd.rows[0]!;
    return { id: u.id, email: u.email, role: u.role, createdAt: u.created_at.toISOString() };
  });
};

export default route;
