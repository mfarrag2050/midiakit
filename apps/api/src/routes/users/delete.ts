/**
 * DELETE /v1/users/:id — حذف مستخدم (docs/16 §4.5).
 * الدور: owner أو admin.
 *
 * قيود:
 *   - reason ≥ 10 حرف → REASON_TOO_SHORT
 *   - لا حذف آخر owner → LAST_OWNER
 *   - reassignedProjects + deletedDrafts = 0 حتى A14 (بند مؤجَّل، معلَن)
 *     أ. A14 تُنشئ projects table
 *     ب. reassign logic يُبنى مع DELETE handler
 *   - newOwnerId = أوّل owner في المستأجر (single-owner في A10)
 *
 * لا حذف ذاتي — العقد صامت، أختار المنع (اجتناب self-deletion accident).
 * أُعلَن.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { ApiError, NotFound, LastOwner, ReasonTooShort } from '../../errors.js';

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  reason: z.string(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.delete('/:id', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const { id } = paramsSchema.parse(req.params);

    // reason ≥ 10 حرف بعد trim
    const body = bodySchema.parse(req.body ?? {});
    if (body.reason.trim().length < 10) throw ReasonTooShort();

    // منع الحذف الذاتي (العقد صامت، انحراف معلَن)
    if (id === req.auth!.userId) throw new ApiError('FORBIDDEN', 403);

    // جلب المستخدم الحالي
    const cur = await req.dbClient!.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE id = $1`,
      [id],
    );
    if (cur.rowCount === 0) throw NotFound();
    const target = cur.rows[0]!;

    // حذف آخر owner → LAST_OWNER
    if (target.role === 'owner') {
      const ownersR = await req.dbClient!.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND is_active = true`,
      );
      if ((ownersR.rows[0]?.n ?? 0) <= 1) throw LastOwner();
    }

    // إيجاد newOwnerId (owner المستأجر — أوّل نشِط ليس الهدف)
    const newOwnerR = await req.dbClient!.query<{ id: string }>(
      `SELECT id FROM users
       WHERE role = 'owner' AND is_active = true AND id != $1
       ORDER BY created_at ASC LIMIT 1`,
      [id],
    );
    const newOwnerId = newOwnerR.rows[0]?.id ?? null;

    // A14: مسوّدات (state='draft') تُحذَف حذفاً ناعماً، الباقي يُعاد إسناده
    // إلى newOwnerId (§4.5 قرار B1). RLS يقصر التأثير على المستأجر تلقائياً
    // (created_by user id → users → tenant_id).
    //
    // ملاحظة: revisions log لكل إعادة إسناد بند A20 (لا جدول revisions
    // يستعمل بعد — نُعلَنه في الانحرافات).
    let reassignedProjects = 0;
    let deletedDrafts = 0;
    if (newOwnerId != null) {
      const reass = await req.dbClient!.query(
        `UPDATE projects SET created_by = $1
         WHERE created_by = $2
           AND deleted_at IS NULL
           AND state != 'draft'`,
        [newOwnerId, id],
      );
      reassignedProjects = reass.rowCount ?? 0;
    }
    // مسوّدات المنشئ تُحذف ناعماً (state='draft' وحده — لا فحص PROJECT_HAS_RENDERS
    // لأن المسوّدات بلا renders بحكم الحالة).
    const drafts = await req.dbClient!.query(
      `UPDATE projects SET deleted_at = now()
       WHERE created_by = $1
         AND deleted_at IS NULL
         AND state = 'draft'`,
      [id],
    );
    deletedDrafts = drafts.rowCount ?? 0;

    // DELETE (CASCADE على sessions, password_reset_tokens; SET NULL على FK's أخرى
    // مثل projects.created_by — لكن بعد UPDATE أعلاه صار مسنداً لـnewOwnerId).
    await req.dbClient!.query(`DELETE FROM users WHERE id = $1`, [id]);

    return {
      userId: id,
      reassignedProjects,   // A14 pending
      deletedDrafts,        // A14 pending
      newOwnerId,
    };
  });
};

export default route;
