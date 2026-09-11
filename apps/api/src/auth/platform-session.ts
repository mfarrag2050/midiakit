/**
 * platform-session — JWT + جلسات المنصّة (منفصلة عن users/sessions).
 *
 * الفصل الكامل:
 *   - سرّ JWT منفصل (PLATFORM_JWT_SECRET)
 *   - جدول platform_sessions منفصل
 *   - JWT بـclaim sub_type='platform' + platform_role
 *   - hashPassword المشترك مع users (argon2 نفسه — لا سبب لاختلاف)
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';
import { TokenExpired, TokenInvalid, SessionRevoked } from '../errors.js';
import type { PoolClient } from 'pg';

const PLATFORM_JWT_ALG = 'HS256';
const PLATFORM_ACCESS_TTL_SECONDS = 60 * 60;        // ساعة (أقصر من users — الحدّ الثاني)
const PLATFORM_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 أيام

interface PlatformClaims extends JWTPayload {
  sub: string;                     // platform_user.id
  sub_type: 'platform';
  platform_role: 'owner' | 'admin' | 'viewer';
  session_id: string;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(config.PLATFORM_JWT_SECRET);
}

export async function signPlatformAccessToken(
  platformUserId: string,
  platformRole: 'owner' | 'admin' | 'viewer',
  sessionId: string,
): Promise<string> {
  return await new SignJWT({
    sub_type: 'platform',
    platform_role: platformRole,
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: PLATFORM_JWT_ALG })
    .setSubject(platformUserId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PLATFORM_ACCESS_TTL_SECONDS)
    .setIssuer('mk-api-platform')
    .setAudience('mk-platform')
    .sign(getSecret());
}

export async function verifyPlatformAccessToken(token: string): Promise<PlatformClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'mk-api-platform',
      audience: 'mk-platform',
    });
    if (payload.sub_type !== 'platform') throw TokenInvalid();
    return payload as PlatformClaims;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'ERR_JWT_EXPIRED') throw TokenExpired();
    }
    throw TokenInvalid();
  }
}

export function newRefreshToken(): { plain: string; hash: string } {
  const plain = randomBytes(48).toString('base64url');
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

export async function getActivePlatformSession(
  client: PoolClient,
  sessionId: string,
): Promise<{ platform_user_id: string; is_active: boolean }> {
  const r = await client.query<{ platform_user_id: string; is_active: boolean; expires_at: Date }>(
    `SELECT platform_user_id, is_active, expires_at FROM platform_sessions WHERE id = $1`,
    [sessionId],
  );
  if (r.rowCount === 0) throw SessionRevoked();
  const row = r.rows[0]!;
  if (!row.is_active) throw SessionRevoked();
  if (row.expires_at.getTime() < Date.now()) throw TokenExpired();
  return row;
}

export { PLATFORM_ACCESS_TTL_SECONDS, PLATFORM_REFRESH_TTL_SECONDS };
