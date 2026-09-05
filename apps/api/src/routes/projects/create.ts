/**
 * POST /v1/projects — إنشاء مشروع (docs/16 §7.3).
 * الدور: writer فما فوق.
 *
 * تحقّق مراجع (RLS يحمي، لكن نُميّز الرمز لـUX):
 *   - brand_kit_id → BRAND_KIT_NOT_FOUND
 *   - template_id  → TEMPLATE_NOT_FOUND (يشمل globals + tenant scope)
 *   - workflow_id  → WORKFLOW_NOT_FOUND (يُطلَق مع A15)
 *
 * locale: القائمة السداسية (§7.3). الافتراضي 'ar'. خارجها ⇒ 422 LOCALE_UNSUPPORTED.
 * state الافتراضي 'draft' (A15 يبدّل).
 *
 * PLAN_LIMIT_REACHED معلَن غير مُنفَّذ حتى A21 (خرائط plan → limits).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbProjectRow } from './shared/mapper.js';
import {
  BrandKitNotFound, TemplateNotFound, WorkflowNotFound, LocaleUnsupported,
} from '../../errors.js';

const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'tr', 'es', 'de'] as const;

const bodySchema = z.object({
  title: z.string().min(1).max(500),
  brand_kit_id: z.string().uuid(),
  template_id: z.string().uuid(),
  content: z.record(z.unknown()).optional(),
  locale: z.string().optional(),
  workflow_id: z.string().uuid().optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin', 'writer']);
    const parsed = bodySchema.parse(req.body);

    // locale
    const locale = parsed.locale ?? 'ar';
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) throw LocaleUnsupported();

    // brand_kit_id — RLS يقصر على tenant، غير موجود ⇒ 404
    const bk = await req.dbClient!.query<{ id: string }>(
      `SELECT id FROM brand_kits WHERE id = $1`, [parsed.brand_kit_id],
    );
    if (bk.rowCount === 0) throw BrandKitNotFound();

    // template_id — يشمل global (visible via RLS templates_select) و tenant
    const tpl = await req.dbClient!.query<{ id: string }>(
      `SELECT id FROM templates WHERE id = $1 AND deleted_at IS NULL`, [parsed.template_id],
    );
    if (tpl.rowCount === 0) throw TemplateNotFound();

    // workflow_id — اختياري في A14. الفحص إن قُدِّم (يُطلَق مع A15 لكن نتحقّق الآن).
    if (parsed.workflow_id) {
      const wf = await req.dbClient!.query<{ id: string }>(
        `SELECT id FROM workflows WHERE id = $1`, [parsed.workflow_id],
      );
      if (wf.rowCount === 0) throw WorkflowNotFound();
    }

    const ins = await req.dbClient!.query<DbProjectRow>(
      `INSERT INTO projects (tenant_id, brand_kit_id, template_id, workflow_id,
                             name, content, locale, created_by, state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'draft')
       RETURNING *`,
      [
        req.auth!.tenantId,
        parsed.brand_kit_id,
        parsed.template_id,
        parsed.workflow_id ?? null,
        parsed.title,
        JSON.stringify(parsed.content ?? {}),
        locale,
        req.auth!.userId,
      ],
    );
    reply.status(201).send(toFull(ins.rows[0]!));
  });
};

export default route;
