/**
 * POST /v1/auth/forgot-password — يطلب رمز استعادة (docs/16 §2.5).
 * يعيد 204 دائماً (لا كشف وجود الحساب).
 *
 * الإرسال عبر Emailer المُحقَن: SMTP في production (إلزامي عبر config)،
 * console log في dev. لا يترك رموز بيد المتلقّي بدون قناة.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requestPasswordReset } from '../../auth/session.js';
import { getPool } from '../../db.js';
import { config } from '../../config.js';
import { getEmailer } from '../../emailer.js';

const bodySchema = z.object({
  email: z.string().email(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/forgot-password', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const { tokenPlain } = await requestPasswordReset(getPool(), { email: parsed.email });
    if (tokenPlain) {
      const emailer = getEmailer(config);
      await emailer.send({
        to: parsed.email,
        subject: 'Reset your password',
        body:
          `Someone requested a password reset for this account.\n\n` +
          `To reset your password, use this token within 1 hour:\n\n` +
          `${tokenPlain}\n\n` +
          `If you did not request this, ignore this email.`,
      });
    }
    reply.status(204).send();
  });
};

export default route;
