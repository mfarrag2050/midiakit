/**
 * POST /v1/users/invite — دعوة مستخدم جديد (docs/16 §4.3).
 * الدور: admin+ (owner/admin).
 *
 * 6 أدوار قابلة للدعوة (owner مستثنى — يُنشأ بـsignup A5).
 *
 * الأخطاء:
 *   - 403 INSUFFICIENT_ROLE: طالب الدعوة ليس owner/admin
 *   - 409 USER_ALREADY_MEMBER: البريد موجود كمستخدم فعلي في المستأجر
 *   - 409 PENDING_INVITE_EXISTS: صفّ دعوة نشط (accepted_at NULL و expires_at > now)
 *     على نفس البريد. صفّ منتهٍ يُستبدَل صامتاً (DELETE-then-INSERT).
 *   - 422 SEATS_EXHAUSTED: **مُعلَن، غير مُنفَّذ حتى A21** (docs/17:229 —
 *     العملاء الأوائل بحسابات يدوية قبل تثبيت الحدود).
 *
 * الرمز في dev: يُطبَع مع نصّ صريح «لا نقطة قبول بعد — بند مؤجَّل».
 */
import type { FastifyPluginAsync } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  UserAlreadyMember, PendingInviteExists,
} from '../../errors.js';
import { ApiError } from '../../errors.js';
import { getEffectiveLimits } from '../../config/effective-limits.js';
import { getEmailer } from '../../emailer.js';
import { config } from '../../config.js';

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'writer', 'editor', 'reviewer', 'approver', 'viewer']),
});

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 أيام

interface DbInvitationRow {
  id: string;
  email: string;
  role: string;
  expires_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/invite', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const parsed = bodySchema.parse(req.body);

    // A21 — SEATS_EXHAUSTED: users المستأجر + الدعوات النشطة ≥ الحدّ.
    // منطق العدّ: seat مشغول = user موجود OR دعوة نشطة لم تُستهلَك بعد.
    const limits = await getEffectiveLimits(req.dbClient!, req.auth!.tenantId);
    if (limits.seatsLimit !== null) {
      const seatsInUse = await req.dbClient!.query<{ n: string }>(
        `SELECT (
           (SELECT count(*) FROM users) +
           (SELECT count(*) FROM invitations WHERE accepted_at IS NULL AND expires_at > now())
         )::bigint AS n`,
      );
      if (Number(seatsInUse.rows[0]!.n) >= limits.seatsLimit) {
        throw new ApiError('SEATS_EXHAUSTED', 422);
      }
    }

    // 1. USER_ALREADY_MEMBER — email موجود في users (نفس المستأجر عبر RLS)
    const existing = await req.dbClient!.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [parsed.email],
    );
    if ((existing.rowCount ?? 0) > 0) throw UserAlreadyMember();

    // 2. PENDING_INVITE_EXISTS — صفّ نشط (لم ينتهِ)
    const active = await req.dbClient!.query<{ id: string; expires_at: Date }>(
      `SELECT id, expires_at FROM invitations
       WHERE email = $1 AND accepted_at IS NULL AND expires_at > now()`,
      [parsed.email],
    );
    if ((active.rowCount ?? 0) > 0) throw PendingInviteExists();

    // 3. حذف الصفوف المنتهية لنفس البريد (تنظيف قبل INSERT لتفادي
    //    فهرس فريد جزئي WHERE accepted_at IS NULL)
    await req.dbClient!.query(
      `DELETE FROM invitations
       WHERE email = $1 AND accepted_at IS NULL AND expires_at <= now()`,
      [parsed.email],
    );

    // 4. INSERT invitation جديدة
    const raw = randomBytes(32);
    const tokenPlain = raw.toString('base64url');
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000);

    const inserted = await req.dbClient!.query<DbInvitationRow>(
      `INSERT INTO invitations(tenant_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, expires_at`,
      [req.auth!.tenantId, parsed.email, parsed.role, tokenHash, req.auth!.userId, expiresAt],
    );
    const inv = inserted.rows[0]!;

    // DEBT-1 §1 (2026-09-07): نقطة القبول بُنيَت
    // (POST /v1/users/accept-invite) — نُفعّل الإرسال. في dev بلا SMTP
    // ⇒ DevConsoleEmailer يطبع الرابط + الرمز في السجلّ (config.ts يُلزم
    // production بـSMTP، فلا رابط في سجلّ إنتاجي). tokenPlain ليس في
    // رسالة الاستجابة — يُمرَّر عبر البريد وحده.
    const acceptUrl = `${config.CORS_ORIGIN}/accept-invite?token=${tokenPlain}`;
    try {
      await getEmailer(config).send({
        to: parsed.email,
        subject: `دعوة للانضمام إلى فريقك على mk-studio`,
        body: `تلقّيتَ دعوة للانضمام بدور "${parsed.role}".\n\nاقبل الدعوة:\n${acceptUrl}\n\nالرابط صالح 7 أيام.`,
      });
    } catch (err) {
      // إن فشل الإرسال، الدعوة موجودة في DB لكن المدعوّ لن يعرف. نُسجّل
      // ولا نفشل الاستجابة (المدعو يستطيع إعادة إرسال يدوياً لاحقاً).
      req.log.warn({ err, email: parsed.email }, 'invite email failed');
    }

    reply.status(201).send({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at.toISOString(),
    });
  });
};

export default route;
