/**
 * POST /v1/auth/forgot-password — يطلب رمز استعادة.
 * docs/16 §2.5. يعيد 204 دائماً (لا كشف).
 *
 * في الإنتاج: إرسال بريد بالرمز عبر SMTP. حالياً: الرمز مطبوع في السجل
 * (dev) — يُبدَّل بمزوّد بريد في مسار لاحق.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requestPasswordReset } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  email: z.string().email(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/forgot-password', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const { tokenPlain } = await requestPasswordReset(getPool(), { email: parsed.email });
    if (tokenPlain) {
      req.log.info(
        { email: parsed.email, tokenPreview: tokenPlain.slice(0, 12) + '...' },
        '[dev] password reset token issued — replace with SMTP send in production',
      );
    }
    reply.status(204).send();
  });
};

export default route;
