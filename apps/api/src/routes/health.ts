/**
 * GET /v1/health — فحص سريع (public).
 */
import type { FastifyPluginAsync } from 'fastify';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
};

export default route;
