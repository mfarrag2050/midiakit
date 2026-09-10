/**
 * tenant-tx — hooks عامّة لإدارة نهاية دورة حياة req.dbClient.
 *
 * authenticated preHandler يفتح المعاملة ويضبط req.dbClient. هذا الملف
 * يحرص على COMMIT / ROLLBACK / release في النهاية.
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';

declare module 'fastify' {
  interface FastifyRequest {
    dbClient?: PoolClient | undefined;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  // COMMIT في onResponse — يجري مرّة واحدة بعد إرسال الاستجابة.
  // نأخذ الاتصال في متغيّر محلّي قبل تصفيره لتجنّب re-entry.
  fastify.addHook('onResponse', async (req, _reply) => {
    const client = req.dbClient;
    if (!client) return;
    req.dbClient = undefined;
    try {
      await client.query('COMMIT');
    } catch (err) {
      req.log.error({ err }, 'COMMIT failed');
    } finally {
      client.release();
    }
  });

  fastify.addHook('onError', async (req, _reply, _err) => {
    const client = req.dbClient;
    if (!client) return;
    req.dbClient = undefined;
    try {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  });
};

export default fp(plugin, { name: 'tenant-tx' });
