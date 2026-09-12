/**
 * 221-AUTH-COVERAGE-GATE · قائمة المسارات العامّة المُعلَنة صراحةً.
 *
 * كل مسار في هذه القائمة **قرار مكتوب** — تفتحه بلا Bearer لسببٍ محدَّد.
 * أيّ مسارٍ في fastify.printRoutes() ولا حارس له · يجب إمّا أن يُضاف
 * حارساً · إمّا أن يُدرَج هنا مع سبب.
 *
 * الفاحص `scripts/check-auth-coverage.mjs` يقارن هذه القائمة بجدول
 * fastify الفعليّ. زيادة أو نقص ⇒ RED.
 */

/**
 * كل entry = { method, path, reason }. `method` قد يكون 'ANY' لتجميع
 * GET+HEAD (fastify يُنشئ HEAD تلقائيّاً لكل GET).
 */
export interface PublicRouteEntry {
  method: string; // GET · POST · DELETE · ANY
  path: string; // نصّ حرفيّ · لا regex
  reason: string; // لماذا عامّ · سطر واحد
}

export const PUBLIC_ROUTES: readonly PublicRouteEntry[] = [
  // Health/readiness — probes LB/kubernetes
  { method: 'GET', path: '/v1/health', reason: 'liveness probe · لا بيانات · rate-limit مُستثنى' },
  { method: 'GET', path: '/v1/ready', reason: 'readiness probe · فحوصات أسماء لا قيَم' },

  // Auth flows — signup/login/refresh/reset · rate-limited منفصلاً
  { method: 'POST', path: '/v1/auth/signup', reason: 'إنشاء حساب · rate-limited PRE_AUTH_LIMIT' },
  { method: 'POST', path: '/v1/auth/login', reason: 'تحقّق بيانات · rate-limited per-IP' },
  { method: 'POST', path: '/v1/auth/refresh', reason: 'refresh token في body · JWT مُنفصل' },
  { method: 'POST', path: '/v1/auth/forgot-password', reason: 'email في body · لا يكشف وجود · يُرسل رابط إن وُجد' },
  { method: 'POST', path: '/v1/auth/reset-password', reason: 'reset token في body' },

  // Invite acceptance — invite token في body
  { method: 'POST', path: '/v1/users/accept-invite', reason: 'invite token في body · JWT مُنفصل' },

  // Platform auth flows
  { method: 'POST', path: '/v1/platform/auth/login', reason: 'تسجيل platform admin · rate-limited' },
  { method: 'POST', path: '/v1/platform/auth/refresh', reason: 'refresh token في body' },

  // Webhooks — auth via X-Signature header (verifyWebhookSignature)
  { method: 'POST', path: '/v1/webhooks/subscription', reason: 'X-Signature في header · verifyWebhookSignature في payments/' },
];

export const PUBLIC_ROUTES_SET = new Set(
  PUBLIC_ROUTES.map((r) => `${r.method} ${r.path}`),
);
