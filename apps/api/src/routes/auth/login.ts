/**
 * POST /v1/auth/login — بريد + كلمة سر → tokens.
 * docs/16 §2.2.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { login } from '../../auth/session.js';
import { getPool } from '../../db.js';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (req, reply) => {
    const parsed = bodySchema.parse(req.body);
    const result = await login(getPool(), {
      email: parsed.email,
      password: parsed.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    // A8-FIX 2026-09-05: tenant.name + tenant.plan مضافة بحسب docs/16 §2.2.
    // AppShell كان يُضطرّ لاستدعاء GET /v1/tenant زائد للحصول عليهما.
    // نستعمل اتصالاً قصيراً مع SET LOCAL لجلب الحقلين — RLS يحرس.
    const pool = getPool();
    const c = await pool.connect();
    let tenantName = '';
    let tenantPlan = '';
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [result.tenantId]);
      const t = await c.query<{ name: string; plan: string }>(
        `SELECT name, plan FROM tenants WHERE id = $1`,
        [result.tenantId],
      );
      await c.query('COMMIT');
      tenantName = t.rows[0]?.name ?? '';
      tenantPlan = t.rows[0]?.plan ?? '';
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      c.release();
    }

    reply.status(200).send({
      user: { id: result.userId, role: result.role },
      tenant: { id: result.tenantId, name: tenantName, plan: tenantPlan },
      session: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  });
};

export default route;
