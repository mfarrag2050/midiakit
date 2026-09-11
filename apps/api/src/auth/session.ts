/**
 * auth/session.ts — الطبقة الوحيدة للمصادقة (docs/17 §3.2 القيود الأربعة).
 *
 * **قاعدة حاكمة (G-P4-2 grep guard):** لا ملف آخر في `apps/api/src/**`
 * يستورد `jose` أو `@node-rs/argon2` أو `jsonwebtoken` أو `argon2`. كل
 * تحقّق كلمة سر أو رمز أو جلسة يمرّ من هنا.
 *
 * قيود ADR-011 الأربعة:
 *   1. طبقة واحدة تقرأ الجلسة (هذا الملف)
 *   2. argon2id بصيغة PHC المعيارية (يقبله Keycloak استيراداً)
 *   3. users.external_id موجود ✓ (A2)
 *   4. شكل JWT موثَّق (getJwtSchema أدناه — يُنسخ إلى docs/16 §1.2)
 *
 * إضافات أمنية:
 *   • تحديد محاولات الدخول (email + IP) — checkLoginRateLimit
 *   • رموز استعادة تنتهي خلال ساعة، تُستخدم مرة — request/complete
 *   • جلسات قابلة للإبطال في القاعدة — sessions table
 *   • مقارنة بتوقيت ثابت — verifyPassword يستعمل @node-rs/argon2
 *     الذي يستعمل timing-safe داخلياً؛ للـsecrets الخام نستعمل
 *     node:crypto.timingSafeEqual
 *   • لا كشف وجود الحساب — دوماً INVALID_CREDENTIALS بلا تمييز
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import type { DbPool, DbClient } from '../db.js';
import { config } from '../config.js';
import {
  ApiError,
  InvalidCredentials, AccountDisabled, TokenExpired, TokenInvalid,
  SessionRevoked, RefreshTokenInvalid, EmailTaken, ResetTokenExpired,
  ResetTokenUsed, ResetTokenInvalid, TooManyAttempts,
} from '../errors.js';

// ══════════════════════════════════════════════════════════════════
//  ثوابت
// ══════════════════════════════════════════════════════════════════

// Argon2id — الافتراضي في @node-rs/argon2 هو argon2id (نتركه ضمنياً
// بلا `algorithm:` لأن Algorithm enum مُخالف verbatimModuleSyntax).
// المعاملات صريحة تلبّي OWASP + Keycloak import compatibility:
//   memoryCost=19456 (19 MiB) · timeCost=2 · parallelism=1
// المخرج: $argon2id$v=19$m=19456,t=2,p=1$SALT$HASH (صيغة PHC).
const ARGON2_OPTIONS = {
  memoryCost: 19_456,  // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

// JWT
const JWT_ALG = 'HS256' as const;                    // صريح — لا نقبل ما في رأس الرمز
const JWT_ISS = 'pf-mediakit-api';
const JWT_AUD = 'pf-mediakit-studio';
const ACCESS_TTL_SECONDS = 15 * 60;                  // 15 دقيقة
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;       // 30 يوم

// Password reset
const RESET_TTL_SECONDS = 60 * 60;                   // 1 ساعة (owner requirement)

// Rate limit (per 15 min window)
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_MAX_PER_EMAIL = 10;                       // 10 محاولات فاشلة/بريد/15 دقيقة
const RATE_MAX_PER_IP = 30;                          // 30 محاولات فاشلة/IP/15 دقيقة

// Password
const PASSWORD_MIN = 12;

// JWT secret كـUint8Array (jose يتطلّبه)
const jwtSecret: Uint8Array = new TextEncoder().encode(config.SESSION_JWT_SECRET);

// ══════════════════════════════════════════════════════════════════
//  أنواع JWT (docs/16 §1.2 — نسخة موثَّقة)
// ══════════════════════════════════════════════════════════════════

/**
 * شكل access token JWT.
 * Keycloak يعيد إنتاج نفس الشكل عبر protocol mappers.
 *
 * ```
 * Header: { alg: "HS256", typ: "JWT" }
 * Payload:
 *   iss: "pf-mediakit-api"
 *   aud: "pf-mediakit-studio"
 *   sub: user_id (uuid)
 *   tenant_id: tenant uuid
 *   role: 'owner'|'admin'|'writer'|'editor'|'reviewer'|'approver'|'viewer'
 *   session_id: session uuid (لإبطال فوري)
 *   iat: unix seconds
 *   exp: unix seconds (iat + 900)
 * ```
 */
