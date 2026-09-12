/**
 * GET /v1/exports (200-EXPORT-HISTORY §٣) — سجلّ تصديرات المستأجر.
 * تنازلي بـcreated_at · بترقيم صفحات · viewer فما فوق.
 * RLS يعزل بنيويّاً · لا كشف عن مستأجر آخر.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

interface ExportRow {
  id: string; tenant_id: string; user_id: string | null;
  render_id: string; brand_kit_id: string | null; template_id: string | null;
  size: string; format: string; storage_key: string | null; size_bytes: string | null;
  status: string; error_code: string | null; created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    const q = querySchema.parse(req.query);
    const rows = await req.dbClient!.query<ExportRow>(
      `SELECT id, tenant_id, user_id, render_id, brand_kit_id, template_id,
              size, format, storage_key, size_bytes::text, status, error_code, created_at
       FROM exports
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [q.limit, q.offset],
    );
    const total = await req.dbClient!.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM exports`,
    );
    return {
      data: rows.rows.map((r) => ({
        id: r.id,
        renderId: r.render_id,
        userId: r.user_id,
        brandKitId: r.brand_kit_id,
        templateId: r.template_id,
        size: r.size,
        format: r.format,
        storageKey: r.storage_key,
        sizeBytes: r.size_bytes,
        status: r.status,
        errorCode: r.error_code,
        createdAt: r.created_at.toISOString(),
      })),
      total: Number(total.rows[0]!.n),
      limit: q.limit,
      offset: q.offset,
      hasMore: q.offset + rows.rowCount! < Number(total.rows[0]!.n),
    };
  });
};
export default route;
