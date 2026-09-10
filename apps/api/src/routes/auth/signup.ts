/**
 * POST /v1/auth/signup — إنشاء مستأجر جديد + owner user.
 * docs/16 §2.1.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signup } from '../../auth/session.js';
import { getPool } from '../../db.js';
import { PasswordTooWeak, EmailInvalid } from '../../errors.js';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  tenantName: z.string().min(1).max(100),
  locale: z.enum(['ar', 'mixed', 'en']).optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/signup', async (req, reply) => {
    let parsed;
    try {
      parsed = bodySchema.parse(req.body);
    } catch (err) {
      // z.string().min(12) — تحويل إلى PASSWORD_TOO_WEAK يدوياً
      if (String(err).includes('password')) throw PasswordTooWeak();
      if (String(err).includes('email')) throw EmailInvalid();
      throw err;
    }

    const result = await signup(getPool(), {
      email: parsed.email,
      password: parsed.password,
      tenantName: parsed.tenantName,
      locale: parsed.locale,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    reply.status(201).send({
      user: { id: result.userId, email: parsed.email, role: 'owner' },
      tenant: { id: result.tenantId, name: parsed.tenantName, plan: 'trial' },
      session: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  });
};

export default route;
