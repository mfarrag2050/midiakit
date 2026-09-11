/**
 * ai/index — factory لمزوّد AI. env-driven.
 *
 * AI_PROVIDER=fake (افتراضي)  ⇒ FakeProvider
 * AI_PROVIDER=<real>          ⇒ بلا تنفيذ حالياً (تذكرة منفصلة لكل مزوّد)
 */
import { FakeProvider } from './fake-provider.js';
import type { AiProvider } from './provider.js';

export type {
  AiProvider, InvokeRequest, InvokeResult, ProviderName, Capability,
} from './provider.js';
export { ProviderError, ProviderTimeoutError, ApiKeyValidationError } from './provider.js';
export { FakeProvider } from './fake-provider.js';
export { encryptApiKey, decryptApiKey, generateKeyRef } from './crypto.js';

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const which = process.env['AI_PROVIDER'] ?? 'fake';
  if (which === 'fake') { cached = new FakeProvider(); return cached; }
  throw new Error(`AI_PROVIDER='${which}' لم يُربَط بعد. استعمل 'fake' في dev/test.`);
}

/** للاختبار — إعادة ضبط factory. */
export function resetAiProvider(): void { cached = null; }

/** قدرات معروفة (§15.4). زيادة = تعديل هنا + fake-provider mock. */
export const KNOWN_CAPABILITIES: readonly string[] = [
  'headline-suggestions',
  'voice-over',
  'transcription-correction',
];
