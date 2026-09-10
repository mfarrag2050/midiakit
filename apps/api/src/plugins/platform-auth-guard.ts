/**
 * platform-authenticated — حارس مصادقة منفصل للمنصّة (A27).
 *
 * الفصل الكامل عن auth-guard الحالي:
 *   - Pool مختلف (control_plane_user، لا app_user)
 *   - JWT بسرّ مختلف (PLATFORM_JWT_SECRET)
 *   - لا SET LOCAL app.tenant_id — control_plane_user يعبر RLS بسياسات
 *   - SET app.actor_id = platform_user.id — trigger revisions يسجّل
 *   - جلسات منفصلة (platform_sessions)
 *
 * L-61: نقطة عادية بـرمز مالك ⇒ 401 TOKEN_INVALID (JWT بـsub_type='platform'
 * لا يمرّ بـauth-guard الذي يقبل users JWTs بلا هذا الحقل).
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyPlatformAccessToken, getActivePlatformSession } from '../auth/platform-session.js';
import { getPlatformPool } from '../db.js';
import { ApiError, Unauthorized } from '../errors.js';
import type { PoolClient } from 'pg';

declare module 'fastify' {
  interface FastifyRequest {
    platformAuth?: {
      userId: string;
      platformRole: 'owner' | 'admin' | 'viewer';
      sessionId: string;
    } | undefined;
    platformDbClient?: PoolClient | undefined;
  }
  interface FastifyInstance {
    platformAuthenticated: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const platformAuthenticated = async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw Unauthorized();
    const token = header.slice(7);

    const claims = await verifyPlatformAccessToken(token);

    const pool = getPlatformPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // لا app_set_tenant — control_plane_user يعبر RLS بسياسات.
      // app.actor_id يُضبَط لـrevisions triggers (تسجّل من الذي غيَّر).
      await client.query('SELECT app_set_actor($1::uuid)', [claims.sub]);

      await getActivePlatformSession(client, claims.session_id);

      req.platformAuth = {
        userId: claims.sub as string,
        platformRole: claims.platform_role,
        sessionId: claims.session_id,
      };
      req.platformDbClient = client;
      // ملاحظة: onResponse/onError في tenant-tx يعتني بـreq.dbClient
      // فقط. platformDbClient يُدار في hook منفصل أدناه.
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      if (err instanceof ApiError) throw err;
      throw Unauthorized();
    }
  };

  // COMMIT/ROLLBACK/release لـplatformDbClient (نظير tenant-tx)
  fastify.addHook('onResponse', async (req, _reply) => {
    const c = req.platformDbClient;
    if (!c) return;
    req.platformDbClient = undefined;
    try { await c.query('COMMIT'); }
    catch (err) { req.log.error({ err }, 'platform COMMIT failed'); }
    finally { c.release(); }
  });
  fastify.addHook('onError', async (req, _reply, _err) => {
    const c = req.platformDbClient;
    if (!c) return;
    req.platformDbClient = undefined;
    try { await c.query('ROLLBACK').catch(() => {}); }
    finally { c.release(); }
  });

  fastify.decorate('platformAuthenticated', platformAuthenticated);
};

export default fp(plugin, { name: 'platformAuthenticated' });
