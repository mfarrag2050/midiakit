/**
 * GET /v1/health — فحص سريع (public).
 *
 * مستثنى من rate-limit (A23) — probe balancer/kubernetes قد يضرب كل ثانية،
 * فيستنفد PRE_AUTH_LIMIT في نصف دقيقة ويصير النقطة عمياء وقت الحاجة.
 * الاستثناء **صريح على المسار الحرفي** — قرار المالك 2026-09-08. لا نمط
 * ولا بادئة. أي استثناء ثانٍ لاحقاً يُطلب صراحةً ويُبرَّر.
 */
import type { FastifyPluginAsync } from 'fastify';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', {
    config: { rateLimit: false },
  }, async () => ({ status: 'ok', ts: new Date().toISOString() }));
};

export default route;
