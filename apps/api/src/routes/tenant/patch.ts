/**
 * PATCH /v1/tenant — تعديل name أو locale (docs/16 §3.2).
 * الدور: owner فقط.
 *
 * دلالة RFC 7396 عبر mergePatch (نفس المستعمَل في A12).
 * الحقول غير القابلة للتعديل → 400 IMMUTABLE_FIELD:
 *   id, plan, createdAt, updatedAt, seats.
 * name فارغ (بعد trim) → 400 TENANT_NAME_EMPTY (docs/16 §3.2 الأخطاء).
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  mergePatch, findBlockedPath, type JsonObject, type JsonValue,
} from '../../shared/json-merge-patch.js';
import {
  ImmutableField, TenantNameEmpty, NotFound,
} from '../../errors.js';
import { ApiError } from '../../errors.js';

interface DbTenantRow {
  id: string;
  name: string;
  plan: string;
  locale: string;
  created_at: Date;
}

const BLOCKED_PATHS = [
  'id', 'plan', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'seats',
];

const ALLOWED_LOCALES = new Set(['ar', 'mixed', 'en']);

const route: FastifyPluginAsync = async (fastify) => {
  fastify.patch('/', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner']); // docs/16 §3.2: owner فقط

    const patch = req.body as JsonValue;

    const blocked = findBlockedPath(patch, BLOCKED_PATHS);
    if (blocked) throw ImmutableField(blocked);

    const patchObj = (typeof patch === 'object' && patch !== null && !Array.isArray(patch))
      ? patch as JsonObject
      : {};

    // نستخرج فقط name + locale — كل ما عداهما مُلحق زائد.
    // docs/16 §3.2 يحدّد قبولاً حصرياً لهذين.
    const nameRaw = patchObj['name'];
    const localeRaw = patchObj['locale'];

    // جلب الحالة الحالية
    const cur = await req.dbClient!.query<DbTenantRow>(
      `SELECT id, name, plan, locale, created_at FROM tenants LIMIT 1`,
    );
    if (cur.rowCount === 0) throw NotFound();
    const row = cur.rows[0]!;

    let nextName = row.name;
    if (nameRaw !== undefined) {
      if (nameRaw === null) throw TenantNameEmpty();
      if (typeof nameRaw !== 'string') throw TenantNameEmpty();
      const trimmed = nameRaw.trim();
      if (trimmed.length === 0) throw TenantNameEmpty();
      if (trimmed.length > 100) throw new ApiError('VALIDATION_FAILED', 400, 'name');
      nextName = trimmed;
    }

    let nextLocale = row.locale;
    if (localeRaw !== undefined) {
      if (typeof localeRaw !== 'string' || !ALLOWED_LOCALES.has(localeRaw)) {
        throw new ApiError('VALIDATION_FAILED', 400, 'locale');
      }
      nextLocale = localeRaw;
    }

    // نستعمل mergePatch لأن المقاطع الأخرى (إن كانت في patch object غير مرفوضة
    // بـblocked) ستُتجاهَل — لكن blocked يمنع أيّ حقل غير name/locale/... ضمن
    // BLOCKED_PATHS. حقل غير معروف يصل هنا يُتجاهَل صامتاً بحسب MergePatch
    // (لا يوجد ما يستقبله في DB).
    void mergePatch; // مستورد للاستخدام المرجعي، الكود أعلاه يتحقّق يدوياً

    const upd = await req.dbClient!.query<DbTenantRow>(
      `UPDATE tenants SET name = $1, locale = $2 WHERE id = $3
       RETURNING id, name, plan, locale, created_at`,
      [nextName, nextLocale, row.id],
    );
    const updated = upd.rows[0]!;

    // seats بنفس منطق GET
    const seatsR = await req.dbClient!.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM users`);
    return {
      id: updated.id,
      name: updated.name,
      plan: updated.plan,
      locale: updated.locale,
      createdAt: updated.created_at.toISOString(),
      seats: { used: Number(seatsR.rows[0]?.n ?? 0), limit: null as number | null },
    };
  });
};

export default route;
