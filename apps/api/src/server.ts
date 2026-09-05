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
import brandKitsListRoute from './routes/brand-kits/list.js';
import brandKitsGetRoute from './routes/brand-kits/get.js';
import brandKitsCreateRoute from './routes/brand-kits/create.js';
import brandKitsUpdateRoute from './routes/brand-kits/update.js';
import brandKitsDeleteRoute from './routes/brand-kits/delete.js';
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

    await v1.register(async (bk) => {
      await bk.register(brandKitsListRoute);
      await bk.register(brandKitsGetRoute);
      await bk.register(brandKitsCreateRoute);
      await bk.register(brandKitsUpdateRoute);
      await bk.register(brandKitsDeleteRoute);
    }, { prefix: '/brand-kits' });
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
