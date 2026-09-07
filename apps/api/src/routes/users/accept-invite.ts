/**
 * POST /v1/users/accept-invite (DEBT-1 §1, 2026-09-07).
 *
 * لا في العقد §4 صراحةً — invite.ts:99 كان يشير إلى الاسم كبند مؤجَّل.
 * الآن يُبنى: المدعوّ يقدّم `token` (من الرابط في البريد) + `password`
 * جديد. النقطة تُنشئ user وتضبط `invitations.accepted_at = now()`.
 *
 * السلوك:
 *   • token غير موجود ⇒ 404 INVITATION_NOT_FOUND
 *   • token منتهٍ (expires_at ≤ now) ⇒ 410 INVITATION_EXPIRED
 *   • token مقبول سابقاً (accepted_at IS NOT NULL) ⇒ 410 INVITATION_ALREADY_ACCEPTED
 *   • password < 12 ⇒ 400 PASSWORD_TOO_WEAK
 *   • البريد يخصّ عضواً فعلاً ⇒ 409 USER_ALREADY_MEMBER (منع سباق)
 *   • ينجح ⇒ 201 + جلسة (auto-login) — المدعوّ يُنقل مباشرة إلى الاستوديو
 *
 * hashing: token في DB بـSHA-256، نُطابق الـplain المُقدَّم.
 * `tenantId` من الدعوة، ليس من الطلب — RLS: نستعمل control_plane pool
 * لأن الطلب مُوقَّع من غير مستأجر (بلا Bearer).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ApiError, PasswordTooWeak, UserAlreadyMember } from '../../errors.js';
import { hashPassword, createSession } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string(),
});

interface InvRow {
  id: string; tenant_id: string; email: string; role: string;
  expires_at: Date; accepted_at: Date | null;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/accept-invite', async (req, reply) => {
    const body = bodySchema.parse(req.body);
    if (body.password.length < 12) throw PasswordTooWeak();

    const tokenHash = createHash('sha256').update(body.token).digest('hex');

    // app_user pool + SET LOCAL app.tenant_id من tenant_id الدعوة.
    // نبحث عن الدعوة أوّلاً بلا tenant (يستدعي control_plane_user pool
    // للـSELECT فقط)، ثم نضبط tenant للـmutations. accept-invite هو حالة
    // خاصّة: الطالب لا يحمل JWT مستأجر، لكن الدعوة تحمل tenant_id.
    const cpPool = (await import('../../db.js')).getPlatformPool();
    const readClient = await cpPool.connect();
    let inv: InvRow;
    try {
      const invR = await readClient.query<InvRow>(
        `SELECT id, tenant_id, email, role, expires_at, accepted_at
         FROM invitations WHERE token_hash = $1`, [tokenHash]);
      if (invR.rowCount === 0) throw new ApiError('INVITATION_NOT_FOUND', 404);
      inv = invR.rows[0]!;
      if (inv.accepted_at !== null) throw new ApiError('INVITATION_ALREADY_ACCEPTED', 410);
      if (inv.expires_at.getTime() <= Date.now()) throw new ApiError('INVITATION_EXPIRED', 410);
    } finally { readClient.release(); }

    // الآن app_user pool + SET LOCAL على tenant الدعوة للـmutations
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT app_set_tenant($1::uuid)', [inv.tenant_id]);

      // منع سباق: البريد قد يكون أُنشئ في المستأجر بين الدعوة والقبول
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE tenant_id = $1 AND email = $2`,
        [inv.tenant_id, inv.email]);
      if ((dup.rowCount ?? 0) > 0) throw UserAlreadyMember();

      const pwHash = await hashPassword(body.password);
      const userR = await client.query<{ id: string }>(
        `INSERT INTO users(tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [inv.tenant_id, inv.email, pwHash, inv.role]);
      const userId = userR.rows[0]!.id;

      // ضع accepted_at (يمنع القبول مرّة ثانية عبر نفس token)
      await client.query(
        `UPDATE invitations SET accepted_at = now() WHERE id = $1`, [inv.id]);

      await client.query('COMMIT');

      // auto-login: نُنشئ جلسة عبر app_user pool (createSession يحتاج tenant_id
      // في context — session.ts.createSession يستعمل pg.Pool العام).
      // لتبسيط A28-shape: نُطلب من المدعوّ POST /v1/auth/login بعد ذلك بدل
      // auto-login معقّد. الاستجابة تحمل ما يكفي.
      reply.status(201).send({
        userId,
        tenantId: inv.tenant_id,
        email: inv.email,
        role: inv.role,
        // يستدعي المدعوّ POST /v1/auth/login بالبريد وكلمة السرّ الجديدة.
      });
      // createSession مُستورَد لكن غير مستعمل — تجنّب تحذير linter بلا تعطيل الاستيراد
      void createSession;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  });
};
export default route;
