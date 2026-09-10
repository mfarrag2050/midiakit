/**
 * revisions factory — نمط عام على 5 موارد (docs/16 §10).
 *
 * لكل مورد ثلاث نقاط:
 *   GET  /:id/revisions            — سجل مرتَّب (§10.1)
 *   GET  /:id/revisions/:revId     — revision كامل + reconstructedState (§10.2)
 *   POST /:id/revisions/:revId/restore — استعادة (§10.3)
 *
 * makeRevisionsPlugin({ resourceType, table }) يعيد FastifyPluginAsync
 * يُسجَّل تحت prefix `/v1/{resource-plural}`.
 *
 * ملاحظة: `diff` مذكور في §10.1 (RFC 6902 JSON Patch)، لم يُنفَّذ في A20 —
 * فحسب `snapshot` كامل. hasSnapshot=true دائماً (سياسة الحجم في docs/14
 * بند لاحق). أُعلَن.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  NotFound, RevisionNotFound, ReasonTooShort, InvalidFilterField,
} from '../../errors.js';

export type ResourceType = 'brand_kit' | 'project' | 'template' | 'user' | 'asset';

export interface RevisionRoutesConfig {
  resourceType: ResourceType;
  /** جدول DB الفعلي (plural) — للـexistence check + للـRESTORE UPDATE */
  table: 'brand_kits' | 'projects' | 'templates' | 'users' | 'assets';
  /** الحقول القابلة للاستعادة (مسموحة في UPDATE). لا id/tenant_id/created_at. */
  restorableColumns: string[];
}

interface DbRevisionRow {
  id: string;
  tenant_id: string;
  resource_type: string;
  resource_id: string;
  actor_id: string | null;
  action: string;
  snapshot: Record<string, unknown>;
  reason: string | null;
  created_at: Date;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as { c?: string; i?: string };
    if (!p.c || !p.i) return null;
    return { createdAt: p.c, id: p.i };
  } catch { return null; }
}

const paramsSchema = z.object({ id: z.string().uuid() });
const paramsRevSchema = z.object({ id: z.string().uuid(), revId: z.string().uuid() });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
}).passthrough();

const ALLOWED_FILTER_KEYS = new Set(['filter[actorId]', 'filter[createdAt][gte]', 'filter[createdAt][lte]']);
const RESERVED = new Set(['limit', 'cursor', 'sort']);

const restoreBodySchema = z.object({
  reason: z.string(),
});

function toSummary(row: DbRevisionRow) {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorId: row.actor_id,
    op: row.action === 'create' ? 'insert' : row.action === 'update' ? 'update' : row.action === 'delete' ? 'delete' : row.action,
    diff: null,  // بند مؤجَّل — snapshot كامل دائماً
    hasSnapshot: true,
    createdAt: row.created_at.toISOString(),
  };
}

