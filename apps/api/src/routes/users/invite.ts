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
import { getEmailer } from '../../emailer.js';
import { config } from '../../config.js';
import {
  UserAlreadyMember, PendingInviteExists,
} from '../../errors.js';

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

    // 5. إرسال البريد (dev = طباعة، prod = SMTP)
    // بند مؤجَّل صريح: لا نقطة قبول في A10 — الرمز غير قابل للاستهلاك.
    const emailer = getEmailer(config);
    await emailer.send({
      to: inv.email,
      subject: 'You are invited (A10 pending — no accept endpoint yet)',
      body:
        `دعوة إلى ${inv.email} بدور ${inv.role}.\n\n` +
        `الرمز:\n${tokenPlain}\n\n` +
        `**A10 مؤجَّل:** نقطة قبول الدعوة (POST /v1/users/accept-invite)\n` +
        `غير مبنيّة بعد. الرمز مُنشأ لكن لا يعمل حتى تُبنى.\n` +
        `ينتهي: ${inv.expires_at.toISOString()}`,
    });

    reply.status(201).send({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at.toISOString(),
    });
  });
};

export default route;
