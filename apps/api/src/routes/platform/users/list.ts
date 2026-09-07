/**
 * GET /v1/platform/users (A28). platform user (viewer+ يقرأ، owner للـwrite).
 * يعيد كل مستخدمي المنصّة — بلا password_hash.
 */
import type { FastifyPluginAsync } from 'fastify';

interface Row {
  id: string; email: string; platform_role: string; is_active: boolean;
  created_at: Date; updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.platformAuthenticated }, async (req) => {
    const r = await req.platformDbClient!.query<Row>(
      `SELECT id, email, platform_role, is_active, created_at, updated_at
       FROM platform_users ORDER BY email`,
    );
    return {
      data: r.rows.map((row) => ({
        id: row.id, email: row.email, platformRole: row.platform_role,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });
};
export default route;
