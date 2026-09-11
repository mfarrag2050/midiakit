/**
 * GET /v1/tenant — معلومات المستأجر الحالي (docs/16 §3.1).
 * الدور: أيّ مصادَق.
 *
 * tenant_id ضمنيّ من الجلسة (RLS يقيّده تلقائياً)، لا يظهر في المسار.
 *
 * الانحرافات المُعلَنة عن العقد:
 *   • `id` = UUID خام (لا بادئة `tnt_...` — DB يستعمل uuid مباشرة)
 *   • `plan` enum: `trial|starter|studio|agency|api` — طابق docs/01
 *     §نموذج الإيراد و docs/16 §3.1 (PLAN-FIX 2026-09-05،
 *     migration 20260905110000).
 *   • `seats.limit` = null: خرائط plan→seat_limit معرَّفة في
 *     docs/01 (Starter 2 · Studio 5 · Agency 15 · API —)، لكن
 *     الفرض مؤجَّل إلى A21 بقرار docs/17:229 (العملاء الأوائل
 *     بحسابات يدوية لكشف الحدود الصحيحة قبل تثبيتها).
 */
import type { FastifyPluginAsync } from 'fastify';
import { NotFound } from '../../errors.js';

interface DbTenantRow {
  id: string;
  name: string;
  plan: string;
  locale: string;
  created_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    // GET tenants يُرجع سجلاً واحداً (RLS يفرض id = app.tenant_id)
    const r = await req.dbClient!.query<DbTenantRow>(
      `SELECT id, name, plan, locale, created_at FROM tenants LIMIT 1`,
    );
    if (r.rowCount === 0) throw NotFound(); // نظرياً مستحيل — الجلسة صالحة → المستأجر موجود
    const row = r.rows[0]!;

    // seats.used من عدد users في المستأجر (RLS يقيّد)
    const seatsR = await req.dbClient!.query<{ n: string }>(
      `SELECT count(*)::bigint AS n FROM users`,
    );
    const seatsUsed = Number(seatsR.rows[0]?.n ?? 0);

    return {
      id: row.id,
      name: row.name,
      plan: row.plan,
      locale: row.locale,
      createdAt: row.created_at.toISOString(),
      seats: { used: seatsUsed, limit: null as number | null },
    };
  });
};

export default route;
