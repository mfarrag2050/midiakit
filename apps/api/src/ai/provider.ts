/**
 * ai/provider — المحوّل الحاكم للـAI (A24 · docs/16 §15.0).
 *
 * قاعدة بنيوية: كل استدعاء لمزوّد AI يمرّ من هنا. بقية النظام يعرف
 * «capability مفعَّلة» و«مخرج» فقط — لا يذكر gemini/openai/anthropic/claude
 * باسمه. تبديل مزوّد = تعديل ملف واحد داخل ai/.
 *
 * الحارس `check:no-ai-provider-outside-ai` يفرض هذا آلياً.
 *
 * §15.4 القدرات المعتمَدة أوّلاً:
 *   headline-suggestions · voice-over · transcription-correction
 * القدرات تُوسَّع بالتذاكر.
 */

export type ProviderName = 'gemini' | 'openai' | 'claude' | 'elevenlabs' | 'google-tts' | 'azure';
export type Capability = 'headline-suggestions' | 'voice-over' | 'transcription-correction';

export interface InvokeRequest {
  capability: Capability;
  input: Record<string, unknown>;
  tenantId: string;
  projectId: string | null;
  preferredProvider: ProviderName | null;
}

export interface InvokeResult {
  output: Record<string, unknown>;
  provider: ProviderName;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface AiProvider {
  /**
   * يستدعي المزوّد بمفتاح `plainApiKey` (فكّ من DB في المسار قبل النداء).
   * يرمي `ProviderError` عند فشل المزوّد، أو `ProviderTimeoutError` عند
   * انتهاء المهلة. `output` capability-specific.
   *
   * لا يخزّن `input` أو `output` — يمرّان في الذاكرة فقط (§15.0 صريح).
   */
  invoke(req: InvokeRequest, plainApiKey: string): Promise<InvokeResult>;

  /**
   * التحقّق من صيغة المفتاح قبل الحفظ. يرمي `ApiKeyValidationError` إن رفضه
   * المزوّد. للـfake: يفحص طولاً غير صفري فقط.
   */
  validateApiKey(provider: ProviderName, plainApiKey: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly upstream?: unknown) {
    super(message);
    this.name = 'ProviderError';
  }
}
export class ProviderTimeoutError extends Error {
  constructor(message = 'provider timeout') { super(message); this.name = 'ProviderTimeoutError'; }
}
export class ApiKeyValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ApiKeyValidationError'; }
}
