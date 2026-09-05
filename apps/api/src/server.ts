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
import rateLimit from '@fastify/rate-limit';
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
import { closePool } from './db.js';

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

  // Rate limit عام — 300/دقيقة/IP. حدود أدقّ للـauth endpoints يُطبَّقها
  // checkLoginRateLimit في session.ts. هذا خط دفاع إضافي.
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'TOO_MANY_ATTEMPTS',
        field: null,
        retryAfter: ctx.after,
      },
    }),
  });

  await fastify.register(errorHandlerPlugin);
  await fastify.register(authGuardPlugin);
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
    }, { prefix: '/projects' });
  }, { prefix: '/v1' });

  return fastify;
}

async function main(): Promise<void> {
  const fastify = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info({ signal }, 'shutting down');
    await fastify.close();
    await closePool();
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