export interface AccessClaims {
  sub: string;              // user_id
  tenant_id: string;
  role: string;
  session_id: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export function getJwtSchema(): Record<string, string> {
  return {
    alg: JWT_ALG,
    iss: JWT_ISS,
    aud: JWT_AUD,
    access_ttl_seconds: String(ACCESS_TTL_SECONDS),
    refresh_ttl_seconds: String(REFRESH_TTL_SECONDS),
    required_claims: 'sub, tenant_id, role, session_id, iat, exp, iss, aud',
  };
}

// ══════════════════════════════════════════════════════════════════
//  كلمات السر — argon2id
// ══════════════════════════════════════════════════════════════════

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // @node-rs/argon2 verify يستعمل مقارنة بتوقيت ثابت داخلياً.
  return argonVerify(hash, password);
}

/**
 * hash وهمي لمقارنة بتوقيت ثابت حين البريد غير موجود — يمنع timing
 * attack (كشف وجود الحساب من زمن الاستجابة). يُولَّد مرّة عند الإقلاع.
 */
let _fakeHashCache: string | null = null;
async function getFakeHash(): Promise<string> {
  if (!_fakeHashCache) {
    _fakeHashCache = await hashPassword('this-hash-is-never-a-real-password_' + randomBytes(8).toString('hex'));
  }
  return _fakeHashCache;
}

// ══════════════════════════════════════════════════════════════════
//  JWT — jose
// ══════════════════════════════════════════════════════════════════

