// /v1/ai — docs/16 §15.
// **قاعدة أمن:** apiKey يُرسَل مرة عند POST، ولا يُعاد أبداً. الخادم
// يعيد apiKeyRef فقط. الواجهة تمسحه من الذاكرة بعد الإرسال.

import { request } from '../client';

export type AiProvider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'mistral';

export interface AiIntegration {
  readonly provider: AiProvider;
  readonly apiKeyRef: string;
  readonly enabled: boolean;
  readonly capabilities: readonly string[];
  readonly configuredAt: string;
  readonly configuredBy: string;
}

// **انحراف #S17-2 (معلَن):** GET /v1/ai/integrations لا يستعمل غلاف
// {data, nextCursor, hasMore} — يعيد `{data: []}` بارز فقط (المزوّدون
// ≤6). النمط استثنائي في مك-api ومكتوب في العقد §15.
export function listIntegrations(): Promise<{ readonly data: readonly AiIntegration[] }> {
  return request('/v1/ai/integrations');
}

/** إضافة تكامل — apiKey يُمرَّر مرة. الاستجابة تحمل apiKeyRef، لا مفتاح.
 * **لا تحفظ apiKey في state ولا في localStorage** — الحقل يُمحى من
 * الذاكرة بعد الإرسال (نلوّي الحبل على المتصفح: أي مرجع باقٍ يُصفَّر). */
export function upsertIntegration(input: {
  readonly provider: AiProvider;
  readonly apiKey: string;
  readonly capabilities?: readonly string[];
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

/** proxy عبر mk-api — لا يُخزَّن نص الطلب/الاستجابة على mk-api.
 * capability يُمرَّر داخل body (لا في المسار). */
export function invoke<TOut = unknown>(input: {
  readonly capability: string;
  readonly input: unknown;
}): Promise<{
  readonly output: TOut;
  readonly provider: AiProvider;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
}> {
  return request('/v1/ai/invoke', {
    method: 'POST',
    body: input,
  });
}
