// /v1/ai — docs/16 §15.

import { request } from '../client';

export type AiProvider = 'openai' | 'anthropic' | 'google';

export interface AiIntegration {
  readonly provider: AiProvider;
  readonly apiKeyRef: string;
  readonly enabledCapabilities: readonly string[];
  readonly createdAt: string;
}

export function listIntegrations(): Promise<{ readonly integrations: readonly AiIntegration[] }> {
  return request('/v1/ai/integrations');
}

/** إضافة مفتاح مرة واحدة — الخادم لا يعيده أبداً (G-P4-5). */
export function upsertIntegration(input: {
  readonly provider: AiProvider;
  readonly apiKey: string;
  readonly enabledCapabilities?: readonly string[];
}): Promise<AiIntegration> {
  return request<AiIntegration>('/v1/ai/integrations', {
    method: 'POST',
    body: input,
  });
}

export function deleteIntegration(provider: AiProvider): Promise<void> {
  return request<void>(`/v1/ai/integrations/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
}

/** proxy — لا يُخزَّن نص الطلب/الاستجابة. */
export function invoke<TOut = unknown>(
  capability: string,
  input: unknown
): Promise<{
  readonly output: TOut;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
  readonly provider: AiProvider;
}> {
  return request(`/v1/ai/invoke/${encodeURIComponent(capability)}`, {
    method: 'POST',
    body: input,
  });
}
