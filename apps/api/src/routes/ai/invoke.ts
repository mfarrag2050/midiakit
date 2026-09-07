/**
 * POST /v1/ai/invoke/:capability (docs/16 §15.4). writer+.
 *
 * تسلسل ذرّي:
 *   1. تحقّق capability معروفة (KNOWN_CAPABILITIES)
 *   2. اختر مزوّداً مفعَّلاً يقدّمها (preferredProvider أو أوّل enabled)
 *   3. فكّ المفتاح من DB (AAD=tenant_id — نقل صفّ يفشل)
 *   4. استدعِ المحوّل (لا نصّ input/output محفوظ — §15.0)
 *   5. UPSERT usage.ai_tokens_in/out (شهر تقويمي · نمط A22)
 *   6. أَعِد {output, provider, tokensIn, tokensOut, durationMs}
 *
 * أخطاء: 400 UNKNOWN_CAPABILITY · 403 CAPABILITY_NOT_ENABLED ·
 *        502 PROVIDER_ERROR · 504 PROVIDER_TIMEOUT
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRoleIn } from '../../shared/role-guard.js';
import {
  UnknownCapability, CapabilityNotEnabled,
  ProviderError as ProviderErrorApi, ProviderTimeout,
} from '../../errors.js';
import {
  decryptApiKey, getAiProvider, KNOWN_CAPABILITIES,
  ProviderError, ProviderTimeoutError, type ProviderName, type Capability,
} from '../../ai/index.js';

const paramsSchema = z.object({ capability: z.string() });
const bodySchema = z.object({
  input: z.record(z.unknown()).optional().default({}),
  projectId: z.string().uuid().optional(),
  preferredProvider: z.string().optional(),
});

interface IntegrationRow {
  provider: string;
  api_key_encrypted: Buffer;
  enabled: boolean;
  capabilities: unknown;
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/:capability', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner', 'admin', 'writer', 'editor']);
    const { capability } = paramsSchema.parse(req.params);
    if (!KNOWN_CAPABILITIES.includes(capability)) throw UnknownCapability();
    const body = bodySchema.parse(req.body);

    const tenantId = req.auth!.tenantId;

    // اجلب المزوّدين المفعَّلين. capabilities jsonb: null/array.
    const rows = await req.dbClient!.query<IntegrationRow>(
      `SELECT provider, api_key_encrypted, enabled, capabilities
       FROM ai_integrations WHERE enabled = true`,
    );

    // اختيار المزوّد: preferredProvider إن كان مفعَّلاً ويحمل capability،
    // وإلا أول مزوّد مفعَّل يحملها (أو أول مفعَّل بلا تقييد capabilities).
    const supports = (row: IntegrationRow) => {
      const caps = Array.isArray(row.capabilities) ? row.capabilities as string[] : [];
      return caps.length === 0 || caps.includes(capability);
    };
    let chosen: IntegrationRow | null = null;
    if (body.preferredProvider) {
      chosen = rows.rows.find((r) => r.provider === body.preferredProvider && supports(r)) ?? null;
    }
    if (!chosen) chosen = rows.rows.find((r) => supports(r)) ?? null;
    if (!chosen) throw CapabilityNotEnabled();

    // فكّ المفتاح — AAD=tenantId يفشل إن كان الصفّ منقولاً
    const plainApiKey = decryptApiKey(chosen.api_key_encrypted, tenantId);

    // استدعاء المحوّل — لا نخزّن input/output (§15.0)
    let result;
    try {
      result = await getAiProvider().invoke({
        capability: capability as Capability,
        input: body.input,
        tenantId,
        projectId: body.projectId ?? null,
        preferredProvider: chosen.provider as ProviderName,
      }, plainApiKey);
    } catch (err) {
      if (err instanceof ProviderTimeoutError) throw ProviderTimeout();
      if (err instanceof ProviderError) throw ProviderErrorApi(err.message);
      throw err;
    }

    // فوترة: UPSERT usage للشهر التقويمي (نمط A22 — trigger موجود على renders،
    // للـAI نكتب مباشرة لأن الحساب داخل endpoint وليس تحويلة حالة).
    await req.dbClient!.query(
      `INSERT INTO usage(tenant_id, period, ai_tokens_in, ai_tokens_out)
       VALUES ($1, date_trunc('month', now())::date, $2, $3)
       ON CONFLICT (tenant_id, period) DO UPDATE SET
         ai_tokens_in = usage.ai_tokens_in + EXCLUDED.ai_tokens_in,
         ai_tokens_out = usage.ai_tokens_out + EXCLUDED.ai_tokens_out,
         updated_at = now()`,
      [tenantId, result.tokensIn, result.tokensOut],
    );

    return {
      output: result.output,
      provider: result.provider,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: result.durationMs,
    };
  });
};
export default route;
