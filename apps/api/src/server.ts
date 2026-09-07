/**
 * server — Fastify bootstrap.
 *
 * ترتيب plugins (حرج):
 *   1. helmet + cors + rate-limit (حماية)
 *   2. error-handler (يجب أن يُسجَّل مبكّراً)
 *   3. auth-guard decorator (إتاحته للـroutes)
 *   4. tenant-tx (preHandler + onSend/onError hooks)
 *   5. routes
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimitByPlan from './plugins/rate-limit-by-plan.js';
import { config } from './config.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import authGuardPlugin from './plugins/auth-guard.js';
import tenantTxPlugin from './plugins/tenant-tx.js';
import healthRoute from './routes/health.js';
import signupRoute from './routes/auth/signup.js';
import loginRoute from './routes/auth/login.js';
import refreshRoute from './routes/auth/refresh.js';
import logoutRoute from './routes/auth/logout.js';
import forgotPasswordRoute from './routes/auth/forgot-password.js';
import resetPasswordRoute from './routes/auth/reset-password.js';
import tenantGetRoute from './routes/tenant/get.js';
import tenantPatchRoute from './routes/tenant/patch.js';
import usersListRoute from './routes/users/list.js';
import usersGetRoute from './routes/users/get.js';
import usersInviteRoute from './routes/users/invite.js';
import usersUpdateRoute from './routes/users/update.js';
import usersDeleteRoute from './routes/users/delete.js';
import brandKitsListRoute from './routes/brand-kits/list.js';
import brandKitsGetRoute from './routes/brand-kits/get.js';
import brandKitsCreateRoute from './routes/brand-kits/create.js';
import brandKitsUpdateRoute from './routes/brand-kits/update.js';
import brandKitsDeleteRoute from './routes/brand-kits/delete.js';
import brandKitsFontAckRoute from './routes/brand-kits/font-ack.js';
import brandKitsLogoAckRoute from './routes/brand-kits/logo-ack.js';
import brandKitsAssetsVersionRoute from './routes/brand-kits/assets-version.js';
import assetsUploadUrlRoute from './routes/assets/upload-url.js';
import assetsFinalizeRoute from './routes/assets/finalize.js';
import assetsListRoute from './routes/assets/list.js';
import assetsGetRoute from './routes/assets/get.js';
import assetsRefreshUrlRoute from './routes/assets/refresh-url.js';
import assetsDeleteRoute from './routes/assets/delete.js';
import assetsDetectFacesRoute from './routes/assets/detect-faces.js';
import assetsPatchFacesRoute from './routes/assets/patch-faces.js';
import templatesListRoute from './routes/templates/list.js';
import templatesGetRoute from './routes/templates/get.js';
import templatesCreateRoute from './routes/templates/create.js';
import templatesUpdateRoute from './routes/templates/update.js';
import templatesDeleteRoute from './routes/templates/delete.js';
import projectsListRoute from './routes/projects/list.js';
import projectsGetRoute from './routes/projects/get.js';
import projectsCreateRoute from './routes/projects/create.js';
import projectsUpdateRoute from './routes/projects/update.js';
import projectsDeleteRoute from './routes/projects/delete.js';
import projectsStateRoute from './routes/projects/state.js';
import projectsTransitionsRoute from './routes/projects/transitions.js';
import projectsAssignRoute from './routes/projects/assign.js';
import annotationsListRoute from './routes/projects/annotations/list.js';
import annotationsCreateRoute from './routes/projects/annotations/create.js';
import annotationsUpdateRoute from './routes/projects/annotations/update.js';
import annotationsDeleteRoute from './routes/projects/annotations/delete.js';
import workflowsListRoute from './routes/workflows/list.js';
import workflowsGetRoute from './routes/workflows/get.js';
import workflowsCreateRoute from './routes/workflows/create.js';
import workflowsUpdateRoute from './routes/workflows/update.js';
import workflowsDeleteRoute from './routes/workflows/delete.js';
import rendersListRoute from './routes/renders/list.js';
import rendersGetRoute from './routes/renders/get.js';
import rendersCreateRoute from './routes/renders/create.js';
import rendersOutputRoute from './routes/renders/output.js';
import rendersBrandSnapshotRoute from './routes/renders/brand-snapshot.js';
import rendersTemplateSnapshotRoute from './routes/renders/template-snapshot.js';
import rendersCancelRoute from './routes/renders/cancel.js';
import rendersDeleteRoute from './routes/renders/delete.js';
import { makeRevisionsPlugin } from './routes/revisions/factory.js';
import platformAuthGuard from './plugins/platform-auth-guard.js';
import platformLoginRoute from './routes/platform/auth/login.js';
import platformLogoutRoute from './routes/platform/auth/logout.js';
import platformTenantsListRoute from './routes/platform/tenants/list.js';
import platformTenantsGetRoute from './routes/platform/tenants/get.js';
import platformTenantsUpdateRoute from './routes/platform/tenants/update.js';
import subscriptionGetRoute from './routes/subscription/get.js';
import subscriptionCheckoutRoute from './routes/subscription/checkout.js';
import subscriptionCancelRoute from './routes/subscription/cancel.js';
import subscriptionResumeRoute from './routes/subscription/resume.js';
import subscriptionInvoicesRoute from './routes/subscription/invoices.js';
import webhookSubscriptionRoute from './routes/webhooks/subscription.js';
import usageCurrentRoute from './routes/usage/current.js';
import usageHistoryRoute from './routes/usage/history.js';
import aiListRoute from './routes/ai/list.js';
import aiCreateRoute from './routes/ai/create.js';
import aiDeleteRoute from './routes/ai/delete.js';
import aiInvokeRoute from './routes/ai/invoke.js';
import { closePool, closePlatformPool } from './db.js';
import { closeQueues } from './queues/index.js';

export async function buildServer() {
  const loggerConfig = config.NODE_ENV === 'production'
    ? { level: 'info' }
    : {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      };
  const fastify = Fastify({
    logger: loggerConfig,
    trustProxy: true,
  });

  await fastify.register(helmet, { global: true });
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // A23 — rate-limit بحسب الباقة (§17). كان قبله 300/IP عام يعيد
  // TOO_MANY_ATTEMPTS. الآن: حدّ الباقة/دقيقة/مستأجر مع IP fallback
  // 30/دقيقة قبل المصادقة، ورمز RATE_LIMIT_EXCEEDED (§17 صريح).
  // checkLoginRateLimit في session.ts يبقى طبقة ثانية لـ/login تحديداً.
  await fastify.register(rateLimitByPlan);

  // A21 — رأس rawBody لكل طلب JSON (webhooks توقّع فوق البايتات الأصلية).
  // كلفة ثابتة (سلسلة إضافية على req). يستبدل parser الافتراضي.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    try {
      const json = (body as string).length > 0 ? JSON.parse(body as string) : {};
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(authGuardPlugin);
  await fastify.register(platformAuthGuard);
  await fastify.register(tenantTxPlugin);

  // Routes
  await fastify.register(async (v1) => {
    await v1.register(healthRoute);
    await v1.register(async (auth) => {
      await auth.register(signupRoute);
      await auth.register(loginRoute);
      await auth.register(refreshRoute);
      await auth.register(logoutRoute);
      await auth.register(forgotPasswordRoute);
      await auth.register(resetPasswordRoute);
    }, { prefix: '/auth' });

    await v1.register(async (t) => {
      await t.register(tenantGetRoute);
      await t.register(tenantPatchRoute);
    }, { prefix: '/tenant' });

    await v1.register(async (u) => {
      await u.register(usersListRoute);
      await u.register(usersGetRoute);
      await u.register(usersInviteRoute);
      await u.register(usersUpdateRoute);
      await u.register(usersDeleteRoute);
    }, { prefix: '/users' });

    await v1.register(async (bk) => {
      await bk.register(brandKitsListRoute);
      await bk.register(brandKitsGetRoute);
      await bk.register(brandKitsCreateRoute);
      await bk.register(brandKitsUpdateRoute);
      await bk.register(brandKitsDeleteRoute);
      await bk.register(brandKitsFontAckRoute);
      await bk.register(brandKitsLogoAckRoute);
      await bk.register(brandKitsAssetsVersionRoute);
    }, { prefix: '/brand-kits' });

    await v1.register(async (a) => {
      await a.register(assetsUploadUrlRoute);
      await a.register(assetsFinalizeRoute);
      await a.register(assetsListRoute);
      await a.register(assetsGetRoute);
      await a.register(assetsRefreshUrlRoute);
      await a.register(assetsDeleteRoute);
      await a.register(assetsDetectFacesRoute);
      await a.register(assetsPatchFacesRoute);
    }, { prefix: '/assets' });

    await v1.register(async (t) => {
      await t.register(templatesListRoute);
      await t.register(templatesGetRoute);
      await t.register(templatesCreateRoute);
      await t.register(templatesUpdateRoute);
      await t.register(templatesDeleteRoute);
    }, { prefix: '/templates' });

    await v1.register(async (p) => {
      await p.register(projectsListRoute);
      await p.register(projectsGetRoute);
      await p.register(projectsCreateRoute);
      await p.register(projectsUpdateRoute);
      await p.register(projectsDeleteRoute);
      await p.register(projectsStateRoute);
      await p.register(projectsTransitionsRoute);
      await p.register(projectsAssignRoute);
      await p.register(annotationsListRoute);
      await p.register(annotationsCreateRoute);
      await p.register(annotationsUpdateRoute);
      await p.register(annotationsDeleteRoute);
    }, { prefix: '/projects' });

    await v1.register(async (w) => {
      await w.register(workflowsListRoute);
      await w.register(workflowsGetRoute);
      await w.register(workflowsCreateRoute);
      await w.register(workflowsUpdateRoute);
      await w.register(workflowsDeleteRoute);
    }, { prefix: '/workflows' });

    await v1.register(async (r) => {
      await r.register(rendersListRoute);
      await r.register(rendersCreateRoute);
      await r.register(rendersGetRoute);
      await r.register(rendersOutputRoute);
      await r.register(rendersBrandSnapshotRoute);
      await r.register(rendersTemplateSnapshotRoute);
      await r.register(rendersCancelRoute);
      await r.register(rendersDeleteRoute);
    }, { prefix: '/renders' });

    // A20 Revisions — 3 endpoints × 5 موارد
    await v1.register(makeRevisionsPlugin({
      resourceType: 'brand_kit', table: 'brand_kits',
      restorableColumns: ['name', 'config'],
    }), { prefix: '/brand-kits' });
    await v1.register(makeRevisionsPlugin({
      resourceType: 'project', table: 'projects',
      restorableColumns: ['name', 'content', 'state', 'assignee_id', 'locale', 'workflow_id'],
    }), { prefix: '/projects' });
    await v1.register(makeRevisionsPlugin({
      resourceType: 'template', table: 'templates',
      restorableColumns: ['name', 'kind', 'definition'],
    }), { prefix: '/templates' });
    await v1.register(makeRevisionsPlugin({
      resourceType: 'user', table: 'users',
      restorableColumns: ['role', 'is_active'],
    }), { prefix: '/users' });
    await v1.register(makeRevisionsPlugin({
      resourceType: 'asset', table: 'assets',
      restorableColumns: ['metadata', 'faces', 'warnings', 'license_ack', 'ack_by', 'ack_at'],
    }), { prefix: '/assets' });

    // A27 — Platform (control plane)
    await v1.register(async (p) => {
      await p.register(async (auth) => {
        await auth.register(platformLoginRoute);
        await auth.register(platformLogoutRoute);
      }, { prefix: '/auth' });

      await p.register(async (t) => {
        await t.register(platformTenantsListRoute);
        await t.register(platformTenantsGetRoute);
        await t.register(platformTenantsUpdateRoute);
      }, { prefix: '/tenants' });
    }, { prefix: '/platform' });

    // A21 — Subscription + Webhooks
    await v1.register(async (s) => {
      await s.register(subscriptionGetRoute);
      await s.register(subscriptionCheckoutRoute);
      await s.register(subscriptionCancelRoute);
      await s.register(subscriptionResumeRoute);
      await s.register(subscriptionInvoicesRoute);
    }, { prefix: '/subscription' });

    await v1.register(async (w) => {
      await w.register(webhookSubscriptionRoute);
    }, { prefix: '/webhooks' });

    // A22 — Usage
    await v1.register(async (u) => {
      await u.register(usageCurrentRoute);
      await u.register(usageHistoryRoute);
    }, { prefix: '/usage' });

    // A24 — AI Integrations + Invoke (docs/16 §15)
    await v1.register(async (ai) => {
      await ai.register(async (integrations) => {
        await integrations.register(aiListRoute);
        await integrations.register(aiCreateRoute);
        await integrations.register(aiDeleteRoute);
      }, { prefix: '/integrations' });
      await ai.register(aiInvokeRoute, { prefix: '/invoke' });
    }, { prefix: '/ai' });
  }, { prefix: '/v1' });

  return fastify;
}

async function main(): Promise<void> {
  const fastify = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info({ signal }, 'shutting down');
    await fastify.close();
    await closePool();
    await closePlatformPool();
    await closeQueues();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await fastify.listen({ port: config.PORT, host: '127.0.0.1' });
    fastify.log.info(`▶ mk-api listening on http://127.0.0.1:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// إذا كان الملف نقطة الدخول
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