export async function signAccessToken(
  claims: Pick<AccessClaims, 'sub' | 'tenant_id' | 'role' | 'session_id'>,
): Promise<string> {
  return new SignJWT({
    tenant_id: claims.tenant_id,
    role: claims.role,
    session_id: claims.session_id,
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuer(JWT_ISS)
    .setAudience(JWT_AUD)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(jwtSecret);
}

/**
 * يفكّ ويتحقّق من JWT — يفرض الخوارزمية صراحةً، iss، aud، exp.
 * يرمي ApiError مناسبة (TOKEN_EXPIRED, TOKEN_INVALID).
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      algorithms: [JWT_ALG],       // صريح — لا نقبل ما في رأس الرمز
      issuer: JWT_ISS,
      audience: JWT_AUD,
    });
    // التحقّق من وجود الحقول المطلوبة (jose يفحص iss/aud/exp/iat).
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.tenant_id !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.session_id !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw TokenInvalid();
    }
    return payload as unknown as AccessClaims;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw TokenExpired();
    if (err instanceof ApiError) throw err;
    throw TokenInvalid();
  }
}

// ══════════════════════════════════════════════════════════════════
//  Refresh tokens
//
//  Refresh token = 32 بايت عشوائي مبعوث للعميل كـbase64url. القاعدة
//  تخزن SHA-256(token) — hash قابل للمقارنة بلا استعادة النصّ.
// ══════════════════════════════════════════════════════════════════

/**
 * صيغة refresh token: `${tenantId}.${randomBase64url}`.
 * السبب: sessions جدول tenant-scoped، البحث بالـhash يحتاج SET LOCAL
 * app.tenant_id قبله. من دون tenantId داخل الرمز، الخادم لا يعرف أيّ
 * مستأجر يُضبَط. البديل SECURITY DEFINER ثانية — مرفوض بالقاعدة الحاكمة.
 * tenantId في الرمز ليس تسرّباً — العميل يعرفه أصلاً من access token.
 */
function generateRefreshToken(tenantId: string): { plain: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const plain = `${tenantId}.${raw}`;
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRefreshToken(token: string): { tenantId: string; hash: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const tenantId = token.slice(0, dot);
  if (!UUID_RE.test(tenantId)) return null;
  const hash = createHash('sha256').update(token).digest('hex');
  return { tenantId, hash };
}

// ══════════════════════════════════════════════════════════════════
//  Sessions (DB-backed، قابلة للإبطال — لا JWT بلا حالة)
// ══════════════════════════════════════════════════════════════════

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;      // ثواني للـaccess
}

export interface SessionRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/**
 * ينشئ جلسة جديدة (يستهلك اتصال pool مع SET LOCAL app.tenant_id).
 * المتّصل يمرّر client لضمان أنّه ضمن المعاملة الصحيحة.
 */
export async function createSession(
  client: DbClient,
  params: { userId: string; tenantId: string; role: string; userAgent?: string | undefined; ip?: string | undefined },
): Promise<TokenPair> {
  const { plain: refreshPlain, hash: refreshHash } = generateRefreshToken(params.tenantId);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO sessions(tenant_id, user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [params.tenantId, params.userId, refreshHash, params.userAgent ?? null, params.ip ?? null, expiresAt],
  );
  const sessionId = inserted.rows[0]!.id;

  const accessToken = await signAccessToken({
    sub: params.userId,
    tenant_id: params.tenantId,
    role: params.role,
    session_id: sessionId,
  });

  return { accessToken, refreshToken: refreshPlain, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * يفحص أن الجلسة موجودة + غير مُبطلة + غير منتهية.
 * يُستدعى من auth middleware على كل طلب (لا JWT بلا حالة).
 */
export async function getActiveSession(
  client: DbClient,
  sessionId: string,
): Promise<SessionRecord> {
  const r = await client.query<SessionRecord>(
    `SELECT id, tenant_id, user_id, refresh_token_hash, expires_at, revoked_at
     FROM sessions
     WHERE id = $1`,
    [sessionId],
  );
  if (r.rowCount === 0) throw SessionRevoked();
  const s = r.rows[0]!;
  if (s.revoked_at) throw SessionRevoked();
  if (s.expires_at.getTime() < Date.now()) throw SessionRevoked();
  return s;
}

/**
 * يبطل جلسة (logout). لا يحذف — يحفظ للـaudit.
 */
export async function revokeSession(client: DbClient, sessionId: string): Promise<void> {
  await client.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}

export async function revokeAllUserSessions(client: DbClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/**
 * يبدّل refresh token بآخر جديد (rotation). يبطل القديم فوراً.
 * يرمي REFRESH_TOKEN_INVALID لو الرمز غير معروف أو مُبطل.
 */
export async function refreshSession(
  pool: DbPool,
  refreshToken: string,
): Promise<TokenPair> {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw RefreshTokenInvalid();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL app.tenant_id من الرمز (لا كشف — العميل يعرفه)
    await client.query('SELECT app_set_tenant($1::uuid)', [parsed.tenantId]);

    const r = await client.query<SessionRecord>(
      `SELECT id, tenant_id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM sessions
       WHERE refresh_token_hash = $1`,
      [parsed.hash],
    );
    if (r.rowCount === 0) throw RefreshTokenInvalid();
    const old = r.rows[0]!;
    if (old.revoked_at || old.expires_at.getTime() < Date.now()) {
      throw RefreshTokenInvalid();
    }

    const userR = await client.query<{ role: string; is_active: boolean }>(
      `SELECT role, is_active FROM users WHERE id = $1`,
      [old.user_id],
    );
    if (userR.rowCount === 0) throw RefreshTokenInvalid();
    const user = userR.rows[0]!;
    if (!user.is_active) throw AccountDisabled();

    // rotate: أبطل القديم، أنشئ جديداً
    await revokeSession(client, old.id);
    const tokens = await createSession(client, {
      userId: old.user_id,
      tenantId: old.tenant_id,
      role: user.role,
    });
    await client.query('COMMIT');
    return tokens;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  Rate limit — يقرأ من login_attempts (بلا RLS، عابر للمستأجرين)
// ══════════════════════════════════════════════════════════════════

/**
 * يفحص rate limit عبر SECURITY DEFINER `count_failed_login_attempts`.
 * لا يقرأ login_attempts مباشرة — app_user فقد SELECT عليه (A8+ hardening
 * لإغلاق ثغرة قراءة محاولات مستأجرين آخرين).
 */
export async function checkLoginRateLimit(
  pool: DbPool,
  params: { email?: string | undefined; ip?: string | undefined },
): Promise<void> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000);
  const r = await pool.query<{ email_count: string; ip_count: string }>(
    `SELECT email_count, ip_count
     FROM count_failed_login_attempts($1::citext, $2::inet, $3)`,
    [params.email ?? null, params.ip ?? null, windowStart],
  );
  const row = r.rows[0];
  // bigint في pg يعود كنصّ — نحوّل.
  const emailCount = Number(row?.email_count ?? 0);
  const ipCount = Number(row?.ip_count ?? 0);
  if (params.email && emailCount >= RATE_MAX_PER_EMAIL) throw TooManyAttempts();
  if (params.ip && ipCount >= RATE_MAX_PER_IP) throw TooManyAttempts();
}

/**
 * يسجّل محاولة دخول — pool.query مباشرة (auto-commit فرداً). يبقى
 * محفوظاً حتى لو fشلت المعاملة الرئيسية — سبب التصميم: login_attempts
 * هو مصدر الحقيقة لـrate limit؛ إن رُوجع مع الفشل، لن يتجمّع عدّاد.
 *
 * سياسة الأعمدة (user_id قبل email، owner design):
 *   • user_id: مضبوط حين وُجد المستخدم (نجاح أو فشل بعد lookup).
 *   • email: **دائماً** مضبوط للـrate limit (المفتاح الأساسي). التخوّف
 *     من تعداد الحسابات يبقى: البريد وحده لا يميّز موجود من غير موجود
 *     (كلاهما يُسجَّل). لا يوجد leak.
 */
export async function logLoginAttempt(
  pool: DbPool,
  params: { userId?: string | null | undefined; email?: string | null | undefined; ip?: string | null | undefined; success: boolean },
): Promise<void> {
  await pool.query(
    `INSERT INTO login_attempts(user_id, email, ip_address, success)
     VALUES ($1, $2, $3::inet, $4)`,
    [params.userId ?? null, params.email ?? null, params.ip ?? null, params.success],
  );
}

// ══════════════════════════════════════════════════════════════════
//  Signup + Login (تُستدعى من routes)
// ══════════════════════════════════════════════════════════════════

export interface SignupParams {
  email: string;
  password: string;
  tenantName: string;
  locale?: 'ar' | 'mixed' | 'en' | undefined;
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface SignupResult {
  userId: string;
  tenantId: string;
  tokens: TokenPair;
}

/**
 * ينشئ مستأجراً جديداً + مستخدماً owner. معاملة داخلية مُدارة.
 */
export async function signup(
  pool: DbPool,
  params: SignupParams,
): Promise<SignupResult> {
  const passwordHash = await hashPassword(params.password);
  const userId = randomUUID();
  const tenantId = randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. INSERT tenant — نولّد UUID كودياً لتجنّب RETURNING (سياسة SELECT
    //    ترفض قراءة الصف الجديد قبل SET LOCAL، فـRETURNING يفشل).
    await client.query(
      `INSERT INTO tenants(id, name, locale) VALUES ($1, $2, $3)`,
      [tenantId, params.tenantName, params.locale ?? 'ar'],
    );

    // 2. SET LOCAL لبقية العمليات
    await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);

    // 3. INSERT user — UUID مولّد كودياً (نفس السبب)
    try {
      await client.query(
        `INSERT INTO users(id, tenant_id, email, password_hash, role, locale)
         VALUES ($1, $2, $3, $4, 'owner', $5)`,
        [userId, tenantId, params.email, passwordHash, params.locale ?? 'ar'],
      );
    } catch (err: any) {
      if (err.code === '23505') throw EmailTaken();
      throw err;
    }

    // 4. INSERT session
    const tokens = await createSession(client, {
      userId,
      tenantId,
      role: 'owner',
      userAgent: params.userAgent,
      ip: params.ip,
    });

    await client.query('COMMIT');
    return { userId, tenantId, tokens };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface LoginParams {
  email: string;
  password: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
}

/**
 * يتحقّق من بريد + كلمة سر عبر find_user_by_email (SECURITY DEFINER).
 *
 * ضمان عدم كشف وجود الحساب:
 *   • بريد غير موجود → مقارنة hash وهمي بنفس التكلفة الحسابية
 *   • بريد موجود بكلمة سر خاطئة → مقارنة hash الحقيقي
 *   • كلاهما → نفس ApiError INVALID_CREDENTIALS بنفس التوقيت تقريباً
 */
export async function login(
  pool: DbPool,
  params: LoginParams,
): Promise<{ userId: string; tenantId: string; role: string; tokens: TokenPair }> {
  // 1. rate limit check — يستعمل pool مباشرة (بلا txn، مقاومة للـrollback)
  await checkLoginRateLimit(pool, { email: params.email, ip: params.ip });

  // 2. بحث cross-tenant عبر SECURITY DEFINER (بلا SET LOCAL — الدالة تتجاوز)
  const userR = await pool.query<{
    user_id: string; tenant_id: string; role: string; password_hash: string; is_active: boolean;
  }>(
    `SELECT user_id, tenant_id, role, password_hash, is_active FROM find_user_by_email($1::citext)`,
    [params.email],
  );

  // 3. verifyPassword — دائماً، حتى لو الحساب غير موجود (constant time)
  const user = userR.rows[0];
  const hashToCheck = user?.password_hash ?? (await getFakeHash());
  const passwordOk = await verifyPassword(params.password, hashToCheck);

  // 4. فشل — سجّل محاولة (auto-commit، لا يُروجع) ثم ارمِ
  if (!user || !passwordOk) {
    await logLoginAttempt(pool, {
      userId: user?.user_id ?? null,
      email: params.email,   // دائماً — للـrate limit
      ip: params.ip,
      success: false,
    });
    throw InvalidCredentials();
  }
  if (!user.is_active) {
    await logLoginAttempt(pool, {
      userId: user.user_id,
      email: params.email,
      ip: params.ip,
      success: false,
    });
    throw AccountDisabled();
  }

  // 5. نجاح — معاملة ذرية: SET LOCAL + last_login_at + جلسة + سجل ناجح
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [user.tenant_id]);
    await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.user_id]);
    const tokens = await createSession(client, {
      userId: user.user_id,
      tenantId: user.tenant_id,
      role: user.role,
      userAgent: params.userAgent,
      ip: params.ip,
    });
    await client.query('COMMIT');
    // سجل النجاح خارج txn (pool query)
    await logLoginAttempt(pool, {
      userId: user.user_id,
      email: params.email,
      ip: params.ip,
      success: true,
    });
    return { userId: user.user_id, tenantId: user.tenant_id, role: user.role, tokens };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  Password reset
//
//  رمز الاستعادة = 32 بايت عشوائي مبعوث للعميل. القاعدة تخزن SHA-256.
//  ينتهي خلال ساعة. يُستخدم مرة واحدة (used_at != NULL بعد الاستعمال).
//  تُلغى كل الجلسات النشطة للمستخدم عند نجاح الاستعادة.
// ══════════════════════════════════════════════════════════════════

export async function requestPasswordReset(
  pool: DbPool,
  params: { email: string },
): Promise<{ tokenPlain: string | null }> {
  // بحث عن المستخدم بلا كشف — pool.query (SECURITY DEFINER يتجاوز RLS)
  const userR = await pool.query<{ user_id: string; tenant_id: string; is_active: boolean }>(
    `SELECT user_id, tenant_id, is_active FROM find_user_by_email($1::citext)`,
    [params.email],
  );
  const user = userR.rows[0];
  if (!user || !user.is_active) {
    // لا نكشف — نعيد "نجاح" وهمي (الاستجابة نفسها في المتلقي).
    return { tokenPlain: null };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [user.tenant_id]);

    // إبطال أيّ رمز نشط سابق (partial unique يمنع أكثر من واحد)
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.user_id],
    );

    const raw = randomBytes(32);
    const tokenPlain = raw.toString('base64url');
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);

    await client.query(
      `INSERT INTO password_reset_tokens(tenant_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.tenant_id, user.user_id, tokenHash, expiresAt],
    );

    await client.query('COMMIT');
    return { tokenPlain };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * يستهلك رمز استعادة ويغيّر كلمة السر. يبطل كل الجلسات النشطة للمستخدم.
 *
 * يتطلّب email مع الرمز لأن password_reset_tokens tenant-scoped، فلا
 * يمكن البحث بـhash وحده بلا SET LOCAL app.tenant_id. البديل الوحيد
 * كان SECURITY DEFINER ثانية — مرفوض بالقاعدة الحاكمة (§القاعدة الثالثة).
 * نستعمل find_user_by_email الموجودة لجلب tenant_id ثم SET LOCAL.
 */
export async function completePasswordReset(
  pool: DbPool,
  params: { token: string; email: string; newPassword: string },
): Promise<void> {
  // 1. إيجاد المستخدم عبر SECURITY DEFINER (pool.query — بلا txn)
  const userR = await pool.query<{ user_id: string; tenant_id: string; is_active: boolean }>(
    `SELECT user_id, tenant_id, is_active FROM find_user_by_email($1::citext)`,
    [params.email],
  );
  const user = userR.rows[0];
  if (!user) throw ResetTokenInvalid();  // لا نكشف — نفس الخطأ لأيّ سبب فشل
  if (!user.is_active) throw ResetTokenInvalid();

  const newHash = await hashPassword(params.newPassword);
  const tokenHash = createHash('sha256').update(params.token).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [user.tenant_id]);

    // 2. البحث عن الرمز
    const tokenR = await client.query<{ id: string; expires_at: Date; used_at: Date | null }>(
      `SELECT id, expires_at, used_at FROM password_reset_tokens
       WHERE user_id = $1 AND token_hash = $2`,
      [user.user_id, tokenHash],
    );
    const tok = tokenR.rows[0];
    if (!tok) throw ResetTokenInvalid();
    if (tok.used_at) throw ResetTokenUsed();
    if (tok.expires_at.getTime() < Date.now()) throw ResetTokenExpired();

    // 3. تحديث كلمة السر + وسم الرمز مُستخدَم + إبطال كل الجلسات
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, user.user_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tok.id]);
    await revokeAllUserSessions(client, user.user_id);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════
//  Utility — constant-time string compare (للـsecrets الخام غير الـhash)
// ══════════════════════════════════════════════════════════════════

export function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
