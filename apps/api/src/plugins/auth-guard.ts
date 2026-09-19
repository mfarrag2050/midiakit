/**
 * authenticated preHandler — يجمع JWT verify + session check + tx open
 * + SET LOCAL app.tenant_id في hook واحد.
 *
 * **الشرط الحاكم:** لا route محمي يستعمل pool.query مباشرة. كل استعلام
 * يجري عبر req.dbClient الذي يُضبَط هنا فقط. أيّ استعلام بلا hook يفشل
 * لأن السياق بلا SET LOCAL يُرفَض بـRLS.
 *
 * G-P4-2 يحمل اختباراً صريحاً: route يحاول pool.query بدل req.dbClient
 * → يفشل بـRLS.
 *
 * COMMIT/ROLLBACK يجريان في onSend/onError global hooks (tenant-tx.ts).
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, getActiveSession } from '../auth/session.js';
import { getPool } from '../db.js';
import { AccountSuspended, ApiError, Unauthorized } from '../errors.js';

/**
 * 380 · حسابٌ موقوفٌ (tenants.is_active=false) — سياسة القبول:
 * القراءة مسموحة، الكتابة مقفلة (اختيار «ب» من الخيارات الثلاثة في التذكرة
 * — الكلفة الأقل مقابل الحفاظ على حقّ العميل في التصدير والفوترة).
 * `POST /v1/auth/logout` مستثنى (لا حبس داخل جلسة موقوفة) وكذلك
 * `/v1/subscription/*` (فوترة/تجديد يجب أن تعمل حتى في التعليق).
 */
const SUSPENDED_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function isSuspensionExempt(method: string, url: string): boolean {
  // URL قد يحوي query · اعزل المسار.
  const path = url.split('?', 1)[0] ?? url;
  if (path === '/v1/auth/logout') return true;
  if (path.startsWith('/v1/subscription/')) return true;
  return !SUSPENDED_WRITE_METHODS.has(method.toUpperCase());
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string;
      role: string;
      sessionId: string;
    } | undefined;
  }
  interface FastifyInstance {
    /** يُلصق كـpreHandler على المسارات المصادَقة — يجمع auth + tx-open. */
    authenticated: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const authenticated = async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // 1. قراءة Bearer
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw Unauthorized();
    const token = header.slice(7);

    // 2. verify JWT
    const claims = await verifyAccessToken(token); // TOKEN_EXPIRED / TOKEN_INVALID

    // 3. فتح client + BEGIN + SET LOCAL على tenant من الرمز
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT app_set_tenant($1::uuid)', [claims.tenant_id]);
      // A20: app.actor_id — triggers على 5 جداول تكتب revisions مع actor_id.
      // بلا هذا SET، revisions.actor_id يصبح NULL (system-triggered).
      await client.query('SELECT app_set_actor($1::uuid)', [claims.sub]);

      // 4. فحص الجلسة النشطة (DB-backed — لا JWT بلا حالة)
      await getActiveSession(client, claims.session_id); // SESSION_REVOKED

      // 4.b · 380 · فحص tenants.is_active — إن كان موقوفاً وطلب كتابة
      // خارج الاستثناءات، ارفع ACCOUNT_SUSPENDED قبل بلوغ handler.
      if (!isSuspensionExempt(req.method, req.url)) {
        const t = await client.query<{ is_active: boolean }>(
          `SELECT is_active FROM tenants WHERE id = $1`,
          [claims.tenant_id],
        );
        if (t.rowCount === 0 || !t.rows[0]!.is_active) {
          throw AccountSuspended();
        }
      }

      // 5. تسليم السياق للـhandler
      req.auth = {
        userId: claims.sub,
        tenantId: claims.tenant_id,
        role: claims.role,
        sessionId: claims.session_id,
      };
      req.dbClient = client;
    } catch (err) {
      // ROLLBACK + release قبل رفع الخطأ (onError hook لن يرى req.dbClient)
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      if (err instanceof ApiError) throw err;
      throw Unauthorized();
    }
  };

  fastify.decorate('authenticated', authenticated);
};

export default fp(plugin, { name: 'authenticated' });
