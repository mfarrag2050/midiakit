/**
 * POST /v1/ai/integrations (docs/16 §15.2). owner|admin.
 * one-shot: apiKey في المدخل، مشفَّر بـAES-256-GCM في DB، لا يُعاد.
 * تحديث = UPSERT على (tenant_id, provider) — kref جديد يستبدل القديم.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import { InvalidProvider, ApiKeyValidationFailed } from '../../errors.js';
import {
  encryptApiKey, generateKeyRef, getAiProvider,
  ApiKeyValidationError, type ProviderName,
} from '../../ai/index.js';

const VALID_PROVIDERS: readonly ProviderName[] = [
  'gemini', 'openai', 'claude', 'elevenlabs', 'google-tts', 'azure',
];

const bodySchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  capabilities: z.array(z.string()).optional().default([]),
});

interface Row {
  provider: string;
  api_key_ref: string;
  enabled: boolean;
  capabilities: unknown;
  configured_by: string | null;
  updated_at: Date;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { preHandler: fastify.authenticated }, async (req, reply) => {
    requireRoleIn(req, ['owner', 'admin']);
    const body = bodySchema.parse(req.body);

    if (!(VALID_PROVIDERS as readonly string[]).includes(body.provider)) throw InvalidProvider();

    // التحقّق من المفتاح عبر المحوّل (§15.2 API_KEY_VALIDATION_FAILED)
    try {
      await getAiProvider().validateApiKey(body.provider as ProviderName, body.apiKey);
    } catch (err) {
      if (err instanceof ApiKeyValidationError) throw ApiKeyValidationFailed(err.message);
      throw err;
    }

    const tenantId = req.auth!.tenantId;
    const kref = generateKeyRef();
    const encrypted = encryptApiKey(body.apiKey, tenantId);

    const r = await req.dbClient!.query<Row>(
      `INSERT INTO ai_integrations(tenant_id, provider, api_key_ref, api_key_encrypted,
                                    enabled, capabilities, configured_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET
         api_key_ref = EXCLUDED.api_key_ref,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         enabled = EXCLUDED.enabled,
         capabilities = EXCLUDED.capabilities,
         configured_by = EXCLUDED.configured_by,
         updated_at = now()
       RETURNING provider, api_key_ref, enabled, capabilities, configured_by, updated_at`,
      [tenantId, body.provider, kref, encrypted, body.enabled,
       JSON.stringify(body.capabilities), req.auth!.userId],
    );
    const row = r.rows[0]!;
    reply.status(201).send({
      provider: row.provider,
      apiKeyRef: row.api_key_ref,
      enabled: row.enabled,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      configuredAt: row.updated_at.toISOString(),
      configuredBy: row.configured_by,
    });
  });
};
export default route;
