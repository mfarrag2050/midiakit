/**
 * POST /v1/platform/auth/refresh (A28).
 *
 * تجديد رمز منصّة عبر refreshToken (7 أيام). يُبطل الرمز السابق وينشئ جديداً
 * (rotation عند كل تجديد — نمط قياسي).
 *
 * أخطاء: 401 REFRESH_TOKEN_INVALID (رمز غير معروف/منتهٍ/مُبطَل).
 * ملاحظة: refresh يستقبل platform refresh token فقط — رمز مستأجر (tenant)
 * لا يطابق لأن hash + platform_sessions جدول منفصل ⇒ يُرفض تلقائياً.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getPlatformPool } from '../../../db.js';
import { ApiError } from '../../../errors.js';
import {
  signPlatformAccessToken, newRefreshToken,
  PLATFORM_ACCESS_TTL_SECONDS, PLATFORM_REFRESH_TTL_SECONDS,
} from '../../../auth/platform-session.js';

const bodySchema = z.object({
  refreshToken: z.string().min(1),
});

interface SessionRow {
  id: string; platform_user_id: string; expires_at: Date; is_active: boolean;
}
interface UserRow { id: string; platform_role: 'owner'|'admin'|'viewer'; is_active: boolean }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/refresh', async (req, reply) => {
    const body = bodySchema.parse(req.body);
    const hash = createHash('sha256').update(body.refreshToken).digest('hex');

    const pool = getPlatformPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sess = await client.query<SessionRow>(
        `SELECT id, platform_user_id, expires_at, is_active
         FROM platform_sessions WHERE refresh_token_hash = $1`, [hash]);
      if (sess.rowCount === 0 || !sess.rows[0]!.is_active || sess.rows[0]!.expires_at < new Date()) {
        throw new ApiError('REFRESH_TOKEN_INVALID', 401);
      }
      const s = sess.rows[0]!;

      // نُبطل السابق (rotation): is_active=false
      await client.query(`UPDATE platform_sessions SET is_active = false WHERE id = $1`, [s.id]);

      // نُنشئ جلسة جديدة
      const user = await client.query<UserRow>(
        `SELECT id, platform_role, is_active FROM platform_users WHERE id = $1`, [s.platform_user_id]);
      if (user.rowCount === 0 || !user.rows[0]!.is_active) {
        throw new ApiError('REFRESH_TOKEN_INVALID', 401);
      }
      const u = user.rows[0]!;
      const refresh = newRefreshToken();
      const expiresAt = new Date(Date.now() + PLATFORM_REFRESH_TTL_SECONDS * 1000);
      const newSess = await client.query<{ id: string }>(
        `INSERT INTO platform_sessions(platform_user_id, refresh_token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [u.id, refresh.hash, expiresAt, req.headers['user-agent'] ?? null, req.ip]);
      const access = await signPlatformAccessToken(u.id, u.platform_role, newSess.rows[0]!.id);

      await client.query('COMMIT');
      reply.status(200).send({
        session: {
          accessToken: access,
          refreshToken: refresh.plain,
          expiresIn: PLATFORM_ACCESS_TTL_SECONDS,
          platformRole: u.platform_role,
          platformUserId: u.id,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  });
};
export default route;
