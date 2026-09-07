/**
 * GET /v1/ai/integrations (docs/16 §15.1). admin+.
 * يعيد apiKeyRef فقط — **لا يعيد المفتاح أبداً** (§15.0 صريح).
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';

interface Row {
  provider: string;
  api_key_ref: string;
  enabled: boolean;
  capabilities: unknown;
  configured_by: string | null;
  updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin']);
    const r = await req.dbClient!.query<Row>(
      `SELECT provider, api_key_ref, enabled, capabilities, configured_by, updated_at
       FROM ai_integrations ORDER BY provider`,
    );
    return {
      data: r.rows.map((row) => ({
        provider: row.provider,
        apiKeyRef: row.api_key_ref,
        enabled: row.enabled,
        capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
        configuredAt: row.updated_at.toISOString(),
        configuredBy: row.configured_by,
      })),
    };
  });
};
export default route;
