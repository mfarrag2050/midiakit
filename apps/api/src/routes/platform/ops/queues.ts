/**
 * GET /v1/platform/ops/queues — عمق الطوابير الأربعة (A25).
 *
 * platform-auth-guard + control_plane_user (نمط A27). يستعمل observe.ts
 * من renderer (مصدر واحد — استُعمل في A18.6 api-worker).
 */
import type { FastifyPluginAsync } from 'fastify';
import { queueDepth } from '@pf-mediakit/renderer/observe';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/queues', { preHandler: fastify.platformAuthenticated }, async () => {
    const depths = await queueDepth();
    return { data: depths };
  });
};
export default route;
