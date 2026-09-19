/**
 * POST /v1/auth/forgot-password — يطلب رمز استعادة (docs/16 §2.5).
 * يعيد 204 دائماً (لا كشف وجود الحساب).
 *
 * الإرسال عبر Emailer المُحقَن: SMTP في production (إلزامي عبر config)،
 * console log في dev. لا يترك رموز بيد المتلقّي بدون قناة.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requestPasswordReset, RESET_TTL_SECONDS } from '../../auth/session.js';
import { getPool } from '../../db.js';
import { config } from '../../config.js';
import { getEmailer } from '../../emailer.js';
import { formatForgotPasswordEmail } from '../../emails/messages.js';

const bodySchema = z.object({
  email: z.string().email(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/forgot-password', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const { tokenPlain } = await requestPasswordReset(getPool(), { email: parsed.email });
    if (tokenPlain) {
      const emailer = getEmailer(config);
      const msg = formatForgotPasswordEmail({
        token: tokenPlain,
        expiresInHours: Math.round(RESET_TTL_SECONDS / 3600),
      });
      await emailer.send({ to: parsed.email, subject: msg.subject, body: msg.body });
    }
    reply.status(204).send();
  });
};

export default route;
