/**
 * POST /v1/platform/auth/login — منفصل عن /v1/auth/login.
 * يبحث في platform_users (لا users). ينشئ platform_session.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verify as argonVerify } from '@node-rs/argon2';
import { getPlatformPool } from '../../../db.js';
import {
  signPlatformAccessToken, newRefreshToken, PLATFORM_ACCESS_TTL_SECONDS, PLATFORM_REFRESH_TTL_SECONDS,
} from '../../../auth/platform-session.js';
import { InvalidCredentials, AccountDisabled } from '../../../errors.js';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (req, reply) => {
    const body = bodySchema.parse(req.body);

    // فتح اتصال platform (control_plane_user)
    const pool = getPlatformPool();
    const client = await pool.connect();
    try {
      const r = await client.query<{
        id: string; password_hash: string; platform_role: 'owner'|'admin'|'viewer'; is_active: boolean;
      }>(
        `SELECT id, password_hash, platform_role, is_active
         FROM platform_users WHERE email = $1`, [body.email],
      );
      if (r.rowCount === 0) throw InvalidCredentials();
      const u = r.rows[0]!;
      if (!u.is_active) throw AccountDisabled();

      const ok = await argonVerify(u.password_hash, body.password);
      if (!ok) throw InvalidCredentials();

      // إنشاء platform_session
      const refresh = newRefreshToken();
      const expiresAt = new Date(Date.now() + PLATFORM_REFRESH_TTL_SECONDS * 1000);
      const sess = await client.query<{ id: string }>(
        `INSERT INTO platform_sessions(platform_user_id, refresh_token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [u.id, refresh.hash, expiresAt, req.headers['user-agent'] ?? null, req.ip],
      );
      const sessionId = sess.rows[0]!.id;

      const access = await signPlatformAccessToken(u.id, u.platform_role, sessionId);

      reply.status(200).send({
        session: {
          accessToken: access,
          refreshToken: refresh.plain,
          expiresIn: PLATFORM_ACCESS_TTL_SECONDS,
          platformRole: u.platform_role,
          platformUserId: u.id,
        },
      });
    } finally { client.release(); }
  });
};
export default route;
