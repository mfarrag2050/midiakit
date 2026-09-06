/**
 * rate-limit-by-plan (A23) — وسيط عام يفرض حدّ طلب/دقيقة بحسب الباقة.
 *
 * قواعد §17 + قرارات المالك 2026-09-08:
 *   - `tenant:{id}` إن كان JWT صالحاً ⇒ حدّ الباقة من `getEffectiveLimits`
 *     (يُقرأ من cache 60s — plan-limits-cache)
 *   - `ip:{ip}` وإلا (ما قبل المصادقة: /auth/*, /webhooks/*) ⇒ 30/دقيقة
 *   - `/v1/health` مستثنى — المسار الحرفي وحده، لا نمط ولا بادئة
 *   - سلوك التجاوز: 429 `RATE_LIMIT_EXCEEDED` + Retry-After (docs/16 §17)
 *   - `TOO_MANY_ATTEMPTS` منفصل معنوياً (login attempts، A5) — يبقى
 *
 * التحقّق من JWT في `keyGenerator` كامل (verifyAccessToken). لماذا:
 *   - Fastify يشغّل route.preHandler بعد global hooks — لا نصل إلى req.auth
 *     من داخل rate-limit hook قبل authGuard
 *   - decode بلا توقيع = ثغرة: مهاجم بـtenantId مزيَّف يعزل نفسه في bucket
 *     منفصل ويتجاوز الحدّ. الفحص الكامل يمنعه (الرمز المزيَّف يسقط ⇒ IP)
 *   - التكلفة: HS256 verify ~<1ms. authGuard يُعيدها (تكرار مقبول للـMVP)
 */
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { verifyAccessToken } from '../auth/session.js';
import { getPool } from '../db.js';
import { getCachedRequestsPerMinute } from './plan-limits-cache.js';
import { ApiError } from '../errors.js';

/**
 * خطأ خاص برفض rate-limit يحمل retryAfter — يمرّ عبر error-handler كـApiError.
 * error-handler.toBody يجمع الاستجابة النهائية (يشمل retryAfter).
 */
class RateLimitExceededError extends ApiError {
  constructor(public readonly retryAfterSeconds: number) {
    super('RATE_LIMIT_EXCEEDED', 429);
  }
  override toBody(requestId?: string) {
    const body = super.toBody(requestId);
    (body.error as unknown as Record<string, unknown>)['retryAfter'] = this.retryAfterSeconds;
    return body;
  }
}

/** حدّ الطلبات لكل IP قبل المصادقة (auth endpoints, webhooks, refresh). */
export const PRE_AUTH_LIMIT_PER_MINUTE = 30;

// fastify-plugin يكسر الحاوية (encapsulation) — @fastify/rate-limit يستعمل
// hook onRoute الذي يُطلق فقط لـroutes المُسجَّلة داخل نفس الحاوية.
// من دون fp، routes /v1/* المسجَّلة في حاوية أخرى لا تحصل على rate-limit.
const rateLimitByPlan: FastifyPluginAsync = async (fastify) => {
  // مُخصَّص للـverify scripts: نُعطّل rate-limit عند فحص تذاكر أخرى
  // (verify:a21, a22, a18-*) لتفادي تداخل حدّ 60/دقيقة مع 100+ inject.
  // إفصاح: هذا يُعطّل الحدّ في العملية الحالية فقط عبر env var صريح.
  // verify:a23 نفسها لا تُعطّله — تختبر السلوك.
  if (process.env['RATE_LIMIT_DISABLE'] === '1') {
    fastify.log.warn('[rate-limit] DISABLED via RATE_LIMIT_DISABLE=1 (verify scripts)');
    return;
  }

  await fastify.register(rateLimit, {
    global: true,
    timeWindow: 60_000,
    keyGenerator: async (req) => {
      const auth = req.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        try {
          const claims = await verifyAccessToken(auth.slice(7));
          return `tenant:${claims.tenant_id}`;
        } catch {
          // JWT مزيَّف/منتهٍ ⇒ fallback إلى IP (يمنع bucket-spoofing)
        }
      }
      return `ip:${req.ip}`;
    },
    max: async (_req, key) => {
      const k = String(key);
      if (k.startsWith('tenant:')) {
        const tenantId = k.slice('tenant:'.length);
        try {
          return await getCachedRequestsPerMinute(getPool(), tenantId);
        } catch (err) {
          fastify.log.warn({ err, tenantId }, 'rate-limit: فشل قراءة حدّ الباقة، fallback إلى PRE_AUTH_LIMIT');
          return PRE_AUTH_LIMIT_PER_MINUTE;
        }
      }
      return PRE_AUTH_LIMIT_PER_MINUTE;
    },
    // ملاحظة: `/v1/health` مستثنى عبر route-level `config: { rateLimit: false }`
    // (في routes/health.ts) — @fastify/rate-limit v10 لا يقبل skip في global.
    // الاستثناء **على المسار الحرفي** — قرار المالك 2026-09-08. لا نمط
    // ولا بادئة. أي استثناء ثانٍ لاحقاً يُطلب صراحةً ويُبرَّر.
    //
    // errorResponseBuilder يجب أن يعيد Error (خصائصه statusCode+code) لا
    // كائناً عادياً — الكائن العادي يسقط عبر setErrorHandler إلى 500.
    // نستعمل ApiError الموحّد ليمرّ عبر error-handler ويشكّل الاستجابة §1.4.
    errorResponseBuilder: (_req, ctx) => new RateLimitExceededError(
      // ctx.after نصّ (`format('1 minute')` من ms package) — نستعمل ctx.ttl (ms).
      Math.ceil((ctx.ttl ?? 60_000) / 1000),
    ),
  });
};

export default fp(rateLimitByPlan, { name: 'rate-limit-by-plan' });
