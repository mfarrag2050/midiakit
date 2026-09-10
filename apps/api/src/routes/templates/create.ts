/**
 * POST /v1/templates — إنشاء قالب خاصّ بالمستأجر (docs/16 §6.3).
 * الدور: admin+.
 *
 * definition يمرّ بـvalidateTemplate — قوالب معطوبة تُرفَض بـ400
 * TEMPLATE_SCHEMA_VIOLATION مع field.
 *
 * scope مفروض 'tenant' — العام لا يُنشأ عبر API (يُبذَر في هجرة).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validateTemplate, TemplateValidationError } from '@pf-mediakit/templates';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbTemplateRow } from './shared/mapper.js';
import { TemplateSchemaViolation } from '../../errors.js';

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(50),
  definition: z.record(z.unknown()),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const parsed = bodySchema.parse(req.body);

    // validateTemplate يرمي TemplateValidationError مع path
    try {
      validateTemplate(parsed.definition);
    } catch (err) {
      if (err instanceof TemplateValidationError) throw TemplateSchemaViolation(err.path);
      throw err;
    }

    const ins = await req.dbClient!.query<DbTemplateRow>(
      `INSERT INTO templates (scope, tenant_id, kind, name, definition)
       VALUES ('tenant', $1, $2, $3, $4::jsonb)
       RETURNING *`,
      [req.auth!.tenantId, parsed.kind, parsed.name, JSON.stringify(parsed.definition)],
    );
    reply.status(201).send(toFull(ins.rows[0]!));
  });
};

export default route;
