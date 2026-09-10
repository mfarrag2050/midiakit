/**
 * FakeProvider — للاختبار والتطوير. Deterministic، بلا شبكة.
 *
 * قابلية اختبار مسارات الفشل عبر env:
 *   AI_FAKE_FORCE=error    ⇒ invoke يرمي ProviderError دائماً
 *   AI_FAKE_FORCE=timeout  ⇒ يرمي ProviderTimeoutError دائماً
 *   AI_FAKE_FORCE=invalid  ⇒ validateApiKey يرمي ApiKeyValidationError
 *   AI_FAKE_FORCE=<unset>  ⇒ سلوك طبيعي (mock output)
 *
 * hooks الاختبار مطلوبة لتغطية مسارات docs/16 §15.4 (502 PROVIDER_ERROR،
 * 504 PROVIDER_TIMEOUT) — مسارات لا يعطيها مزوّد حقيقي عن طلب.
 */
import {
  type AiProvider, type InvokeRequest, type InvokeResult, type ProviderName,
  ProviderError, ProviderTimeoutError, ApiKeyValidationError,
} from './provider.js';

const MOCK_OUTPUTS: Record<string, (input: Record<string, unknown>) => Record<string, unknown>> = {
  'headline-suggestions': (input) => ({
    suggestions: [
      `عنوان مقترَح ١ — ${String((input as { seed?: string })['seed'] ?? 'اختبار')}`,
      'عنوان مقترَح ٢ — بلغة أطول قليلاً',
      'عنوان مقترَح ٣ — نسخة قصيرة',
    ],
  }),
  'voice-over': () => ({ audioUrl: 'mock://voice/output.wav', durationSeconds: 12.5 }),
  'transcription-correction': (input) => ({ corrected: String((input as { raw?: string })['raw'] ?? '') }),
};

export class FakeProvider implements AiProvider {
  async invoke(req: InvokeRequest, _plainApiKey: string): Promise<InvokeResult> {
    const force = process.env['AI_FAKE_FORCE'];
    if (force === 'error') throw new ProviderError('AI_FAKE_FORCE=error');
    if (force === 'timeout') throw new ProviderTimeoutError('AI_FAKE_FORCE=timeout');

    const mock = MOCK_OUTPUTS[req.capability];
    if (!mock) throw new ProviderError(`fake: no mock for capability ${req.capability}`);

    // tokens deterministic — بحسب طول input و output
    const inputLen = JSON.stringify(req.input).length;
    const output = mock(req.input);
    const outputLen = JSON.stringify(output).length;

    return {
      output,
      provider: (req.preferredProvider ?? 'gemini') as ProviderName,
      tokensIn: Math.ceil(inputLen / 4),
      tokensOut: Math.ceil(outputLen / 4),
      durationMs: 42,
    };
  }

  async validateApiKey(_provider: ProviderName, plainApiKey: string): Promise<void> {
    const force = process.env['AI_FAKE_FORCE'];
    if (force === 'invalid') throw new ApiKeyValidationError('AI_FAKE_FORCE=invalid');
    if (!plainApiKey || plainApiKey.length < 8) {
      throw new ApiKeyValidationError('key length < 8');
    }
  }
}