function toFull(row: DbRevisionRow) {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    op: row.action === 'create' ? 'insert' : row.action === 'update' ? 'update' : row.action === 'delete' ? 'delete' : row.action,
    reconstructedState: row.snapshot,  // snapshot كامل — الحالة نفسها
    diff: null,
    snapshot: row.snapshot,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function makeRevisionsPlugin(cfg: RevisionRoutesConfig): FastifyPluginAsync {
  return async (fastify) => {
    // GET /:id/revisions
    fastify.get('/:id/revisions', { preHandler: fastify.authenticated }, async (req) => {
      const { id } = paramsSchema.parse(req.params);
      const q = querySchema.parse(req.query);
      for (const k of Object.keys(req.query as Record<string, unknown>)) {
        if (RESERVED.has(k)) continue;
        if (!ALLOWED_FILTER_KEYS.has(k)) throw InvalidFilterField(k);
      }

      // تحقّق قراءة المورد (§10.1 «شرط له صلاحية قراءة المورد»)
      // RLS على المورد نفسه يحمي. users + assets + brand_kits ليس فيها deleted_at.
      const softDelTables = new Set(['projects', 'templates']);
      const softDelClause = softDelTables.has(cfg.table) ? ' AND deleted_at IS NULL' : '';
      const exists = await req.dbClient!.query(
        `SELECT 1 FROM ${cfg.table} WHERE id = $1${softDelClause}`,
        [id],
      );
      if ((exists.rowCount ?? 0) === 0) throw NotFound();

      const raw = req.query as Record<string, string | undefined>;
      const params: unknown[] = [cfg.resourceType, id];
      const where: string[] = [`resource_type = $1`, `resource_id = $2`];

      if (raw['filter[actorId]']) {
        params.push(raw['filter[actorId]']);
        where.push(`actor_id = $${params.length}`);
      }
      if (raw['filter[createdAt][gte]']) {
        params.push(new Date(raw['filter[createdAt][gte]']));
        where.push(`created_at >= $${params.length}`);
      }
      if (raw['filter[createdAt][lte]']) {
        params.push(new Date(raw['filter[createdAt][lte]']));
        where.push(`created_at <= $${params.length}`);
      }

      if (q.cursor) {
        const c = decodeCursor(q.cursor);
        if (c) {
          params.push(c.createdAt, c.id);
          where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
        }
      }

      const sql = `SELECT * FROM revisions WHERE ${where.join(' AND ')}
                   ORDER BY created_at DESC, id DESC LIMIT ${q.limit + 1}`;
      const r = await req.dbClient!.query<DbRevisionRow>(sql, params);
      const rows = r.rows;
      const hasMore = rows.length > q.limit;
      const trimmed = hasMore ? rows.slice(0, q.limit) : rows;

      return {
        data: trimmed.map(toSummary),
        nextCursor: hasMore
          ? encodeCursor(trimmed[trimmed.length - 1]!.created_at, trimmed[trimmed.length - 1]!.id)
          : null,
        hasMore,
      };
    });

    // GET /:id/revisions/:revId
    fastify.get('/:id/revisions/:revId', { preHandler: fastify.authenticated }, async (req) => {
      const { id, revId } = paramsRevSchema.parse(req.params);
      const r = await req.dbClient!.query<DbRevisionRow>(
        `SELECT * FROM revisions WHERE id = $1 AND resource_type = $2 AND resource_id = $3`,
        [revId, cfg.resourceType, id],
      );
      if (r.rowCount === 0) throw RevisionNotFound();
      return toFull(r.rows[0]!);
    });

    // POST /:id/revisions/:revId/restore
    fastify.post('/:id/revisions/:revId/restore', { preHandler: fastify.authenticated }, async (req) => {
      requireRoleIn(req, ['owner', 'admin']);
      const { id, revId } = paramsRevSchema.parse(req.params);
      const body = restoreBodySchema.parse(req.body);
      if (body.reason.trim().length < 10) throw ReasonTooShort();

      // جلب revision
      const rev = await req.dbClient!.query<DbRevisionRow>(
        `SELECT * FROM revisions WHERE id = $1 AND resource_type = $2 AND resource_id = $3`,
        [revId, cfg.resourceType, id],
      );
      if (rev.rowCount === 0) throw RevisionNotFound();
      const snapshot = rev.rows[0]!.snapshot;

      // تحقّق أن المورد ما زال موجوداً (soft-delete OK — نستعيد على أي حال)
      const exists = await req.dbClient!.query(`SELECT 1 FROM ${cfg.table} WHERE id = $1`, [id]);
      if ((exists.rowCount ?? 0) === 0) throw NotFound();

      // UPDATE بالأعمدة القابلة للاستعادة فقط
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const col of cfg.restorableColumns) {
        if (col in snapshot) {
          const value = snapshot[col];
          params.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
          const cast = typeof value === 'object' && value !== null ? '::jsonb' : '';
          sets.push(`${col} = $${params.length}${cast}`);
        }
      }
      if (sets.length === 0) throw RevisionNotFound();

      // نضيف reason إلى المشغِّل عبر revisions مباشرة — لكن trigger يكتب
      // revision update تلقائياً. نُدخل REASON في row السجل بعد UPDATE.
      params.push(id);
      await req.dbClient!.query(
        `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );

      // نُحدّث reason في آخر revision لهذا المورد (المُنشأ من trigger لتوّه)
      await req.dbClient!.query(
        `UPDATE revisions SET action = 'restore', reason = $1
         WHERE id = (SELECT id FROM revisions
                     WHERE resource_type = $2 AND resource_id = $3
                     ORDER BY created_at DESC LIMIT 1)`,
        [body.reason, cfg.resourceType, id],
      );

      // ارجع المورد المحدَّث
      const r2 = await req.dbClient!.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id]);
      return r2.rows[0];
    });
  };
}
