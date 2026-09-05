/**
 * POST /v1/workflows (docs/16 §11.3). admin+.
 * kind ∈ (individual|small-team|full-agency|custom) — CHECK في DB.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { toFull, type DbWorkflowRow } from './shared/mapper.js';
import { validateWorkflowDefinition } from './shared/schema.js';

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['individual', 'small-team', 'full-agency', 'custom']),
  states: z.array(z.record(z.unknown())),
  transitions: z.array(z.record(z.unknown())),
  isDefault: z.boolean().optional(),
});

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const body = bodySchema.parse(req.body);
    const def = validateWorkflowDefinition({ states: body.states, transitions: body.transitions });

    // isDefault=true يزيل is_default من الآخرين (UNIQUE جزئي يمنع الاثنَين).
    if (body.isDefault) {
      await req.dbClient!.query(`UPDATE workflows SET is_default = false WHERE is_default = true`);
    }

    const ins = await req.dbClient!.query<DbWorkflowRow>(
      `INSERT INTO workflows (tenant_id, name, kind, states, transitions, is_default)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING *`,
      [
        req.auth!.tenantId,
        body.name,
        body.kind,
        JSON.stringify(def.states),
        JSON.stringify(def.transitions),
        body.isDefault ?? false,
      ],
    );
    reply.status(201).send(toFull(ins.rows[0]!));
  });
};
export default route;
